"""Scope-aware claim checks: estadual (UF=SC) vs nacional (#302).

A strictly estadual SC claim must not wait on extra-cli #302.
A national claim still requires #302 and must not be authorized here
by deleting or bypassing that gate.
"""

from __future__ import annotations

from typing import Any

from scripts.market_answers import CLAIM_AUTHORIZED, CLAIM_FIXTURE, CLAIM_STALE, CLAIM_UNAUTHORIZED
from scripts.market_answers.copy import geography_dict, is_sc_uf_payload
from scripts.market_answers.urls import geography_ufs


SCOPE_UF = "uf"
SCOPE_NATIONAL = "national"
SCOPE_UNKNOWN = "unknown"
NATIONAL_KINDS = frozenset({"br", "national", "brasil", "nacional", "country", "pais", "país"})
ALLOWED_COVERAGE = frozenset({"COMPLETE", "SUFFICIENT"})


def _text(value: Any) -> str:
    return str(value or "").strip()


def claim_scope(payload: dict[str, Any]) -> str:
    geo = geography_dict(payload)
    kind = _text(geo.get("kind") or geo.get("scope")).lower()
    code = _text(geo.get("code")).upper()
    ufs = geography_ufs(payload)
    if kind in NATIONAL_KINDS or code in {"BR", "BRASIL"}:
        return SCOPE_NATIONAL
    if kind in {"uf", "state", "estado"} or (len(ufs) == 1 and kind in {"", "ufs_publicadas", "uf"}):
        return SCOPE_UF
    if ufs and len(ufs) > 1:
        return SCOPE_UNKNOWN
    if not geo:
        return SCOPE_UNKNOWN
    return SCOPE_UNKNOWN


def geography_scope_ok(payload: dict[str, Any], *, expected_scope: str = SCOPE_UF) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    geo = geography_dict(payload)
    if not geo:
        reasons.append("geography_missing")
        return False, reasons
    scope = claim_scope(payload)
    kind = _text(geo.get("kind") or geo.get("scope")).lower()
    code = _text(geo.get("code")).upper()
    ufs = geography_ufs(payload)
    if scope == SCOPE_NATIONAL or kind in NATIONAL_KINDS or code in {"BR", "BRASIL"}:
        reasons.append("geography_national")
        if expected_scope == SCOPE_UF:
            return False, reasons
    if "RS" in ufs or code == "RS":
        reasons.append("geography_rs_not_authorized")
        return False, reasons
    if expected_scope == SCOPE_UF:
        if not is_sc_uf_payload(payload):
            reasons.append("geography_not_sc_uf")
            return False, reasons
        if ufs and ufs != ["SC"]:
            reasons.append("geography_extra_strata")
            return False, reasons
    return True, reasons


def coverage_status_ok(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    reasons: list[str] = []
    status = _text(coverage.get("status")).upper()
    if status not in ALLOWED_COVERAGE:
        reasons.append("coverage_insufficient")
    if coverage.get("stale") is True:
        reasons.append("coverage_stale")
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    n = stats.get("n")
    try:
        n_int = int(n)
    except (TypeError, ValueError):
        n_int = 0
        reasons.append("coverage_n_unreadable")
    min_n = coverage.get("min_n")
    required = payload.get("coverage_required") if isinstance(payload.get("coverage_required"), dict) else {}
    if min_n is None:
        min_n = required.get("min_n")
    if min_n is not None and n_int:
        try:
            if n_int < int(min_n):
                reasons.append("coverage_n_below_minimum")
        except (TypeError, ValueError):
            reasons.append("coverage_n_unreadable")
    if n_int <= 0 and "coverage_n_unreadable" not in reasons:
        reasons.append("coverage_n_not_positive")
    ok = status in ALLOWED_COVERAGE and not reasons
    return ok, reasons


def coverage_scope_matches(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    """Coverage must describe the same UF recorte as geography. No other recorte."""
    reasons: list[str] = []
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    geo = geography_dict(payload)
    expected = _text(geo.get("code")).upper() or (geography_ufs(payload)[0] if geography_ufs(payload) else "")
    cov_geo = coverage.get("geography") if isinstance(coverage.get("geography"), dict) else {}
    cov_code = _text(
        coverage.get("uf") or coverage.get("code") or cov_geo.get("code") or cov_geo.get("uf")
    ).upper()
    if cov_code and expected and cov_code != expected:
        reasons.append("coverage_other_recorte")
    filt = _text(coverage.get("filter") or coverage.get("scope"))
    if filt:
        upper = filt.upper()
        if "UF=" in upper:
            token = upper.split("UF=", 1)[1]
            token = token.split()[0].split("AND")[0].strip()
            if token and expected and token != expected:
                reasons.append("coverage_other_recorte")
    for item in payload.get("evidence_refs") or []:
        if not isinstance(item, dict):
            continue
        ev_filter = _text(item.get("filter")).upper()
        if "UF=" in ev_filter:
            token = ev_filter.split("UF=", 1)[1]
            token = token.split()[0].split("AND")[0].strip()
            if token and expected and token != expected:
                reasons.append("coverage_other_recorte")
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    cov_n = coverage.get("usable_n") if coverage.get("usable_n") is not None else coverage.get("n")
    stat_n = stats.get("n")
    if cov_n is not None and stat_n is not None:
        try:
            if int(cov_n) != int(stat_n):
                reasons.append("coverage_n_mismatch")
        except (TypeError, ValueError):
            reasons.append("coverage_n_unreadable")
    # Dedup
    ordered: list[str] = []
    for code in reasons:
        if code not in ordered:
            ordered.append(code)
    return not ordered, ordered


def n_positive(payload: dict[str, Any]) -> bool:
    stats = payload.get("statistics") if isinstance(payload.get("statistics"), dict) else {}
    try:
        return int(stats.get("n")) > 0
    except (TypeError, ValueError):
        return False


def missingness_present(payload: dict[str, Any]) -> bool:
    missing = payload.get("missingness") if isinstance(payload.get("missingness"), dict) else {}
    coverage = payload.get("coverage") if isinstance(payload.get("coverage"), dict) else {}
    if missing:
        return True
    return coverage.get("missing_or_nonpositive") is not None or coverage.get("total_keyword_rows") is not None


def national_302_authorized(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    """extra-cli #302. Required for a national claim. Never deleted."""
    claim = payload.get("claim") if isinstance(payload.get("claim"), dict) else {}
    state = _text(claim.get("authorization_state")).upper()
    reasons: list[str] = []
    if state == CLAIM_STALE:
        reasons.append("claim_stale")
    elif state == CLAIM_FIXTURE:
        reasons.append("claim_fixture_not_authorizable")
    elif state != CLAIM_AUTHORIZED:
        reasons.append("claim_unauthorized")
        if state and state != CLAIM_UNAUTHORIZED:
            reasons.append(f"claim_state_{state.lower()}")
    if claim.get("current_publication_allowed") is False:
        reasons.append("claim_current_publication_blocked")
    if claim.get("national_claim_allowed") is not True:
        reasons.append("national_claim_not_allowed")
    ok = (
        state == CLAIM_AUTHORIZED
        and claim.get("current_publication_allowed") is True
        and claim.get("national_claim_allowed") is True
        and not [code for code in reasons if code not in {"claim_current_publication_blocked", "national_claim_not_allowed"} or True]
    )
    # Recompute ok strictly
    ok = (
        state == CLAIM_AUTHORIZED
        and claim.get("current_publication_allowed") is True
        and claim.get("national_claim_allowed") is True
        and "claim_stale" not in reasons
        and "claim_fixture_not_authorizable" not in reasons
    )
    if not ok and not reasons:
        reasons.append("claim_unauthorized")
    return ok, reasons


def estadual_claim_authorized(
    payload: dict[str, Any],
    *,
    official: bool,
    fixture: bool,
    copy_national_hits: list[str],
) -> tuple[bool, list[str]]:
    """UF=SC claim. #302 is not a prerequisite. National wording fails."""
    reasons: list[str] = []
    geo_ok, geo_reasons = geography_scope_ok(payload, expected_scope=SCOPE_UF)
    reasons.extend(geo_reasons)
    if fixture:
        reasons.append("claim_fixture_not_authorizable")
    if not official:
        reasons.append("official_live_absent")
    if copy_national_hits:
        reasons.append("national_claim_in_estadual_copy")
    if claim_scope(payload) == SCOPE_NATIONAL:
        reasons.append("claim_scope_national")
    ok = geo_ok and official and not fixture and not copy_national_hits
    return ok, reasons
