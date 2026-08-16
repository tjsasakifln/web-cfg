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
    CLAIM_AUTHORIZED,
    CLAIM_FIXTURE,
    CLAIM_STALE,
    CLAIM_UNAUTHORIZED,
    GATE_VERSION,
    INDEX_CONDITIONS,
    PRODUCER_STATUS_FIXTURE,
    PUBLICATION_STATES,
    QUESTION_ID,
    SOURCE,
)
from scripts.market_answers.consume import approval_for, grain_is_ticket, is_fixture_payload
from scripts.market_answers.hashing import content_hash
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
    return today or date(2026, 8, 16)


def _coverage_sufficient(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    reasons: list[str] = []
    status = _text(coverage.get("status")).upper()
    if status in {"INSUFFICIENT", "INCOMPLETE", "UNKNOWN", ""}:
        reasons.append("coverage_insufficient")
    if coverage.get("national_universe_complete") is True:
        # Extra-cli #302 is still open. A fixture/incomplete pack claiming
        # national completeness is a lie, not a pass.
        if status != "SUFFICIENT":
            reasons.append("coverage_national_claim_without_sufficient_status")
    if coverage.get("stale") is True:
        reasons.append("coverage_stale")
    required = payload.get("coverage_required") if isinstance(payload.get("coverage_required"), dict) else {}
    min_n = required.get("min_n") or coverage.get("min_n")
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    n = stats.get("n")
    if min_n is not None and n is not None:
        try:
            if int(n) < int(min_n):
                reasons.append("coverage_n_below_minimum")
        except (TypeError, ValueError):
            reasons.append("coverage_n_unreadable")
    ok = status == "SUFFICIENT" and not reasons
    if not ok and "coverage_insufficient" not in reasons and status != "SUFFICIENT":
        reasons.append("coverage_insufficient")
    return ok, reasons


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
    if generated is not None:
        now = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        age_hours = (now - generated).total_seconds() / 3600.0
        if age_hours > max_age_hours:
            reasons.append("freshness_stale")
    ok = not reasons
    return ok, reasons


def _claim_authorized(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    claim = payload.get("claim") if isinstance(payload.get("claim"), dict) else {}
    state = _text(claim.get("authorization_state")).upper()
    reasons: list[str] = []
    if state == CLAIM_STALE:
        reasons.append("claim_stale")
    elif state == CLAIM_FIXTURE:
        reasons.append("claim_fixture_not_authorizable")
    elif state != CLAIM_AUTHORIZED:
        reasons.append("claim_unauthorized")
        if state == CLAIM_UNAUTHORIZED or not state:
            pass
        else:
            reasons.append(f"claim_state_{state.lower()}")
    if claim.get("current_publication_allowed") is False:
        reasons.append("claim_current_publication_blocked")
    if is_fixture_payload(payload) and state == CLAIM_AUTHORIZED:
        reasons.append("claim_authorized_on_fixture")
    ok = state == CLAIM_AUTHORIZED and not reasons
    return ok, reasons


def _human_approval(
    payload: dict[str, Any],
    approval: dict[str, Any] | None,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    expected = _text(payload.get("content_hash")) or content_hash(payload)
    if not approval:
        reasons.append("approval_missing")
        return False, reasons
    approved_hash = _text(approval.get("content_hash"))
    if not approved_hash:
        reasons.append("approval_hash_missing")
        return False, reasons
    if approved_hash != expected:
        reasons.append("approval_hash_drift")
        return False, reasons
    if approval.get("index_authorized") is not True:
        reasons.append("approval_index_not_authorized")
        return False, reasons
    return True, []


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
) -> tuple[dict[str, bool], list[str]]:
    today = _today(today)
    score = score or score_candidate(record, payload)
    reasons: list[str] = []
    fixture = is_fixture_payload(payload) or bool(payload.get("is_fixture"))
    official = bool(payload.get("official_live")) and not fixture
    if _text(payload.get("producer_status")) == PRODUCER_STATUS_FIXTURE:
        fixture = True
        official = False

    coverage_ok, coverage_reasons = _coverage_sufficient(payload)
    fresh_ok, fresh_reasons = _freshness_current(payload, today=today)
    claim_ok, claim_reasons = _claim_authorized(payload)
    approval_ok, approval_reasons = _human_approval(payload, approval)

    geo = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    claim = payload.get("claim") if isinstance(payload.get("claim"), dict) else {}
    national = bool(
        claim.get("national_claim_allowed")
        or geo.get("national_claim_allowed")
        or _text(geo.get("scope")).upper() in {"BR", "NATIONAL", "BRASIL", "NACIONAL"}
    )
    national_ok = (not national) or coverage_ok

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
    limits_ok = _limitations_present(payload, record)
    answer_ok = _answerable(record, score)
    singular_ok = _singular(record, score)

    # Schema/canonical/robots are coherent when we emit noindex/off-sitemap
    # for anything that is not INDEX. The condition for INDEX itself requires
    # the page to be willing to flip — still fail-closed here because the
    # fixture/official flags dominate.
    hygiene_ok = official and (not fixture) and coverage_ok and claim_ok and approval_ok

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
        "no_national_claim_without_coverage": national_ok,
    }
    assert set(conditions) == set(INDEX_CONDITIONS)

    reasons.extend(coverage_reasons)
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
    if not answer_ok:
        reasons.append("answerability_fail")
    if not singular_ok:
        reasons.append("singularity_fail")
    if not attribution_ok:
        reasons.append("attribution_missing")
    if not refresh_owner:
        reasons.append("refresh_owner_missing")
    if not national_ok:
        reasons.append("national_claim_without_coverage")
    if not hygiene_ok:
        reasons.append("index_hygiene_blocked")

    seen: set[str] = set()
    ordered: list[str] = []
    for code in reasons:
        if code not in seen:
            seen.add(code)
            ordered.append(code)
    return conditions, ordered


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
        return "READY_FOR_OFFICIAL_PAYLOAD"
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
) -> GateDecision:
    score = score_candidate(record, payload)
    question_id = _text(record.get("question_id") or payload.get("question_id") or QUESTION_ID)
    approval = approval_for(question_id, approvals or {})
    conditions, reasons = evaluate_conditions(
        record, payload, approval, today=today, score=score
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
    )
