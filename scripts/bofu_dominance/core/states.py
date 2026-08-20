"""Resolve BOFU family state. Frozen and gated beat invented ranking."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import (
    GSC_LIVE_STATE,
    LIVE_GSC_SOURCES,
    OFFICIAL_SERP_SOURCES,
    RANKING_STATES,
)
from scripts.bofu_dominance.core.schema import RegistryError, validate_state


def _freeze(family: dict[str, Any]) -> dict[str, Any]:
    freeze = family.get("freeze") or {}
    return freeze if isinstance(freeze, dict) else {}


def _gate(family: dict[str, Any]) -> dict[str, Any]:
    gate = family.get("gate") or {}
    return gate if isinstance(gate, dict) else {}


def ranking_evidence_complete(evidence: dict[str, Any] | None) -> bool:
    if not evidence:
        return False
    source = str(evidence.get("source") or "")
    if source not in LIVE_GSC_SOURCES and source not in OFFICIAL_SERP_SOURCES:
        return False
    if evidence.get("is_gsc_live") is not True and source in LIVE_GSC_SOURCES:
        return False
    for key in ("date", "geo", "device", "denominator"):
        if evidence.get(key) in (None, "", "UNKNOWN"):
            return False
    if evidence.get("position") in (None, ""):
        return False
    return True


def visibility_from_evidence(
    evidence: dict[str, Any] | None,
    *,
    gsc_live_state: str,
) -> tuple[str | None, str]:
    if gsc_live_state == GSC_LIVE_STATE:
        if not ranking_evidence_complete(evidence):
            return None, "gsc_live_blocked_credential_failure"
    if not evidence:
        return None, "no_evidence"
    source = str(evidence.get("source") or "")
    if source in {"historical_csv_not_live", "historical_csv"}:
        return None, "historical_csv_is_not_current_visibility"
    if source in {"web_search_api", "serp_manual_sample"}:
        return None, "search_sample_is_not_official_position"
    if not ranking_evidence_complete(evidence):
        return None, "ranking_requires_source_date_geo_device_denominator"
    position = float(evidence["position"])
    if position <= 1.05:
        return "TOP1", "live_or_official_position_lte_1_with_context"
    if position <= 3.05:
        return "TOP3", "live_or_official_position_lte_3_with_context"
    if position <= 10.05:
        return "TOP10", "live_or_official_position_lte_10_with_context"
    return "VISIBLE", "live_or_official_position_beyond_10_with_context"


def resolve_family_state(
    family: dict[str, Any],
    *,
    evidence: dict[str, Any] | None = None,
    gsc_live_state: str = GSC_LIVE_STATE,
) -> dict[str, Any]:
    fid = family.get("id") or "unknown"
    freeze = _freeze(family)
    gate = _gate(family)
    owner = family.get("canonical_owner") or {}
    path = owner.get("path")
    page_exists = bool(owner.get("page_exists", bool(path)))

    if family.get("not_targeted") is True:
        state, reason = "NOT_TARGETED", "explicit_not_targeted"
    elif freeze.get("frozen") is True:
        state, reason = (
            "FROZEN",
            freeze.get("reason") or f"frozen_issue_{freeze.get('issue') or family.get('active_issue')}",
        )
    elif gate.get("status") == "GATED" or gate.get("gated") is True:
        state, reason = "NO_CANONICAL", gate.get("reason") or "gated_issue_no_public_page"
    elif not path:
        state, reason = "NO_CANONICAL", "missing_canonical_owner_path"
    elif page_exists is False:
        state, reason = "NO_CANONICAL", "canonical_path_not_an_existing_page"
    else:
        overlay, overlay_reason = visibility_from_evidence(
            evidence, gsc_live_state=gsc_live_state
        )
        if overlay in RANKING_STATES or overlay == "VISIBLE":
            state, reason = overlay, overlay_reason
        elif owner.get("indexable") is False:
            state, reason = "ELIGIBLE", "page_exists_but_not_indexable"
        elif page_exists:
            state, reason = "COVERED", "canonical_page_exists_current_rank_unknown"
        else:
            state, reason = "UNKNOWN", "insufficient_coverage_evidence"

    validate_state(state)
    if state in RANKING_STATES and not ranking_evidence_complete(evidence):
        raise RegistryError(
            f"{fid}: {state} refused without source/date/geo/device/denominator evidence"
        )
    if freeze.get("frozen") is True and state != "FROZEN":
        raise RegistryError(f"{fid}: freeze must resolve to FROZEN, got {state}")
    if (gate.get("status") == "GATED" or gate.get("gated") is True) and state not in {
        "NO_CANONICAL",
        "NOT_TARGETED",
        "FROZEN",
    }:
        raise RegistryError(f"{fid}: gated family must not resolve to {state}")
    return {
        "id": fid,
        "state": state,
        "reason": reason,
        "owner_path": path,
        "owner_issue": owner.get("issue") or family.get("active_issue"),
        "gsc_live_state": gsc_live_state,
    }
