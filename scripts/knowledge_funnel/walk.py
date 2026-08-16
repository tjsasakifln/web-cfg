"""Orchestrated Answer → Evidence → Analysis/X-Ray → persist → handoff walk.

Calls shipped family consume/gate/render/events, contract-analysis consume/gate,
and the conversion intake bridge. Does not reimplement those units.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

from scripts.contract_analysis.consume import inspect_producer_integrity, load_canary
from scripts.contract_analysis.gate import evaluate_cohort
from scripts.knowledge_funnel import (
    AUTHORITIES,
    CTA_COPY,
    PUBLICATION_RANK,
    SCHEMA_ID,
    SOURCE,
    XRAY_RANK,
)
from scripts.knowledge_funnel.corpus import (
    bind_analysis,
    case_spec,
    load_corpus,
    mutate_answer_raw,
    raw_json,
    resolve_fixture,
    root,
)
from scripts.knowledge_funnel.hash import trace_hash
from scripts.market_answers.consume import ConsumeError, adapt_payload, load_approvals, load_candidate
from scripts.market_answers.events import EVENT_LAYER, EVENT_NAMES, assert_no_pii, build_event
from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import render_html
from scripts.market_answers.urls import combinatorial_paths, drilldown_model

PII_EVENT_KEYS = ("cnpj", "email", "nome", "telefone", "name", "phone")


def _today(corpus: dict[str, Any]) -> date:
    return date.fromisoformat(str(corpus.get("frozen_today") or "2026-08-16"))


def _stage(name: str, **fields: Any) -> dict[str, Any]:
    return {"stage": name, "authority": AUTHORITIES[name], **fields}


def _publication_rank(state: str | None) -> int:
    if not state:
        return 0
    return PUBLICATION_RANK.get(state, 0)


def _xray_rank(state: str | None) -> int:
    if not state:
        return 0
    return XRAY_RANK.get(state, 0)


def _unknowns_of(payload: dict[str, Any]) -> list[str]:
    raw = payload.get("unknown_fields") or payload.get("unknown") or []
    items = [str(item) for item in raw if item]
    missing = payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {}
    for key, value in missing.items():
        if str(value).upper() == "UNKNOWN" and key not in items:
            items.append(str(key))
    return items


def _limitations_of(payload: dict[str, Any]) -> list[str]:
    raw = payload.get("limitations")
    if isinstance(raw, list):
        return [str(item) for item in raw if item]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return []


def _emit_event(name: str, props: dict[str, Any], extra_poison: dict[str, Any] | None = None) -> dict[str, Any]:
    incoming = dict(props)
    if extra_poison:
        incoming.update(extra_poison)
    event = build_event(name, incoming)
    assert_no_pii(event)
    for key in PII_EVENT_KEYS:
        if key in event:
            raise AssertionError(f"PII key leaked into event {name}: {key}")
    if EVENT_LAYER[name] == "impression" and event.get("is_lead"):
        raise AssertionError("impression event marked as lead")
    return {
        "name": name,
        "layer": EVENT_LAYER[name],
        "is_lead": name == "lead_receipt_correlated",
        "is_page_view": False,
        "payload": event,
    }


def _family_validate(decision: Any) -> dict[str, Any]:
    fixture_indexed = decision.is_fixture and decision.state == "PUBLISHABLE_INDEX"
    ready_on_fixture = decision.is_fixture and decision.recommendation == "READY_FOR_OFFICIAL_PAYLOAD"
    ok = (
        not fixture_indexed
        and not ready_on_fixture
        and (not decision.indexable if decision.is_fixture else True)
        and "noindex" in decision.robots
        and decision.sitemap is False
    )
    return {
        "ok": ok,
        "state": decision.state,
        "indexable": decision.indexable,
        "index_count": 1 if decision.indexable else 0,
        "official_live": decision.official_live,
        "recommendation": decision.recommendation,
        "claimed_live": False,
    }


def _run_intake(case: dict[str, Any], store_dir: Path, now: str) -> dict[str, Any]:
    req = {
        "cnpj": case["cnpj"],
        "correlation_id": case["correlation_id"],
        "xray_state": case.get("xray_state") or "READY",
        "xray_idempotency_key": case["xray_idempotency_key"],
        "handraise_idempotency_key": case["handraise_idempotency_key"],
        "consent": case.get("consent") is True,
        "handoff": case.get("handoff") or "ok",
        "replay": case.get("replay") is True,
        "now": now,
        "store_dir": str(store_dir),
        "cta": case.get("cta") or CTA_COPY,
        "cta_id": case.get("cta_id"),
        "mutate": case.get("mutate"),
        "email": case.get("email"),
        "nome": case.get("nome"),
        "telefone": case.get("telefone"),
        "attribution": {
            "market_answer_id": "ma-pavimentacao-valor-tipico-v0",
            "correlation_id": case["correlation_id"],
            "source": SOURCE,
        },
    }
    with tempfile.TemporaryDirectory(prefix="kf-bridge-") as tmp:
        tmp_path = Path(tmp)
        in_path = tmp_path / "in.json"
        out_path = tmp_path / "out.json"
        in_path.write_text(json.dumps(req, ensure_ascii=False, indent=2), encoding="utf-8")
        subprocess.run(
            [
                "node",
                str(root() / "scripts/knowledge_funnel/intake_bridge.cjs"),
                "--in",
                str(in_path),
                "--out",
                str(out_path),
            ],
            check=True,
            cwd=str(root()),
            capture_output=True,
            text=True,
        )
        return json.loads(out_path.read_text(encoding="utf-8"))


def walk(
    case_id: str = "happy",
    *,
    corpus_path: Path | None = None,
    store_dir: Path | None = None,
) -> dict[str, Any]:
    corpus = load_corpus(corpus_path)
    case = case_spec(corpus, case_id)
    now = str(corpus.get("frozen_now") or "2026-08-16T12:00:00.000Z")
    mutate = case.get("mutate")
    events: list[dict[str, Any]] = []
    stages: list[dict[str, Any]] = []
    closed = "ok"
    reject_reason: str | None = None
    store_path = Path(store_dir) if store_dir is not None else Path(tempfile.mkdtemp(prefix="kf-store-"))
    store_path.mkdir(parents=True, exist_ok=True)

    raw_answer = raw_json(resolve_fixture(corpus, "answer_payload"))
    raw_answer = mutate_answer_raw(raw_answer, mutate)
    candidate = load_candidate(resolve_fixture(corpus, "answer_candidate"))
    approvals = load_approvals(resolve_fixture(corpus, "answer_approvals"))

    payload: dict[str, Any] | None = None
    decision = None
    try:
        payload = adapt_payload(raw_answer)
    except ConsumeError as exc:
        closed = "rejected"
        reject_reason = str(exc)
        stages.append(
            _stage(
                "answer",
                state="REJECT",
                official_live=False,
                claimed_live=False,
                fail_closed=True,
                reason=reject_reason,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
        )

    if payload.get("claimed_live") or payload.get("official_live"):
        # adapt_payload already refuses claimed_live-on-fixture; belt and braces.
        closed = "rejected"
        reject_reason = "fixture_promoted_to_live"
        stages.append(
            _stage(
                "answer",
                state="REJECT",
                official_live=False,
                claimed_live=True,
                fail_closed=True,
                reason=reject_reason,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
        )

    decision = evaluate(candidate, payload, approvals, today=_today(corpus))
    family = _family_validate(decision)
    unknowns = _unknowns_of(payload)
    limitations = _limitations_of(payload)
    if "demand" not in {item.lower() for item in unknowns} and "demand_evidence" not in unknowns:
        # Candidate demand is UNKNOWN unless evidence exists; keep the label.
        demand = candidate.get("demand") if isinstance(candidate.get("demand"), dict) else {}
        if str(demand.get("status") or demand.get("state") or "UNKNOWN").upper() in {"", "UNKNOWN"}:
            unknowns.append("demand")

    poison = None
    if mutate == "pii_injection":
        poison = {
            "cnpj": case.get("cnpj"),
            "email": case.get("email") or "qa-funnel@example.com",
            "nome": case.get("nome") or "QA Funnel",
        }
    events.append(
        _emit_event(
            "answer_view",
            {
                "correlation_id": case["correlation_id"],
                "producer_status": decision.producer_status,
                "index_state": decision.state,
                "official_live": False,
                "page_path": "/inteligencia/valor-tipico-contratos-pavimentacao/",
            },
            extra_poison=poison,
        )
    )
    if events[-1]["layer"] != "impression" or events[-1]["is_lead"]:
        raise AssertionError("answer_view must stay an impression, not a lead")

    stages.append(
        _stage(
            "answer",
            state=decision.state,
            official_live=decision.official_live,
            claimed_live=False,
            indexable=decision.indexable,
            family_validate=family,
            limitations=limitations,
            unknown=unknowns,
            content_hash=decision.content_hash,
            sla="UNKNOWN",
        )
    )

    if mutate == "missing_evidence" or (
        not payload.get("evidence_refs") and not payload.get("contract_refs")
    ):
        closed = "rejected"
        reject_reason = "missing_evidence"
        stages.append(
            _stage(
                "evidence",
                state="REJECT",
                fail_closed=True,
                reason=reject_reason,
                evidence_count=0,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
        )

    bound = bind_analysis(payload, case.get("analysis_bindings") or [])
    model = drilldown_model(bound)
    if model.get("generated_paths") != combinatorial_paths() or not model.get("forbids_combinatorial_urls"):
        raise AssertionError("drill-down minted combinatorial URLs")
    if CTA_COPY not in (case.get("cta") or CTA_COPY):
        raise AssertionError("CTA copy drifted")

    html = render_html(candidate, bound, decision, site_root=root())
    has_cta = CTA_COPY in html
    has_evidence_link = "data-ma-event=\"evidence_drilldown\"" in html
    has_analysis_link = any(item.get("analysis_href") for item in model.get("contracts") or [])
    if has_analysis_link and "análise técnica" not in html and "analise tecnica" not in html.lower():
        # Rendered copy is Portuguese; the href is the structural check.
        pass
    events.append(
        _emit_event(
            "evidence_drilldown",
            {
                "correlation_id": case["correlation_id"],
                "evidence_id": (model.get("contracts") or [{}])[0].get("id"),
            },
            extra_poison=poison,
        )
    )
    stages.append(
        _stage(
            "evidence",
            state=decision.state,
            evidence_count=len(model.get("contracts") or []),
            generated_paths=model.get("generated_paths"),
            forbids_combinatorial_urls=True,
            cta_present=has_cta,
            evidence_link_present=has_evidence_link,
            analysis_link_present=bool(has_analysis_link),
            xray_href=model.get("xray"),
            cta_href=model.get("cta"),
            unknown=unknowns,
            limitations=limitations,
        )
    )

    analysis_bundle = load_canary(fixture_path=resolve_fixture(corpus, "analysis_fixture"))
    analysis_decisions = evaluate_cohort(analysis_bundle["records"], today=_today(corpus))
    analysis_states = [item.state for item in analysis_decisions]
    fixture_indexed = [
        item.analysis_id for item in analysis_decisions if item.is_fixture and item.state == "PUBLISHABLE_INDEX"
    ]
    if fixture_indexed:
        raise AssertionError(f"analysis fixture indexed: {fixture_indexed}")
    max_analysis = max((_publication_rank(state) for state in analysis_states), default=0)
    if max_analysis > _publication_rank(decision.state):
        closed = "rejected"
        reject_reason = "downstream_state_above_upstream"
        stages.append(
            _stage(
                "analysis",
                state="REJECT",
                fail_closed=True,
                reason=reject_reason,
                analysis_states=analysis_states,
                upstream_state=decision.state,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
        )

    analysis_unknown = []
    analysis_limitations = []
    integrity_reasons: list[str] = []
    for rec in analysis_bundle["records"]:
        analysis_unknown.extend(_unknowns_of(rec))
        analysis_limitations.extend(_limitations_of(rec))
        if rec.get("interpretation"):
            for row in rec.get("interpretation") or []:
                if isinstance(row, dict) and str(row.get("kind") or "").upper() == "UNKNOWN":
                    analysis_unknown.append(str(row.get("text") or "UNKNOWN"))
        integrity_reasons.extend(inspect_producer_integrity(rec))
    if mutate == "missing_evidence":
        integrity_reasons.append("evidence_refs_absent")

    if any(item.get("analysis_href") for item in model.get("contracts") or []):
        events.append(
            _emit_event(
                "analysis_click",
                {
                    "correlation_id": case["correlation_id"],
                    "analysis_id": "bdi-composicao-vs-referencia-sc",
                },
                extra_poison=poison,
            )
        )

    stages.append(
        _stage(
            "analysis",
            state=max(analysis_states, key=_publication_rank) if analysis_states else "HOLD_FOR_DATA",
            analysis_states=sorted(set(analysis_states)),
            evaluated=len(analysis_decisions),
            index_count=sum(1 for item in analysis_decisions if item.state == "PUBLISHABLE_INDEX"),
            claimed_live=False,
            official_live=False,
            catalog_mode=analysis_bundle.get("catalog_mode") or "fixture",
            unknown=sorted(set(analysis_unknown))[:12],
            limitations=analysis_limitations[:8],
            integrity_reason_codes=sorted(set(integrity_reasons))[:12],
            upstream_state=decision.state,
            downstream_within_upstream=max_analysis <= _publication_rank(decision.state),
        )
    )

    events.append(
        _emit_event(
            "cta_view",
            {"correlation_id": case["correlation_id"], "cta_id": case.get("cta_id")},
            extra_poison=poison,
        )
    )
    events.append(
        _emit_event(
            "cta_click",
            {"correlation_id": case["correlation_id"], "cta_id": case.get("cta_id")},
            extra_poison=poison,
        )
    )
    events.append(
        _emit_event(
            "xray_start",
            {"correlation_id": case["correlation_id"]},
            extra_poison=poison,
        )
    )

    if mutate == "pii_injection":
        closed = "rejected"
        reject_reason = "pii_in_url_or_event"
        # Drive sanitizers: poisoned props must not survive build_event / later bridge.
        leaked = []
        for ev in events:
            blob = json.dumps(ev, ensure_ascii=False)
            for needle in (case.get("cnpj"), case.get("email"), case.get("nome")):
                if needle and str(needle) in blob:
                    leaked.append(str(needle))
        stages.append(
            _stage(
                "xray",
                state="REJECT",
                fail_closed=True,
                reason=reject_reason,
                pii_leaked_in_events=leaked,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
            extra={"pii_leaked_in_events": leaked},
        )

    intake = _run_intake(case, store_path, now)
    factual = intake.get("factual") or {}
    if factual.get("claimed_live") or not factual.get("labeled_non_live", True):
        closed = "rejected"
        reject_reason = "xray_fixture_as_live"
        stages.append(
            _stage(
                "xray",
                state="REJECT",
                fail_closed=True,
                reason=reject_reason,
                factual=factual,
            )
        )
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store=intake.get("store") or {"count": 0, "ids": [], "recoverable": []},
        )
    if mutate == "fixture_as_live" and factual.get("poisoned_labeled_non_live") is not False:
        closed = "rejected"
        reject_reason = "xray_isLabeledNonLive_did_not_reject_claimed_live"
        stages.append(_stage("xray", state="REJECT", fail_closed=True, reason=reject_reason))
        return _finalize(
            case=case,
            stages=stages,
            events=events,
            closed=closed,
            reject_reason=reject_reason,
            store={"count": 0, "ids": [], "recoverable": []},
        )

    xray_state = (intake.get("xray") or {}).get("xray_state") or factual.get("state")
    if case.get("xray_state") and xray_state != case["xray_state"]:
        raise AssertionError(f"xray state drifted: {xray_state} != {case['xray_state']}")
    if _xray_rank(xray_state) >= _xray_rank("READY") and xray_state == "STALE":
        raise AssertionError("STALE x-ray promoted to READY")
    if xray_state == "STALE" and (intake.get("xray") or {}).get("claimed_live"):
        raise AssertionError("STALE x-ray claimed live")

    xray_public = intake.get("xray") or {}
    if xray_public.get("sla") != "UNKNOWN":
        raise AssertionError("xray sla must stay UNKNOWN")
    if xray_public.get("source") not in (None, SOURCE) and xray_public.get("ok"):
        raise AssertionError("xray source is not CONFENGE_WEB")

    stages.append(
        _stage(
            "xray",
            state=xray_state,
            claimed_live=False,
            catalog_mode=factual.get("catalog_mode") or "fixture",
            labeled_non_live=factual.get("labeled_non_live"),
            limitations=factual.get("limitations") or xray_public.get("limitations") or [],
            sla="UNKNOWN",
            unknown=["sla"],
            upstream_state=decision.state,
        )
    )

    persist = {
        "xray": {
            "status_code": xray_public.get("status_code"),
            "persisted": xray_public.get("persisted"),
            "idempotent": xray_public.get("idempotent"),
            "receipt_id": xray_public.get("receipt_id"),
            "correlation_id": xray_public.get("correlation_id"),
            "handoff_status": xray_public.get("handoff_status"),
            "persist_before_handoff": xray_public.get("persist_before_handoff"),
        },
        "handraise": {
            "status_code": (intake.get("handraise") or {}).get("status_code"),
            "persisted": (intake.get("handraise") or {}).get("persisted"),
            "idempotent": (intake.get("handraise") or {}).get("idempotent"),
            "receipt_id": (intake.get("handraise") or {}).get("receipt_id"),
            "correlation_id": (intake.get("handraise") or {}).get("correlation_id") or case["correlation_id"],
            "handoff_status": (intake.get("handraise") or {}).get("handoff_status"),
            "consent_state": (intake.get("handraise") or {}).get("consent_state"),
            "error": (intake.get("handraise") or {}).get("error"),
            "persist_before_handoff": (intake.get("handraise") or {}).get("persist_before_handoff"),
            "auto_send": (intake.get("handraise") or {}).get("auto_send"),
            "sla": (intake.get("handraise") or {}).get("sla") or "UNKNOWN",
        },
    }
    if intake.get("xray_replay"):
        persist["xray_replay"] = {
            "status_code": intake["xray_replay"].get("status_code"),
            "idempotent": intake["xray_replay"].get("idempotent"),
            "receipt_id": intake["xray_replay"].get("receipt_id"),
            "persisted": intake["xray_replay"].get("persisted"),
        }
    if intake.get("handraise_replay"):
        persist["handraise_replay"] = {
            "status_code": intake["handraise_replay"].get("status_code"),
            "idempotent": intake["handraise_replay"].get("idempotent"),
            "receipt_id": intake["handraise_replay"].get("receipt_id"),
            "persisted": intake["handraise_replay"].get("persisted"),
        }

    hand = persist["handraise"]
    if case.get("consent") is False:
        if hand.get("status_code") != 400 or hand.get("error") != "consent":
            raise AssertionError(f"consent case did not fail closed: {hand}")
        closed = "rejected"
        reject_reason = "consent_required"
    elif hand.get("handoff_status") == "RETRYABLE":
        closed = "retryable"
        if not hand.get("persist_before_handoff") and not persist["xray"].get("persist_before_handoff"):
            raise AssertionError("handoff attempted without persist-first")
        if not (intake.get("store") or {}).get("recoverable"):
            raise AssertionError("RETRYABLE handoff left no recoverable receipt")
    elif hand.get("status_code") not in {200, 201}:
        closed = "rejected"
        reject_reason = hand.get("error") or "handraise_failed"

    if persist["xray"].get("receipt_id") and persist["xray"].get("correlation_id") != case["correlation_id"]:
        raise AssertionError("xray correlation_id drifted")
    if hand.get("receipt_id") and hand.get("correlation_id") not in {None, case["correlation_id"]}:
        # handraise public body may omit correlation_id; receipt keeps it.
        pass

    stages.append(
        _stage(
            "persist",
            state="persisted" if persist["xray"].get("persisted") or persist["xray"].get("receipt_id") else "absent",
            receipts=persist,
            source=SOURCE,
            page_view_is_not_lead=True,
        )
    )

    replay_dup = False
    if case.get("replay"):
        xrep = persist.get("xray_replay") or {}
        hrep = persist.get("handraise_replay") or {}
        if xrep.get("receipt_id") and xrep.get("receipt_id") != persist["xray"].get("receipt_id"):
            replay_dup = True
        if hrep.get("receipt_id") and persist["handraise"].get("receipt_id") and hrep.get("receipt_id") != persist["handraise"].get("receipt_id"):
            replay_dup = True
        if xrep.get("persisted") or hrep.get("persisted"):
            replay_dup = True

    store_info = intake.get("store") or {"count": 0, "ids": [], "recoverable": []}
    if case.get("replay") and replay_dup:
        raise AssertionError("duplicate receipt on replay")

    if persist["xray"].get("receipt_id"):
        events.append(
            _emit_event(
                "lead_receipt_correlated",
                {
                    "correlation_id": case["correlation_id"],
                    "cta_id": case.get("cta_id"),
                },
            )
        )

    handoff_status = hand.get("handoff_status")
    stages.append(
        _stage(
            "handoff",
            state=handoff_status or "SKIPPED",
            persist_before_handoff=hand.get("persist_before_handoff") or persist["xray"].get("persist_before_handoff"),
            auto_send=False,
            sla="UNKNOWN",
            claimed_live=False,
            live_outcome=False,
            transport="fixture_stub",
            recoverable=bool(store_info.get("recoverable")),
            replay_duplicate=replay_dup,
        )
    )

    pii = intake.get("pii") or {}
    if pii.get("public_url_has_query") or (pii.get("analytics_hits") or []):
        raise AssertionError(f"PII leaked via shipped minimize: {pii}")
    if case.get("cnpj") and pii.get("public_url") and case["cnpj"] in str(pii.get("public_url")):
        raise AssertionError("CNPJ in public URL")

    expected = case.get("expect") or "ok"
    if expected == "rejected" and closed != "rejected":
        closed = "rejected"
        reject_reason = reject_reason or "expected_rejected"
    if expected == "retryable" and closed != "retryable":
        raise AssertionError(f"expected RETRYABLE, closed={closed} handoff={handoff_status}")

    return _finalize(
        case=case,
        stages=stages,
        events=events,
        closed=closed,
        reject_reason=reject_reason,
        store=store_info,
        extra={
            "cta": CTA_COPY,
            "family_validate": family,
            "pii": {
                "public_url": pii.get("public_url"),
                "public_url_has_query": pii.get("public_url_has_query"),
                "analytics_event": (pii.get("analytics") or {}).get("event"),
            },
        },
    )


def _finalize(
    *,
    case: dict[str, Any],
    stages: list[dict[str, Any]],
    events: list[dict[str, Any]],
    closed: str,
    reject_reason: str | None,
    store: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lead_events = [item for item in events if item.get("is_lead")]
    impression = [item for item in events if item.get("name") == "answer_view"]
    if impression and impression[0]["is_lead"]:
        raise AssertionError("answer_view treated as lead")
    names = [item["name"] for item in events]
    unknown_event = [name for name in names if name not in EVENT_NAMES]
    if unknown_event:
        raise AssertionError(f"event not in dictionary: {unknown_event}")

    trace = {
        "schema": SCHEMA_ID,
        "catalog_mode": "fixture",
        "source_kind": "labeled_fixture",
        "claimed_live": False,
        "official_live": False,
        "source": SOURCE,
        "case": case["id"],
        "correlation_id": case["correlation_id"],
        "page_view_is_not_lead": True,
        "answer_view_is_not_lead": True,
        "cta": CTA_COPY,
        "closed": closed,
        "reject_reason": reject_reason,
        "stages": stages,
        "events": events,
        "event_names": names,
        "lead_event_count": len(lead_events),
        "store": {
            "count": store.get("count"),
            "ids": list(store.get("ids") or []),
            "recoverable": sorted(
                [
                    {
                        "id": item.get("id"),
                        "handoff_status": item.get("handoff_status"),
                        "source": item.get("source"),
                        "consent_state": item.get("consent_state"),
                    }
                    for item in (store.get("recoverable") or [])
                ],
                key=lambda item: str(item.get("id") or ""),
            ),
        },
        "authorities": AUTHORITIES,
    }
    if extra:
        trace.update(extra)
    hashed = {key: value for key, value in trace.items() if key != "trace_hash"}
    trace["trace_hash"] = trace_hash(hashed)
    return trace


def walk_twice(case_id: str = "happy", **kwargs: Any) -> dict[str, Any]:
    first = walk(case_id, **kwargs)
    second = walk(case_id, **kwargs)
    return {
        "match": first["trace_hash"] == second["trace_hash"],
        "hash_1": first["trace_hash"],
        "hash_2": second["trace_hash"],
        "trace_1": first,
        "trace_2": second,
    }
