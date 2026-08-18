"""Versioned fail-closed publication gate.

States: REJECT, HOLD_FOR_DATA, EDITORIAL_REVIEW, PUBLISHABLE_NOINDEX,
PUBLISHABLE_INDEX. INDEX is granted only when every INDEX condition holds
and the record is not a fixture.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

from scripts.contract_analysis import (
    GATE_VERSION,
    INDEX_CONDITIONS,
    MAX_INDEX_PAGES,
    PUBLICATION_STATES,
    SOURCE_FIXTURE,
    SOURCE_OFFICIAL_LIVE,
)
from scripts.contract_analysis.approval import approval_allows_index
from scripts.contract_analysis.consume import (
    INTEGRITY_REASON_CODES,
    _has_coverage,
    _has_evidence_refs,
    _has_freshness,
    comparability_conflict,
    handoff_status_of,
    material_claims_missing_locator,
    official_live_declared,
    producer_status_of,
)
from scripts.contract_analysis.quality import (
    HUMAN_REVIEW_PENDING,
    INDEX_READY_VERDICT,
    evaluate_quality,
)
from scripts.contract_analysis.reputation import check_reputational_safety
from scripts.contract_analysis.taxonomy import check_taxonomy
from scripts.contract_analysis.unique_content import check_unique_content

PLAUSIBLE_INTENTS = frozenset(
    {
        "defesa_margem",
        "bdi",
        "preco",
        "preço",
        "reajuste",
        "reequilibrio",
        "reequilíbrio",
        "aditivo",
        "prazo",
        "atraso",
        "medicao",
        "medição",
        "glosa",
        "comparacao",
        "comparação",
        "comparavel",
        "comparável",
    }
)

_GENERIC_INSIGHT = re.compile(
    r"^(este contrato (é|e) relevante|análise (do|de) contrato público|"
    r"analise (do|de) contrato publico|os números merecem atenção)\b",
    re.I,
)


@dataclass(frozen=True)
class PublicationDecision:
    analysis_id: str
    slug: str
    state: str
    reason_codes: tuple[str, ...]
    conditions: dict[str, bool]
    source_kind: str
    is_fixture: bool
    indexable: bool
    robots: str
    sitemap: bool
    gate_version: str = GATE_VERSION
    quality: dict[str, Any] | None = None
    review_recommendation: str = ""
    human_review_status: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.analysis_id,
            "slug": self.slug,
            "state": self.state,
            "reason_codes": list(self.reason_codes),
            "conditions": dict(self.conditions),
            "source_kind": self.source_kind,
            "is_fixture": self.is_fixture,
            "indexable": self.indexable,
            "robots": self.robots,
            "sitemap": self.sitemap,
            "gate_version": self.gate_version,
            "quality": dict(self.quality) if self.quality else None,
            "review_recommendation": self.review_recommendation,
            "human_review_status": self.human_review_status,
        }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _len_ok(value: Any, minimum: int) -> bool:
    return len(_text(value)) >= minimum


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _iso_date(value: Any) -> date | None:
    text = _text(value)[:10]
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _as_of_date(record: dict[str, Any]) -> date | None:
    raw = record.get("as_of")
    freshness = record.get("freshness") if isinstance(record.get("freshness"), dict) else {}
    if not raw:
        raw = freshness.get("as_of") or freshness.get("source_as_of")
    return _iso_date(raw)


def _today(today: date | None) -> date:
    return today or date(2026, 8, 16)


def _data_state(record: dict[str, Any]) -> str | None:
    raw = record.get("publication_readiness") or record.get("data_state")
    text = _text(raw)
    return text or None


def _source_kind(record: dict[str, Any]) -> str:
    if _is_fixture(record):
        return SOURCE_FIXTURE
    kind = _text(record.get("source_kind"))
    if kind == SOURCE_OFFICIAL_LIVE:
        return SOURCE_OFFICIAL_LIVE
    if kind in {"live_extra_cli", "official_live"}:
        return SOURCE_OFFICIAL_LIVE if _text(record.get("catalog_mode")) == SOURCE_OFFICIAL_LIVE else SOURCE_FIXTURE
    return kind or "unknown"


def _is_fixture(record: dict[str, Any]) -> bool:
    if record.get("is_fixture") or record.get("test_only"):
        return True
    if record.get("source_kind") == SOURCE_FIXTURE:
        return True
    mode = _text(record.get("catalog_mode"))
    if mode in {"fixture", "offline_catalog"}:
        return True
    if record.get("claimed_live") and mode != SOURCE_OFFICIAL_LIVE:
        return True
    reasons = record.get("reason_codes") or []
    if "fixture_as_live" in reasons:
        return True
    return False


def _producer_integrity_reasons(record: dict[str, Any]) -> list[str]:
    """INDEX blockers for missing evidence/hash/freshness/coverage. Presence-only here.

    Hash equality is verified at consume against the producer bundle and attached
    as `producer_integrity_reasons`. Re-hashing the editorial projection would
    be a false mismatch.
    """
    attached = [str(code) for code in (record.get("producer_integrity_reasons") or [])]
    reasons: list[str] = []
    if not _text(record.get("evidence_pack_hash")):
        reasons.append("evidence_pack_hash_absent")
    if not _text(record.get("evidence_pack_version")):
        reasons.append("evidence_pack_version_absent")
    if not _has_evidence_refs(record):
        reasons.append("evidence_refs_absent")
    if not _has_freshness(record):
        reasons.append("freshness_absent")
    if not _has_coverage(record):
        reasons.append("coverage_absent")
    if not _text(record.get("content_hash")):
        reasons.append("content_hash_absent")
    if record.get("content_hash_verified") is False and _text(record.get("content_hash")):
        reasons.append("content_hash_mismatch")
    status = producer_status_of(record)
    if status and status != SOURCE_OFFICIAL_LIVE:
        reasons.append("producer_status_not_official_live")
    if record.get("withdrawn"):
        reasons.append("withdrawn")
    if record.get("correction_invalidated"):
        reasons.append("correction_invalidated")
    return sorted(set(attached + reasons) & (set(INTEGRITY_REASON_CODES) | {"withdrawn", "correction_invalidated", "schema_additive_1x"}))


def evaluate_conditions(
    record: dict[str, Any],
    *,
    cohort: list[dict[str, Any]] | None = None,
    today: date | None = None,
    rendered_html: str = "",
    schema: Any = None,
) -> tuple[dict[str, bool], list[str]]:
    """Evaluate the twelve INDEX conditions. Missing any one stays off INDEX."""
    reasons: list[str] = []
    taxonomy_errors = check_taxonomy(record, rendered_html=rendered_html, schema=schema)
    reputation_errors = check_reputational_safety(record, rendered_html=rendered_html)
    unique_errors = check_unique_content(record, cohort)
    integrity_errors = [
        code for code in _producer_integrity_reasons(record) if code != "schema_additive_1x"
    ]

    facts = _items(record.get("facts"))
    sources = _items(record.get("sources"))
    ficha = record.get("ficha") if isinstance(record.get("ficha"), dict) else {}
    as_of = _as_of_date(record)
    freshness = record.get("freshness") if isinstance(record.get("freshness"), dict) else {}
    max_age_days = int(freshness.get("max_age_days") or record.get("max_age_days") or 180)
    max_age_hours = freshness.get("max_age_hours")
    if max_age_hours is None:
        max_age_hours = record.get("max_age_hours")

    extra_state = _data_state(record)
    extra_ok = extra_state in {None, "DATA_READY"}
    if extra_state == "DATA_HOLD":
        extra_ok = False
        reasons.append("data_hold")
    if extra_state == "DATA_REJECT":
        extra_ok = False
        reasons.append("data_reject")
    if extra_state and extra_state not in {"DATA_READY", "DATA_HOLD", "DATA_REJECT"}:
        extra_ok = False
        reasons.append("data_state_unknown")
    if "fixture_as_live" in (record.get("reason_codes") or []) or (
        record.get("claimed_live") and _text(record.get("catalog_mode")) in {"fixture", "offline_catalog"}
    ):
        extra_ok = False
        reasons.append("fixture_as_live")
    if integrity_errors:
        reasons.extend(integrity_errors)
    if comparability_conflict(record):
        extra_ok = False
        reasons.append("comparability_not_applicable_with_comparative_claim")
    hs = handoff_status_of(record)
    if hs and hs != "HANDOFF_READY":
        extra_ok = False
        reasons.append("handoff_status_not_ready")
    if record.get("official_ingest") and not official_live_declared(record):
        extra_ok = False
        reasons.append("official_live_not_true")
    structured_claims = [
        item
        for item in _items(record.get("claims"))
        if isinstance(item, dict) and item.get("claim_id")
    ]
    require_locators = (not _is_fixture(record)) and bool(
        record.get("official_ingest") or structured_claims
    )
    if require_locators and material_claims_missing_locator(record):
        extra_ok = False
        reasons.append("material_claim_locator_absent")
    # Producer publication/index flags never satisfy data readiness.
    if record.get("producer_index_authorization") or record.get("index_authorization"):
        reasons.append("producer_index_authorization_ignored")
    if record.get("producer_publication_authorization") or record.get("publication_authorization"):
        reasons.append("producer_publication_authorization_ignored")

    live_integrity_blockers = []
    if not _is_fixture(record) or _source_kind(record) == SOURCE_OFFICIAL_LIVE:
        live_integrity_blockers = [
            code
            for code in integrity_errors
            if code
            not in {
                "producer_status_not_official_live",
            }
        ]

    data_ready = (
        extra_ok
        and not record.get("data_incomplete")
        and bool(facts)
        and bool(_text(ficha.get("objeto") or record.get("objeto")))
        and as_of is not None
        and not live_integrity_blockers
    )
    if record.get("data_incomplete") and extra_state != "DATA_READY":
        reasons.append("data_incomplete")
    if extra_state is None and record.get("data_incomplete"):
        reasons.append("data_incomplete")
    if not facts:
        reasons.append("facts_absent")
    if not _text(ficha.get("objeto") or record.get("objeto")):
        reasons.append("objeto_absent")
    if as_of is None:
        reasons.append("as_of_absent")

    insight = _text(record.get("insight_singular"))
    insight_ok = _len_ok(insight, 80) and not _GENERIC_INSIGHT.search(insight)
    if not insight_ok:
        reasons.append("insight_singular_absent_or_generic")

    body_bits = [
        _text(record.get("executive_summary")),
        _text(record.get("why_analysis")),
        _text(record.get("insight_singular")),
        _text(record.get("cannot_conclude")),
        _text(record.get("methodology")),
    ]
    for key in ("facts", "calculations", "interpretation"):
        for item in _items(record.get(key)):
            body_bits.append(_text(item.get("text") if isinstance(item, dict) else item))
    section_hits = sum(
        1
        for key in ("facts", "calculations", "interpretation", "cannot_conclude", "methodology")
        if (key == "cannot_conclude" and _len_ok(record.get(key), 40))
        or (key == "methodology" and _len_ok(record.get(key), 40))
        or (key not in {"cannot_conclude", "methodology"} and _items(record.get(key)))
    )
    substantial = len(" ".join(body_bits)) >= 800 and section_hits >= 3
    if not substantial:
        reasons.append("conteudo_insubstancial")

    utility = _text(record.get("utility_beyond_source"))
    utility_ok = _len_ok(utility, 60)
    if not utility_ok:
        reasons.append("utilidade_alem_da_fonte_absent")

    provenance_ok = False
    for src in sources:
        if not isinstance(src, dict):
            continue
        if (src.get("url") or src.get("document_id") or src.get("pncp_id")) and (
            src.get("as_of") or as_of is not None
        ):
            provenance_ok = True
            break
    if not provenance_ok:
        reasons.append("source_provenance_absent")

    fresh_ok = False
    now = _today(today)
    if freshness.get("stale") is True:
        reasons.append("freshness_stale_flag")
    expires = _iso_date(freshness.get("expires_at"))
    if expires is not None and now > expires:
        reasons.append("freshness_expired")
    verified = _iso_date(record.get("verified_at") or freshness.get("verified_at"))
    event_at = _iso_date(record.get("event_effective_at") or freshness.get("event_effective_at"))
    historical = bool(record.get("historical") or freshness.get("historical"))
    if event_at and verified and event_at < verified:
        historical = True
    if as_of is not None:
        age_days = (now - as_of).days
        verified_fresh = False
        if verified is not None:
            verified_age = (now - verified).days
            try:
                hours_limit = int(max_age_hours) if max_age_hours is not None else max_age_days * 24
            except (TypeError, ValueError):
                hours_limit = max_age_days * 24
            verified_fresh = verified_age >= 0 and verified_age * 24 <= hours_limit
        if age_days < 0:
            reasons.append("freshness_stale_or_future")
        elif historical and verified_fresh:
            # Current verification of an explicitly historical event does not rewrite
            # event_effective_at and does not HOLD for document age alone.
            pass
        elif max_age_hours is not None:
            try:
                hours = int(max_age_hours)
            except (TypeError, ValueError):
                hours = 0
            if age_days * 24 > hours:
                reasons.append("freshness_max_age_hours")
        elif age_days > max_age_days:
            reasons.append("freshness_stale_or_future")
    fresh_ok = as_of is not None and not any(
        code.startswith("freshness_") for code in reasons
    )

    method_ok = _len_ok(record.get("methodology"), 40) and _len_ok(record.get("limitations"), 40)
    if not method_ok:
        reasons.append("method_or_limitations_absent")

    author = record.get("author") if isinstance(record.get("author"), dict) else {"name": record.get("author")}
    reviewer = record.get("reviewer") if isinstance(record.get("reviewer"), dict) else {"name": record.get("reviewer")}
    solo = bool(record.get("solo_reviewer_disclosure")) or _text(record.get("solo_reviewer_disclosure"))
    author_ok = _len_ok(author.get("name") if isinstance(author, dict) else author, 5)
    reviewer_ok = _len_ok(reviewer.get("name") if isinstance(reviewer, dict) else reviewer, 5) or bool(solo)
    if not author_ok or not reviewer_ok:
        reasons.append("author_or_reviewer_absent")

    if reputation_errors:
        reasons.extend(reputation_errors)

    owner_ok = _len_ok(record.get("maintenance_owner"), 5)
    if not owner_ok:
        reasons.append("maintenance_owner_absent")

    intent_raw = _fold_intent(_text(record.get("intent") or record.get("job") or ""))
    intent_ok = bool(intent_raw) and (
        intent_raw in PLAUSIBLE_INTENTS or any(token in intent_raw for token in PLAUSIBLE_INTENTS)
    )
    if not intent_ok:
        reasons.append("intent_implausivel")

    if unique_errors:
        reasons.extend(unique_errors)
    if taxonomy_errors:
        reasons.extend(taxonomy_errors)

    editorial_pending = _text(record.get("editorial_status")).lower() in {"", "pending", "review", "draft"}
    if editorial_pending:
        reasons.append("editorial_review_pending")

    conditions = {
        "data_readiness": data_ready,
        "insight_singular": insight_ok,
        "conteudo_substancial": substantial,
        "utilidade_alem_da_fonte": utility_ok,
        "source_provenance": provenance_ok,
        "freshness": fresh_ok,
        "method_limitations": method_ok,
        "author_reviewer": author_ok and reviewer_ok,
        "reputational_safety": not reputation_errors,
        "maintenance_owner": owner_ok,
        "intent_plausivel": intent_ok,
        "unique_content": not unique_errors,
    }
    assert set(conditions) == set(INDEX_CONDITIONS)
    return conditions, sorted(set(reasons))


def _fold_intent(text: str) -> str:
    return (
        text.lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ã", "a")
        .replace("ç", "c")
        .replace(" ", "_")
    )


def decide_state(
    record: dict[str, Any],
    conditions: dict[str, bool],
    reasons: list[str],
    quality: Any = None,
) -> str:
    taxonomy_hit = any(code.startswith("taxonomy_") for code in reasons)
    reputation_hit = any(code.startswith("reputation_") for code in reasons)
    extra_state = _data_state(record)
    if (
        taxonomy_hit
        or reputation_hit
        or extra_state == "DATA_REJECT"
        or "fixture_as_live" in reasons
        or "withdrawn" in reasons
        or "content_hash_mismatch" in reasons
        or "manifest_hash_mismatch" in reasons
        or "comparability_not_applicable_with_comparative_claim" in reasons
    ):
        return "REJECT"
    if "schema_unsupported" in reasons or "schema_absent" in reasons:
        return "HOLD_FOR_DATA"
    if "correction_invalidated" in reasons:
        return "EDITORIAL_REVIEW"
    if (
        not conditions["data_readiness"]
        or not conditions["source_provenance"]
        or not conditions["freshness"]
        or extra_state == "DATA_HOLD"
        or "data_hold" in reasons
    ):
        return "HOLD_FOR_DATA"
    quality_ready = bool(
        quality is not None and getattr(quality, "review_verdict", None) == INDEX_READY_VERDICT
    )
    missing_editorial = (
        not conditions["author_reviewer"]
        or not conditions["method_limitations"]
        or not conditions["insight_singular"]
        or not conditions["conteudo_substancial"]
        or not conditions["utilidade_alem_da_fonte"]
        or not conditions["intent_plausivel"]
        or not conditions["maintenance_owner"]
        or "editorial_review_pending" in reasons
    )
    # INDEX_READY content may preview as NOINDEX while authorship is unconfirmed.
    if missing_editorial and not quality_ready:
        return "EDITORIAL_REVIEW"
    fixture = _is_fixture(record)
    approved, approval_reasons = approval_allows_index(record)
    reasons.extend(approval_reasons)
    integrity_block = any(code in INTEGRITY_REASON_CODES for code in reasons)
    all_ok = all(conditions[name] for name in INDEX_CONDITIONS) and not integrity_block
    live = _source_kind(record) == SOURCE_OFFICIAL_LIVE and not fixture
    if all_ok and live and approved:
        return "PUBLISHABLE_INDEX"
    return "PUBLISHABLE_NOINDEX"


def evaluate_publication(
    record: dict[str, Any],
    *,
    cohort: list[dict[str, Any]] | None = None,
    today: date | None = None,
    rendered_html: str = "",
    schema: Any = None,
) -> PublicationDecision:
    conditions, reasons = evaluate_conditions(
        record,
        cohort=cohort,
        today=today,
        rendered_html=rendered_html,
        schema=schema,
    )
    quality = evaluate_quality(
        record,
        cohort=cohort,
        rendered_html=rendered_html,
        schema=schema,
    )
    state = decide_state(record, conditions, reasons, quality=quality)
    if state not in PUBLICATION_STATES:
        state = "REJECT"
        reasons.append("state_unknown")
    fixture = _is_fixture(record)
    if fixture and state == "PUBLISHABLE_INDEX":
        state = "PUBLISHABLE_NOINDEX"
        reasons.append("fixture_cannot_index")
    indexable = state == "PUBLISHABLE_INDEX"
    robots = "index,follow" if indexable else "noindex,nofollow"
    review_rec = quality.review_verdict
    human_status = ""
    if review_rec == INDEX_READY_VERDICT and state != "PUBLISHABLE_INDEX":
        human_status = HUMAN_REVIEW_PENDING
    return PublicationDecision(
        analysis_id=_text(record.get("id") or record.get("slug") or "unknown"),
        slug=_text(record.get("slug") or record.get("id") or "unknown"),
        state=state,
        reason_codes=tuple(reasons),
        conditions=conditions,
        source_kind=_source_kind(record),
        is_fixture=fixture,
        indexable=indexable,
        robots=robots,
        sitemap=indexable,
        quality=quality.as_dict(),
        review_recommendation=review_rec,
        human_review_status=human_status,
    )


def evaluate_cohort(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
) -> list[PublicationDecision]:
    decisions: list[PublicationDecision] = []
    index_seen = 0
    for rec in records:
        decision = evaluate_publication(rec, cohort=records, today=today)
        if decision.state == "PUBLISHABLE_INDEX":
            index_seen += 1
            if index_seen > MAX_INDEX_PAGES:
                decision = replace(
                    decision,
                    state="PUBLISHABLE_NOINDEX",
                    indexable=False,
                    sitemap=False,
                    robots="noindex,nofollow",
                    reason_codes=tuple(decision.reason_codes) + ("index_cap_exceeded",),
                )
        decisions.append(decision)
    return decisions
