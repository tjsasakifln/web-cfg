"""Commercial exposure metrics for the Organic Opportunity Engine."""

from __future__ import annotations

from typing import Any

from scripts.organic.serp_ctr import load_ctr_config
from scripts.organic.analytics_export import read_funnel_metrics


def _is_prefix(path: str, prefixes: list[str]) -> bool:
    return any(path.startswith(p) for p in prefixes)


def commercial_exposure_metrics(
    pages: list[dict[str, Any]],
    *,
    config: dict[str, Any] | None = None,
    link_coverage: dict[str, Any] | None = None,
    ctr_opportunities: list[dict[str, Any]] | None = None,
    analytics_export_path: Any | None = None,
) -> dict[str, Any]:
    """Compute impression/click shares and coverage metrics from GSC page rows."""
    config = config or load_ctr_config()
    commercial_prefixes = list(config.get("commercial_path_prefixes") or [])
    informational_prefixes = list(config.get("informational_path_prefixes") or [])

    total_imp = 0.0
    total_clicks = 0.0
    info_imp = 0.0
    info_clicks = 0.0
    comm_imp = 0.0
    comm_clicks = 0.0

    for p in pages:
        path = p.get("path") or ""
        imp = float(p.get("impressions") or 0)
        clicks = float(p.get("clicks") or 0)
        total_imp += imp
        total_clicks += clicks
        if _is_prefix(path, commercial_prefixes):
            comm_imp += imp
            comm_clicks += clicks
        elif _is_prefix(path, informational_prefixes):
            info_imp += imp
            info_clicks += clicks

    def share(part: float, whole: float) -> float | None:
        if whole <= 0:
            return None
        return round(part / whole, 4)

    serp_gaps = ctr_opportunities or []
    avg_gap = None
    if serp_gaps:
        gaps = [float((g.get("ctr_gap") or {}).get("gap") or 0) for g in serp_gaps]
        avg_gap = round(sum(gaps) / len(gaps), 5)

    cov = link_coverage or {}
    funnel_metrics = read_funnel_metrics(analytics_export_path)
    return {
        "schema_version": "commercial-exposure-metrics-v1",
        "totals": {
            "impressions": total_imp,
            "clicks": total_clicks,
            "informational_impressions": info_imp,
            "informational_clicks": info_clicks,
            "commercial_impressions": comm_imp,
            "commercial_clicks": comm_clicks,
        },
        "informational_impression_share": share(info_imp, total_imp),
        "commercial_impression_share": share(comm_imp, total_imp),
        "commercial_click_share": share(comm_clicks, total_clicks),
        "serp_ctr_gap": {
            "opportunity_count": len(serp_gaps),
            "mean_gap": avg_gap,
        },
        "commercial_bridge_coverage": cov.get("commercial_bridge_coverage"),
        "content_to_service_link_coverage": cov.get("content_to_service_link_coverage"),
        "service_to_supporting_content_coverage": cov.get(
            "service_to_supporting_content_coverage"
        ),
        "indexable_commercial_bridge_coverage": cov.get(
            "indexable_commercial_bridge_coverage"
        ),
        "indexable_content_to_service_link_coverage": cov.get(
            "indexable_content_to_service_link_coverage"
        ),
        **funnel_metrics,
        "note": (
            "Impression/click shares from GSC page table. Funnel metrics need "
            "collect/attribution exports; do not invent conversion rates."
        ),
    }
