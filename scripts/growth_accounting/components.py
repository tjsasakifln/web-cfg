"""Components A–F. No composite score. Missing stays UNKNOWN, never zero."""

from __future__ import annotations

from typing import Any

from scripts.growth_accounting.constants import (
    BLOCKED,
    OBSERVED,
    PRIMARY_SOURCE_FAMILY,
    SOURCE_FAMILIES,
    UNKNOWN,
    ZERO,
)
from scripts.growth_accounting.records import is_missing


def metric(value: Any, *, denominator: Any = None, reason: str | None = None) -> dict[str, Any]:
    denom_missing = is_missing(denominator) if denominator is not None else False
    if is_missing(value):
        return {
            "status": UNKNOWN if value != BLOCKED else BLOCKED,
            "value": None,
            "denominator": None if is_missing(denominator) else denominator,
            "reason": reason or ("MISSING_DENOMINATOR" if denom_missing else "MISSING"),
        }
    if denom_missing:
        return {
            "status": UNKNOWN,
            "value": None,
            "denominator": None,
            "reason": reason or "MISSING_DENOMINATOR",
        }
    numeric = float(value)
    status = ZERO if numeric == 0 else OBSERVED
    return {
        "status": status,
        "value": numeric,
        "denominator": denominator,
        "reason": reason,
    }


def ratio(numerator: Any, denominator: Any) -> dict[str, Any]:
    if is_missing(numerator) or is_missing(denominator):
        return metric(UNKNOWN, denominator=denominator, reason="MISSING_DENOMINATOR")
    denom = float(denominator)
    if denom == 0:
        return metric(UNKNOWN, denominator=0, reason="UNDEFINED_RATIO_ZERO_DENOMINATOR")
    return metric(float(numerator) / denom, denominator=denom)


def _m(cohort: dict[str, Any], field: str, *, family: str = PRIMARY_SOURCE_FAMILY) -> Any:
    if family == PRIMARY_SOURCE_FAMILY:
        return (cohort.get("primary") or {}).get(field, UNKNOWN)
    return ((cohort.get("by_family") or {}).get(family) or {}).get("metrics", {}).get(
        field, UNKNOWN
    )


def component_input(cohort: dict[str, Any]) -> dict[str, Any]:
    active = cohort.get("active_asset_count")
    return {
        "approved_indexable_assets": metric(active),
        "mature_active_assets": metric(cohort.get("mature_active_asset_count")),
        "mid_cohort_new_assets": metric(len(cohort.get("mid_cohort_new_asset_ids") or [])),
        "substantive_changes": metric(_m(cohort, "substantive_changes")),
        "editorial_hours": metric(_m(cohort, "editorial_hours")),
        "refresh_cost": metric(_m(cohort, "refresh_cost")),
        "defects": metric(_m(cohort, "defects")),
        "corrections": metric(_m(cohort, "corrections")),
        "stale_rate": ratio(_stale_count(cohort), active),
        "refresh_without_new_asset": cohort.get("refresh_without_new_asset"),
    }


def _stale_count(cohort: dict[str, Any]) -> Any:
    # Prefer explicit stale_count; otherwise UNKNOWN (do not infer from defects).
    primary = cohort.get("primary") or {}
    if "stale_count" in primary:
        return primary.get("stale_count")
    return UNKNOWN


def component_discovery(cohort: dict[str, Any]) -> dict[str, Any]:
    impressions = _m(cohort, "impressions")
    clicks = _m(cohort, "clicks")
    families = {}
    for family in SOURCE_FAMILIES:
        fam_metrics = ((cohort.get("by_family") or {}).get(family) or {}).get("metrics") or {}
        families[family] = {
            "impressions": metric(fam_metrics.get("impressions", UNKNOWN)),
            "clicks": metric(fam_metrics.get("clicks", UNKNOWN)),
        }
    return {
        "non_branded_impressions": metric(impressions),
        "non_branded_clicks": metric(clicks),
        "query_coverage_count": metric(_m(cohort, "query_coverage_count")),
        "ctr": ratio(clicks, impressions),
        "route_family_note": "clicks are route/asset family aggregates; individual queries are never joined",
        "eligibility_appearance_not_collapsed": True,
        "by_source_family": families,
        "note": "Impression is not a click. Average position is not a success KPI.",
    }


def component_qualified_use(cohort: dict[str, Any]) -> dict[str, Any]:
    clicks = _m(cohort, "clicks")
    engagement = _m(cohort, "engagement_admitted")
    method_open = _m(cohort, "method_evidence_opened")
    utility = _m(cohort, "utility_completed")
    content_to_service = _m(cohort, "content_to_service")
    return {
        "engagement_admitted": metric(engagement),
        "method_evidence_opened": metric(method_open),
        "utility_completed": metric(utility),
        "content_to_service": metric(content_to_service),
        "content_to_service_rate": ratio(content_to_service, engagement),
        "attribution_coverage": metric(_m(cohort, "attribution_coverage")),
        "contract": "#153 content→service IDs; observed events only",
        "denominators": {
            "engagement_admitted": metric(engagement, denominator=clicks),
            "clicks": metric(clicks),
        },
    }


def component_commercial(cohort: dict[str, Any]) -> dict[str, Any]:
    lead_valid = _m(cohort, "lead_valid")
    qualified = _m(cohort, "lead_qualified")
    meeting = _m(cohort, "meeting")
    proposal = _m(cohort, "proposal")
    pipeline = _m(cohort, "qualified_pipeline_brl")
    won = _m(cohort, "won")
    lost = _m(cohort, "lost")
    contracted = _m(cohort, "contracted_revenue_brl")
    received = _m(cohort, "received_revenue_brl")
    return {
        "lead_valid": metric(lead_valid),
        "qualified": metric(qualified),
        "meeting": metric(meeting),
        "proposal": metric(proposal),
        "qualified_pipeline_brl": metric(pipeline),
        "won": metric(won),
        "lost": metric(lost),
        "outcome_unknown_if_unobserved": True,
        "contracted_revenue_brl": metric(contracted),
        "received_revenue_brl": metric(received),
        "lead_to_qualified": ratio(qualified, lead_valid),
        "qualified_to_pipeline": ratio(pipeline, qualified),
        "note": "Lead is not qualified pipeline. Contracted revenue is not cash received. UNKNOWN never becomes zero.",
    }


def component_moat(cohort: dict[str, Any]) -> dict[str, Any]:
    return {
        "citations": metric(_m(cohort, "citations")),
        "referring_domains": metric(_m(cohort, "referring_domains")),
        "download_embed_reuse": metric(_m(cohort, "download_embed_reuse")),
        "return_visits": metric(_m(cohort, "return_visits")),
        "branded_clicks_secondary": metric(
            ((cohort.get("by_family") or {}).get("organic_branded") or {})
            .get("metrics", {})
            .get("clicks", UNKNOWN)
        ),
        "direct_clicks_secondary": metric(
            ((cohort.get("by_family") or {}).get("direct") or {})
            .get("metrics", {})
            .get("clicks", UNKNOWN)
        ),
        "note": "Branded and direct are secondary effects, never the primary series.",
    }


def component_efficiency(cohort: dict[str, Any]) -> dict[str, Any]:
    clicks = _m(cohort, "clicks")
    pipeline = _m(cohort, "qualified_pipeline_brl")
    cost = _m(cohort, "refresh_cost")
    editorial = _m(cohort, "editorial_hours")
    active = cohort.get("active_asset_count")
    mature = cohort.get("mature_active_asset_count")
    defects = _m(cohort, "defects")
    return {
        "clicks_per_active_asset": ratio(clicks, active),
        "clicks_per_mature_active_asset": ratio(clicks, mature),
        "pipeline_per_mature_active_asset": ratio(pipeline, mature),
        "cost_per_click": ratio(cost, clicks),
        "editorial_hours_per_result": ratio(editorial, clicks),
        "defect_rate": ratio(defects, active),
        "stale_rate": ratio(_stale_count(cohort), active),
        "maintenance_note": "Cost and stale/defect rates are guardrails, not success KPIs.",
    }


def attach_components(cohort: dict[str, Any]) -> dict[str, Any]:
    attached = dict(cohort)
    attached["components"] = {
        "input": component_input(cohort),
        "discovery": component_discovery(cohort),
        "qualified_use": component_qualified_use(cohort),
        "commercial": component_commercial(cohort),
        "moat": component_moat(cohort),
        "efficiency": component_efficiency(cohort),
    }
    return attached


def series_value(cohort: dict[str, Any], path: tuple[str, ...]) -> Any:
    cursor: Any = cohort
    for key in path:
        if not isinstance(cursor, dict):
            return UNKNOWN
        cursor = cursor.get(key)
    if isinstance(cursor, dict) and "status" in cursor:
        if cursor["status"] in {UNKNOWN, BLOCKED}:
            return UNKNOWN
        return cursor.get("value")
    return cursor
