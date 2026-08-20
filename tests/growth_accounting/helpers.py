"""Labeled SYNTHETIC fixtures. Not live GSC. Drive shipped build_report."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Callable

from scripts.growth_accounting.constants import SCHEMA, TIMEZONE

ROOT_ORIGIN = date(2026, 1, 5)
SYNTHETIC_PROVENANCE = {
    "source_id": "SYNTHETIC-growth-accounting-fixture",
    "authority_owner": "tests/growth_accounting",
    "observed": True,
    "labeled_synthetic": True,
}

ASSETS = ("asset-a", "asset-b", "asset-c")


def _as_of_for(n_cohorts: int) -> str:
    last = ROOT_ORIGIN + timedelta(days=n_cohorts * 28 + 3)
    return f"{last.isoformat()}T12:00:00-03:00"


def daily_row(
    day: date,
    asset_id: str,
    *,
    source_family: str = "organic_non_branded",
    first_seen: str | None = None,
    **metrics: Any,
) -> dict[str, Any]:
    row = {
        "date": day.isoformat(),
        "asset_id": asset_id,
        "route": f"/{asset_id}/",
        "route_family": "service",
        "source_family": source_family,
        "approved_indexable": True,
        "first_seen": first_seen or ROOT_ORIGIN.isoformat(),
        "provenance": dict(SYNTHETIC_PROVENANCE),
    }
    row.update(metrics)
    return row


def _quality_metrics(
    clicks: float,
    *,
    t: int,
    deteriorate_commercial: bool = False,
    cost: float | None = None,
    defects: float = 0,
    stale_count: float = 0,
    omit_commercial: bool = False,
    omit_cost: bool = False,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "impressions": clicks * 10,
        "clicks": clicks,
        "query_coverage_count": 6,
        "engagement_admitted": clicks,
        "method_evidence_opened": max(clicks * 0.5, 0),
        "utility_completed": max(clicks * 0.25, 0),
        "content_to_service": max(clicks * 0.25, 0),
        "editorial_hours": 1,
        "substantive_changes": 0,
        "defects": defects,
        "corrections": 0,
        "stale_count": stale_count,
        "attribution_coverage": 1,
    }
    if not omit_cost:
        metrics["refresh_cost"] = 5.0 if cost is None else cost
    if not omit_commercial:
        lead_valid = 8
        if deteriorate_commercial:
            lead_qualified = max(1, 7 - t)
        else:
            lead_qualified = 4
        metrics.update(
            {
                "lead_valid": lead_valid,
                "lead_qualified": lead_qualified,
                "meeting": 2,
                "proposal": 1,
                "qualified_pipeline_brl": 10000 * lead_qualified,
            }
        )
    return metrics


def synthetic_input(
    *,
    n_cohorts: int,
    clicks_for: Callable[[int, str], float],
    assets: tuple[str, ...] = ASSETS,
    extra_rows: list[dict[str, Any]] | None = None,
    deteriorate_commercial: bool = False,
    omit_commercial: bool = False,
    omit_cost: bool = False,
    cost_for: Callable[[int], float] | None = None,
    defects_for: Callable[[int], float] | None = None,
    stale_for: Callable[[int], float] | None = None,
    adversarial: bool = True,
    **overrides: Any,
) -> dict[str, Any]:
    daily: list[dict[str, Any]] = []
    for index in range(n_cohorts):
        day = ROOT_ORIGIN + timedelta(days=index * 28)
        for asset_id in assets:
            clicks = float(clicks_for(index, asset_id))
            metrics = _quality_metrics(
                clicks,
                t=index,
                deteriorate_commercial=deteriorate_commercial,
                cost=None if cost_for is None else cost_for(index) / len(assets),
                defects=0 if defects_for is None else defects_for(index) / len(assets),
                stale_count=0 if stale_for is None else stale_for(index) / len(assets),
                omit_commercial=omit_commercial,
                omit_cost=omit_cost,
            )
            daily.append(daily_row(day, asset_id, **metrics))
    if extra_rows:
        daily.extend(extra_rows)
    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "schema_version": "1.0",
        "definition_id": SCHEMA,
        "timezone": TIMEZONE,
        "as_of": _as_of_for(n_cohorts),
        "clock_source": "frozen",
        "labeled_synthetic": True,
        "primary_series": "non_branded_clicks_approved_routes",
        "freshness_lag_days": 2,
        "daily": daily,
        "late_arrivals": [],
        "tracking_breaks": [],
        "human_decisions": [],
        "flags": {
            "contains_query_level_pii": False,
            "query_to_lead_join": False,
            "inferred_outcomes": False,
        },
        "notes": ["SYNTHETIC fixture. Not live GSC. Not a public growth claim."],
    }
    if adversarial:
        payload["adversarial_review"] = {
            "tracking_breaks": "none in fixture",
            "seasonality": "none injected",
            "serp": "held constant in fixture",
            "migration": "legacy_brand excluded",
            "launches": "no confounding launch",
        }
    payload.update(overrides)
    return payload


def exponential_clicks(index: int, asset_id: str) -> float:
    # 3 + 6 + 12 + 24 + 48 + 96 per asset. Equal shares.
    return float(3 * (2**index))


def linear_clicks(index: int, asset_id: str) -> float:
    return float(10 * (index + 1))
