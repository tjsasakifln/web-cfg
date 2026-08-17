"""Fail-closed value / index gate for one Market Answer.

PUBLISHABLE_INDEX requires every INDEX condition. Any failure is noindex
and off-sitemap. A CONTRACT_FIXTURE can never become INDEX, even with a
human approval hash that matches.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from scripts.market_answers import (
    DEFAULT_LKG,
    GATE_VERSION,
    INDEX_CONDITIONS,
    PRODUCER_STATUS_FIXTURE,
    PUBLICATION_STATES,
    QUESTION_ID,
    SOURCE,
)
from scripts.market_answers.approval import approval_for, evaluate_approval
from scripts.market_answers.consume import grain_is_ticket, is_fixture_payload
from scripts.market_answers.copy import (
    surfaces_claim_national,
    surfaces_name_santa_catarina,
    visitor_copy,
)
from scripts.market_answers.hashing import content_hash
from scripts.market_answers.scope import (
    SCOPE_NATIONAL,
    SCOPE_UF,
    claim_scope,
    coverage_scope_matches,
    coverage_status_ok,
    estadual_claim_authorized,
    geography_scope_ok,
    missingness_present,
    n_positive,
    national_302_authorized,
)
from scripts.market_answers.score import ScoreResult, score_candidate


@dataclass(frozen=True)
class GateDecision:
    question_id: str
    state: str
    reason_codes: tuple[str, ...]
    conditions: dict[str, bool]
    indexable: bool
    robots: str
    sitemap: bool
    official_live: bool
    is_fixture: bool
    producer_status: str
    recommendation: str
    score: dict[str, Any]
    content_hash: str
    claim_scope: str = SCOPE_UF
    payload_content_hash: str = ""
    rendered_content_hash: str = ""
    freshness_class: str = "current"
    gate_version: str = GATE_VERSION

    def as_dict(self) -> dict[str, Any]:
        return {
            "question_id": self.question_id,
            "state": self.state,
            "reason_codes": list(self.reason_codes),
            "conditions": dict(self.conditions),
            "indexable": self.indexable,
            "robots": self.robots,
            "sitemap": self.sitemap,
            "official_live": self.official_live,
            "is_fixture": self.is_fixture,
            "producer_status": self.producer_status,
            "recommendation": self.recommendation,
            "score": dict(self.score),
            "content_hash": self.content_hash,
            "claim_scope": self.claim_scope,
            "payload_content_hash": self.payload_content_hash,
            "rendered_content_hash": self.rendered_content_hash,
            "freshness_class": self.freshness_class,
            "gate_version": self.gate_version,
        }


def _text(value: Any) -> str:
    return str(value or "").strip()


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


def _parse_dt(value: Any) -> datetime | None:
    text = _text(value)
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        day = _iso_date(value)
        if day is None:
            return None
        return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def _today(today: date | None) -> date:
    return today or date(2026, 8, 17)


def _coverage_sufficient(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    return coverage_status_ok(payload)


def _freshness_current(payload: dict[str, Any], *, today: date) -> tuple[bool, list[str]]:
    freshness = payload.get("freshness") if isinstance(payload.get("freshness"), dict) else {}
    reasons: list[str] = []
    status = _text(freshness.get("status")).upper()
    if status in {"STALE", "STALE_FOR_INDEX", "EXPIRED"}:
        reasons.append("freshness_stale")
    as_of = _iso_date(payload.get("as_of") or freshness.get("as_of") or freshness.get("source_as_of"))
    generated = _parse_dt(freshness.get("generated_at") or freshness.get("as_of"))
    max_age_hours = freshness.get("max_age_hours")
    if max_age_hours is None:
        max_age_hours = payload.get("max_age_hours")
    if max_age_hours is None:
        max_age_hours = 48
    try:
        max_age_hours = float(max_age_hours)
    except (TypeError, ValueError):
        max_age_hours = 48.0
        reasons.append("freshness_max_age_unreadable")
    if as_of is None:
        reasons.append("freshness_as_of_missing")
    else:
        age_days = (today - as_of).days
        if age_days * 24 > max_age_hours:
            reasons.append("freshness_stale")
            reasons.append("STALE_DATA")
    if generated is not None:
        now = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        age_hours = (now - generated).total_seconds() / 3600.0
        if age_hours > max_age_hours:
            reasons.append("freshness_stale")
            reasons.append("STALE_DATA")
    ok = not any(code in {"freshness_stale", "freshness_as_of_missing"} for code in reasons)
    return ok, reasons


def _human_approval(
    payload: dict[str, Any],
    record: dict[str, Any],
    approval: dict[str, Any] | None,
) -> tuple[bool, list[str], dict[str, str]]:
    return evaluate_approval(payload, record, approval)


def load_lkg(path: Any | None = None) -> dict[str, Any]:
    from pathlib import Path
    import json

    resolved = Path(path) if path is not None else Path(__file__).resolve().parents[2] / DEFAULT_LKG
    if not resolved.is_file():
        return {}
    try:
        data = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_lkg(decision: "GateDecision", path: Any | None = None) -> None:
    from pathlib import Path
    import json

    if not decision.indexable:
        return
    resolved = Path(path) if path is not None else Path(__file__).resolve().parents[2] / DEFAULT_LKG
    resolved.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "asset_id": decision.question_id,
        "payload_content_hash": decision.payload_content_hash or decision.content_hash,
        "rendered_content_hash": decision.rendered_content_hash,
        "indexable": True,
        "robots": decision.robots,
        "recorded_at": "2026-08-17T00:00:00Z",
        "freshness_class": decision.freshness_class,
    }
    resolved.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _method_present(payload: dict[str, Any], record: dict[str, Any]) -> bool:
    if _text(payload.get("method_id")):
        if _items(payload.get("limitations")) is not None:
            pass
    method = payload.get("method") if isinstance(payload.get("method"), dict) else {}
    short = _text(payload.get("method_short") or method.get("short") or record.get("method_short"))
    return bool(_text(payload.get("method_id")) and (short or _items(payload.get("method_refs"))))


def _limitations_present(payload: dict[str, Any], record: dict[str, Any]) -> bool:
    limits = _items(payload.get("limitations")) or _items(record.get("limitations"))
    return len([item for item in limits if _text(item)]) >= 1


def _answerable(record: dict[str, Any], score: ScoreResult) -> bool:
    block = record.get("answerability")
    if isinstance(block, dict) and str(block.get("status") or "").upper() == "UNANSWERABLE":
        return False
    value = score.components.get("answerability")
    if value is None:
        return False
    return value >= 0.5


def _singular(record: dict[str, Any], score: ScoreResult) -> bool:
    value = score.components.get("singularity")
    if value is None:
        return False
    return value >= 0.5


def evaluate_conditions(
    record: dict[str, Any],
    payload: dict[str, Any],
    approval: dict[str, Any] | None,
    *,
    today: date | None = None,
    score: ScoreResult | None = None,
    surfaces: dict[str, Any] | None = None,
) -> tuple[dict[str, bool], list[str], dict[str, str]]:
    today = _today(today)
    score = score or score_candidate(record, payload)
    reasons: list[str] = []
    fixture = is_fixture_payload(payload) or bool(payload.get("is_fixture"))
    official = bool(payload.get("official_live")) and not fixture
    if _text(payload.get("producer_status")) == PRODUCER_STATUS_FIXTURE:
        fixture = True
        official = False

    surfaces = surfaces if surfaces is not None else visitor_copy(record, payload)
    national_hits = surfaces_claim_national(surfaces)
    scope = claim_scope(payload)
    geo_ok, geo_reasons = geography_scope_ok(payload, expected_scope=SCOPE_UF)
    coverage_ok, coverage_reasons = _coverage_sufficient(payload)
    scope_match_ok, scope_match_reasons = coverage_scope_matches(payload)
    fresh_ok, fresh_reasons = _freshness_current(payload, today=today)
    approval_ok, approval_reasons, hashes = _human_approval(payload, record, approval)
    n302_ok, n302_reasons = national_302_authorized(payload)

    if scope == SCOPE_NATIONAL:
        claim_ok, claim_reasons = n302_ok, list(n302_reasons)
        # National page still requires #302. Do not delete this branch.
        national_gate_ok = n302_ok
        copy_ok = True
        if not n302_ok:
            reasons.append("national_claim_requires_302")
    else:
        claim_ok, claim_reasons = estadual_claim_authorized(
            payload,
            official=official,
            fixture=fixture,
            copy_national_hits=national_hits,
        )
        # Estadual: #302 must not block. It remains required if this page
        # actually makes a national claim (copy or geography).
        national_gate_ok = not national_hits and scope != SCOPE_NATIONAL
        copy_ok = (not national_hits) and surfaces_name_santa_catarina(surfaces)
        if not copy_ok and not national_hits:
            reasons.append("copy_missing_santa_catarina")
        if national_hits:
            reasons.append("national_claim_in_copy")

    n_ok = n_positive(payload)
    miss_ok = missingness_present(payload)
    limits_ok = _limitations_present(payload, record) or bool(surfaces.get("limitations"))

    owner = record.get("owner") if isinstance(record.get("owner"), dict) else record.get("owner")
    refresh = record.get("refresh") if isinstance(record.get("refresh"), dict) else {}
    refresh_owner = _text(
        (owner or {}).get("refresh") if isinstance(owner, dict) else None
    ) or _text(refresh.get("owner")) or _text(record.get("refresh_owner"))

    attribution_ok = _text(record.get("attribution_source") or SOURCE) == SOURCE

    grain_ok = grain_is_ticket(payload)
    if not grain_ok:
        reasons.append("grain_not_ticket")

    method_ok = _method_present(payload, record)
    answer_ok = _answerable(record, score)
    singular_ok = _singular(record, score)
    rendered_bound = approval_ok

    hygiene_ok = (
        official
        and (not fixture)
        and coverage_ok
        and claim_ok
        and approval_ok
        and geo_ok
        and copy_ok
        and national_gate_ok
    )

    conditions = {
        "official_live": official,
        "claim_authorized": claim_ok,
        "coverage_sufficient": coverage_ok,
        "freshness_current": fresh_ok,
        "method_present": method_ok,
        "limitations_present": limits_ok,
        "answerability": answer_ok,
        "singular_substance": singular_ok,
        "canonical_robots_sitemap_schema": hygiene_ok,
        "attribution": attribution_ok,
        "refresh_owner": bool(refresh_owner),
        "human_approval_hash": approval_ok,
        "not_fixture": not fixture,
        "grain_ticket_not_km": grain_ok,
        "no_national_claim_without_coverage": national_gate_ok,
        "geography_scope_ok": geo_ok,
        "copy_scope_coherent": copy_ok,
        "coverage_scope_matches": scope_match_ok,
        "n_positive": n_ok,
        "missingness_present": miss_ok,
        "rendered_approval_bound": rendered_bound,
        "national_gate_302": national_gate_ok if scope != SCOPE_NATIONAL else n302_ok,
    }
    assert set(conditions) == set(INDEX_CONDITIONS)

    reasons.extend(geo_reasons)
    reasons.extend(coverage_reasons)
    reasons.extend(scope_match_reasons)
    reasons.extend(fresh_reasons)
    reasons.extend(claim_reasons)
    reasons.extend(approval_reasons)
    if fixture:
        reasons.append("fixture_never_index")
    if not official:
        reasons.append("official_live_absent")
    if not method_ok:
        reasons.append("method_missing")
    if not limits_ok:
        reasons.append("limitations_missing")
    if not n_ok:
        reasons.append("n_missing_or_not_positive")
    if not miss_ok:
        reasons.append("missingness_absent")
    if not answer_ok:
        reasons.append("answerability_fail")
    if not singular_ok:
        reasons.append("singularity_fail")
    if not attribution_ok:
        reasons.append("attribution_missing")
    if not refresh_owner:
        reasons.append("refresh_owner_missing")
    if not national_gate_ok:
        reasons.append("national_claim_without_coverage")
    if not hygiene_ok:
        reasons.append("index_hygiene_blocked")
    if not rendered_bound:
        reasons.append("rendered_approval_unbound")

    seen: set[str] = set()
    ordered: list[str] = []
    for code in reasons:
        if code not in seen:
            seen.add(code)
            ordered.append(code)
    return conditions, ordered, hashes


def _recommendation(
    state: str,
    *,
    official_live: bool,
    fixture: bool,
    conditions: dict[str, bool],
) -> str:
    if state == "REJECT":
        return "REJECT"
    if state == "PUBLISHABLE_INDEX" and official_live and conditions.get("claim_authorized"):
        return "PUBLISHABLE_INDEX"
    if fixture or not official_live:
        # Experience may exist; official payload does not. Stay honest.
        if state in {"PUBLISHABLE_NOINDEX", "CANDIDATE", "EDITORIAL_REVIEW", "PRIVATE_ANSWER_ONLY"}:
            return "GO_NOINDEX"
        return "NEEDS_DATA"
    if state == "NEEDS_DATA":
        return "NEEDS_DATA"
    return "GO_NOINDEX"


def decide_state(
    record: dict[str, Any],
    payload: dict[str, Any],
    conditions: dict[str, bool],
    score: ScoreResult,
) -> str:
    kill = record.get("kill_gate") if isinstance(record.get("kill_gate"), dict) else {}
    if kill.get("triggered") is True:
        return "REJECT"
    if not conditions.get("grain_ticket_not_km"):
        return "REJECT"
    answer = record.get("answerability")
    if isinstance(answer, dict) and str(answer.get("status") or "").upper() == "UNANSWERABLE":
        return "REJECT"
    if score.components.get("answerability") is not None and score.components["answerability"] < 0.3:
        return "REJECT"

    fixture = is_fixture_payload(payload) or bool(payload.get("is_fixture"))
    official = bool(payload.get("official_live")) and not fixture
    index_ok = all(conditions.values())
    if index_ok and official and not fixture:
        return "PUBLISHABLE_INDEX"

    # Preview is allowed when the answer can be shown honestly.
    previewable = (
        conditions.get("method_present")
        and conditions.get("limitations_present")
        and conditions.get("answerability")
        and conditions.get("grain_ticket_not_km")
    )
    visibility = _text(record.get("visibility") or record.get("intended_visibility")).upper()
    if visibility == "PRIVATE":
        return "PRIVATE_ANSWER_ONLY"
    if not official:
        if previewable:
            return "PUBLISHABLE_NOINDEX"
        return "NEEDS_DATA"
    if not conditions.get("coverage_sufficient") or not conditions.get("freshness_current"):
        return "NEEDS_DATA"
    if not conditions.get("human_approval_hash"):
        editorial = _text(record.get("editorial_state")).upper()
        if editorial == "REVIEW":
            return "EDITORIAL_REVIEW"
        return "CANDIDATE"
    if previewable:
        return "PUBLISHABLE_NOINDEX"
    return "CANDIDATE"


def evaluate(
    record: dict[str, Any],
    payload: dict[str, Any],
    approvals: dict[str, Any] | None = None,
    *,
    today: date | None = None,
    surfaces: dict[str, Any] | None = None,
    lkg: dict[str, Any] | None = None,
) -> GateDecision:
    score = score_candidate(record, payload)
    question_id = _text(record.get("question_id") or payload.get("question_id") or QUESTION_ID)
    approval = approval_for(question_id, approvals or {})
    conditions, reasons, hashes = evaluate_conditions(
        record, payload, approval, today=today, score=score, surfaces=surfaces
    )
    state = decide_state(record, payload, conditions, score)
    if state not in PUBLICATION_STATES:
        raise RuntimeError(f"illegal publication state {state}")
    fixture = is_fixture_payload(payload) or bool(payload.get("is_fixture"))
    official = bool(payload.get("official_live")) and not fixture
    if state == "PUBLISHABLE_INDEX" and (fixture or not official):
        # Belt and braces: never leak INDEX from a fixture.
        state = "PUBLISHABLE_NOINDEX"
        reasons = list(reasons) + ["fixture_index_forced_down"]
    freshness_class = "current"
    if "STALE_DATA" in reasons or not conditions.get("freshness_current"):
        freshness_class = "STALE_DATA"
    if "STALE_APPROVAL" in reasons:
        freshness_class = "STALE_APPROVAL"
    # Stale payload cannot silently publish a NEW indexable version.
    # Matching LKG may keep a previously healthy INDEX; hashes that drifted
    # stay noindex.
    lkg = lkg if lkg is not None else load_lkg()
    payload_hash = hashes.get("payload_content_hash") or _text(payload.get("content_hash"))
    render_hash = hashes.get("rendered_content_hash") or ""
    lkg_match = (
        bool(lkg)
        and lkg.get("indexable") is True
        and _text(lkg.get("payload_content_hash")) == payload_hash
        and _text(lkg.get("rendered_content_hash")) == render_hash
    )
    if freshness_class == "STALE_DATA" and state == "PUBLISHABLE_INDEX":
        if lkg_match:
            reasons = list(reasons) + ["lkg_preserved"]
        else:
            state = "PUBLISHABLE_NOINDEX"
            reasons = list(reasons) + ["stale_blocks_new_index"]
            conditions = dict(conditions)
            conditions["freshness_current"] = False
            conditions["canonical_robots_sitemap_schema"] = False
    indexable = state == "PUBLISHABLE_INDEX"
    recommendation = _recommendation(
        state, official_live=official, fixture=fixture, conditions=conditions
    )
    if recommendation == "READY_FOR_OFFICIAL_PAYLOAD" and (fixture or not official):
        recommendation = "GO_NOINDEX"
    return GateDecision(
        question_id=question_id,
        state=state,
        reason_codes=tuple(reasons),
        conditions=conditions,
        indexable=indexable,
        robots="index,follow" if indexable else "noindex,nofollow",
        sitemap=indexable,
        official_live=official,
        is_fixture=fixture,
        producer_status=_text(payload.get("producer_status")) or ("CONTRACT_FIXTURE" if fixture else "UNKNOWN"),
        recommendation=recommendation,
        score=score.as_dict(),
        content_hash=_text(payload.get("content_hash")) or content_hash(payload),
        claim_scope=claim_scope(payload),
        payload_content_hash=payload_hash or "",
        rendered_content_hash=render_hash,
        freshness_class=freshness_class,
    )
