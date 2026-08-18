"""Aggregate append-only observations into per-asset operations facts.

Never sums incompatible windows, never treats absence as zero, never
estimates revenue or emits an SEO score.
"""

from __future__ import annotations

import json
from typing import Any

from scripts.discovery.observation import (
    REASON_DISCOVERY_OBSERVED,
    REASON_DISCOVERY_UNKNOWN,
    REASON_GSC_NOT_PROVIDED,
    REASON_INCOMPATIBLE_WINDOWS,
    REASON_LEAD_UNATTRIBUTED,
    REASON_NO_CAUSALITY,
    REASON_NO_REVENUE_ESTIMATE,
    REASON_NO_SEO_SCORE,
    REASON_OUTCOME_NOT_PROVIDED,
    REASON_PERIOD_FILTER_ABSENT,
    REASON_POSITION_SMALL_N,
    REASON_PROVEN_ZERO,
    REASON_ZERO_ROWS,
    not_provided_metric,
)
from scripts.discovery.states import classify_states

MIN_IMPRESSIONS_FOR_STABLE_POSITION = 10
SEARCH_EVIDENCE_DIMS = ("gclid", "gsc_query", "search_query", "query")


def lead_attributed_to_search(row: dict[str, Any]) -> bool:
    """LEAD_PROVEN requires a search fact. Opaque lead_id is identity only."""
    if row.get("observation_type") != "lead":
        return False
    if REASON_LEAD_UNATTRIBUTED in (row.get("reason_codes") or []):
        return False
    dims = row.get("dimensions") if isinstance(row.get("dimensions"), dict) else {}
    metrics = row.get("metrics") if isinstance(row.get("metrics"), dict) else {}
    lead_id = dims.get("lead_id")
    has_search = any(dims.get(key) not in (None, "") for key in SEARCH_EVIDENCE_DIMS)
    corr = dims.get("correlation_id")
    if corr not in (None, "") and corr != lead_id:
        has_search = True
    if not has_search:
        return False
    return metrics.get("attributed_to_search") is True


def _asset_obs(observations: list[dict[str, Any]], asset_id: str) -> list[dict[str, Any]]:
    return [row for row in observations if row.get("asset_id") == asset_id]


def _window_key(row: dict[str, Any]) -> tuple[Any, Any, str]:
    filters = row.get("dimensions", {}).get("filters") or {}
    return (row.get("period_start"), row.get("period_end"), json_stable(filters))


def json_stable(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _compatible_groups(rows: list[dict[str, Any]]) -> dict[tuple[Any, Any, str], list[dict[str, Any]]]:
    groups: dict[tuple[Any, Any, str], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault(_window_key(row), []).append(row)
    return groups


def _gsc_fact_key(row: dict[str, Any]) -> tuple[Any, ...]:
    dims = row.get("dimensions") or {}
    if dims.get("fact_key"):
        return ("fact", dims["fact_key"])
    if dims.get("row_hash"):
        return ("row", dims["row_hash"])
    if dims.get("dedupe_key"):
        return ("dedupe", dims["dedupe_key"])
    return (
        "dims",
        dims.get("date"),
        dims.get("query"),
        dims.get("page"),
        dims.get("country"),
        dims.get("device"),
        row.get("period_start"),
        row.get("period_end"),
        json_stable(dims.get("filters") or {}),
    )


def unique_gsc_facts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep one row per GSC fact. Later re-imports of the same window do not add."""
    ordered = sorted(rows, key=lambda row: str(row.get("observed_at") or ""))
    seen: set[tuple[Any, ...]] = set()
    unique: list[dict[str, Any]] = []
    for row in ordered:
        key = _gsc_fact_key(row)
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def _metric(status: str, value: Any, *, warning: str | None = None) -> dict[str, Any]:
    cell = {"status": status, "value": value}
    if warning:
        cell["warning"] = warning
    return cell


def _unique_sorted(values: list[Any]) -> list[Any]:
    seen: set[str] = set()
    out: list[Any] = []
    for value in values:
        if value in (None, ""):
            continue
        key = str(value)
        if key not in seen:
            seen.add(key)
            out.append(value)
    return out


def summarize_gsc(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "impressions": not_provided_metric(),
            "clicks": not_provided_metric(),
            "ctr": not_provided_metric(),
            "position": not_provided_metric(),
            "queries": not_provided_metric(),
            "pages": not_provided_metric(),
            "period": None,
            "filters": None,
            "reason_codes": [REASON_GSC_NOT_PROVIDED],
            "coverage": "not_provided",
        }
    if any(row.get("status") == "NO_ROWS" for row in rows) and all(
        row.get("status") == "NO_ROWS" for row in rows
    ):
        period = {
            "start": rows[0].get("period_start"),
            "end": rows[0].get("period_end"),
        }
        return {
            "impressions": _metric("NO_ROWS", None),
            "clicks": _metric("NO_ROWS", None),
            "ctr": _metric("NO_ROWS", None),
            "position": _metric("NO_ROWS", None),
            "queries": _metric("NO_ROWS", None),
            "pages": _metric("NO_ROWS", None),
            "period": period,
            "filters": (rows[0].get("dimensions") or {}).get("filters") or {},
            "reason_codes": [REASON_ZERO_ROWS],
            "coverage": "export_empty",
        }

    groups = _compatible_groups(
        unique_gsc_facts([row for row in rows if row.get("status") != "NO_ROWS"])
    )
    reasons: list[str] = []
    if len(groups) > 1:
        reasons.append(REASON_INCOMPATIBLE_WINDOWS)
        return {
            "impressions": _metric("INCOMPATIBLE", None),
            "clicks": _metric("INCOMPATIBLE", None),
            "ctr": _metric("INCOMPATIBLE", None),
            "position": _metric("INCOMPATIBLE", None),
            "queries": _metric("INCOMPATIBLE", None),
            "pages": _metric("INCOMPATIBLE", None),
            "period": None,
            "filters": None,
            "reason_codes": reasons,
            "coverage": "incompatible_windows",
            "windows": [
                {"start": start, "end": end, "filters": filters, "rows": len(items)}
                for (start, end, filters), items in sorted(groups.items())
            ],
        }

    (start, end, filters_json), items = next(iter(groups.items()))
    items = unique_gsc_facts(items)
    if any(REASON_PERIOD_FILTER_ABSENT in (row.get("reason_codes") or []) for row in items):
        reasons.append(REASON_PERIOD_FILTER_ABSENT)

    impression_values = [row.get("metrics", {}).get("impressions") for row in items]
    click_values = [row.get("metrics", {}).get("clicks") for row in items]
    if any(value is None for value in impression_values):
        impressions_status, impressions_value = "UNKNOWN", None
        reasons.append("PARTIAL_IMPRESSIONS_NOT_SUMMED")
    else:
        impressions_value = sum(float(value) for value in impression_values)
        impressions_status = "PROVEN_ZERO" if impressions_value == 0 else "observed"
        if impressions_value == 0:
            reasons.append(REASON_PROVEN_ZERO)
    if any(value is None for value in click_values):
        clicks_status, clicks_value = "UNKNOWN", None
    else:
        clicks_value = sum(float(value) for value in click_values)
        clicks_status = "PROVEN_ZERO" if clicks_value == 0 else "observed"

    ctr_value = None
    ctr_status = "UNKNOWN"
    if impressions_value not in (None, 0) and clicks_value is not None:
        ctr_value = clicks_value / impressions_value
        ctr_status = "observed"
    elif impressions_value == 0 and clicks_value == 0:
        ctr_value = 0.0
        ctr_status = "PROVEN_ZERO"

    weighted = 0.0
    weight = 0.0
    for row in items:
        pos = row.get("metrics", {}).get("position")
        imps = row.get("metrics", {}).get("impressions")
        if pos is None or imps in (None, 0):
            continue
        weighted += float(pos) * float(imps)
        weight += float(imps)
    if weight <= 0:
        position = _metric("UNKNOWN", None, warning="position is a GSC average; undefined without impressions")
    else:
        warning = None
        if weight < MIN_IMPRESSIONS_FOR_STABLE_POSITION:
            warning = "position is a GSC average; small-n is statistically unstable"
            reasons.append(REASON_POSITION_SMALL_N)
        else:
            warning = "position is a GSC average, not a rank proof"
        position = _metric("observed", weighted / weight, warning=warning)

    queries = _unique_sorted([row.get("dimensions", {}).get("query") for row in items])
    pages = _unique_sorted([row.get("dimensions", {}).get("page") for row in items])
    if impressions_status == "observed":
        reasons.append(REASON_DISCOVERY_OBSERVED)
    return {
        "impressions": _metric(impressions_status, impressions_value),
        "clicks": _metric(clicks_status, clicks_value),
        "ctr": _metric(ctr_status, ctr_value),
        "position": position,
        "queries": _metric("observed" if queries else "NO_ROWS", queries or None),
        "pages": _metric("observed" if pages else "NO_ROWS", pages or None),
        "period": {"start": start, "end": end},
        "filters": json.loads(filters_json) if filters_json else {},
        "reason_codes": _unique_sorted(reasons),
        "coverage": "observed",
    }


def summarize_outcomes(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "sessions_referrals": not_provided_metric(),
            "cta": not_provided_metric(),
            "leads": not_provided_metric(),
            "leads_attributed_to_search": not_provided_metric(),
            "outcomes": not_provided_metric(),
            "revenue": not_provided_metric(),
            "reason_codes": [REASON_OUTCOME_NOT_PROVIDED, REASON_NO_REVENUE_ESTIMATE],
            "coverage": "not_provided",
        }
    referrals = [row for row in rows if row.get("observation_type") == "referral"]
    ctas = [row for row in rows if row.get("observation_type") == "cta"]
    leads = [row for row in rows if row.get("observation_type") == "lead"]
    commercial = [row for row in rows if row.get("observation_type") == "commercial_outcome"]
    attributed = [row for row in leads if lead_attributed_to_search(row)]
    unattributed = [row for row in leads if row not in attributed]
    revenue_values = [row.get("metrics", {}).get("revenue") for row in commercial]
    revenue_present = [value for value in revenue_values if value is not None]
    reasons = [REASON_NO_CAUSALITY, REASON_NO_REVENUE_ESTIMATE]
    if unattributed:
        reasons.append(REASON_LEAD_UNATTRIBUTED)
    return {
        "sessions_referrals": _metric("observed", len(referrals)),
        "cta": _metric("observed", len(ctas)),
        "leads": _metric("observed", len(leads)),
        "leads_attributed_to_search": _metric("observed", len(attributed)),
        "outcomes": _metric("observed" if commercial else "NOT_PROVIDED", len(commercial) if commercial else None),
        "revenue": _metric(
            "observed" if revenue_present else "NOT_PROVIDED",
            sum(float(v) for v in revenue_present) if revenue_present else None,
        ),
        "reason_codes": _unique_sorted(reasons),
        "coverage": "observed",
    }


def latest_probe(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    probes = [row for row in rows if row.get("observation_type") == "technical_probe"]
    if not probes:
        return None
    return sorted(probes, key=lambda row: str(row.get("observed_at") or ""))[-1]


def baseline_probe(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    probes = [row for row in rows if row.get("observation_type") == "technical_probe"]
    if not probes:
        return None
    return sorted(probes, key=lambda row: str(row.get("observed_at") or ""))[0]


def content_hash_delta(baseline: dict[str, Any] | None, latest: dict[str, Any] | None) -> dict[str, Any]:
    if not baseline or not latest:
        return {"status": "UNKNOWN", "absolute": None, "relative": None}
    left = (baseline.get("metrics") or {}).get("content_hash") or baseline.get("content_hash")
    right = (latest.get("metrics") or {}).get("content_hash") or latest.get("content_hash")
    if not left or not right:
        return {"status": "UNKNOWN", "absolute": None, "relative": None}
    changed = left != right
    return {
        "status": "observed",
        "absolute": 1 if changed else 0,
        "relative": None,
        "baseline_hash": left,
        "latest_hash": right,
        "changed": changed,
    }


def gsc_delta(current: dict[str, Any], baseline: dict[str, Any] | None) -> dict[str, Any]:
    if not baseline:
        return {"status": "UNKNOWN", "absolute": None, "relative": None, "note": "no_compatible_baseline"}
    if current.get("coverage") != "observed" or baseline.get("coverage") != "observed":
        return {"status": "UNKNOWN", "absolute": None, "relative": None, "note": "windows_not_statistically_defined"}
    if current.get("period") != baseline.get("period") or current.get("filters") != baseline.get("filters"):
        # Deltas require equal filter sets; periods may differ as sequential windows
        # only when both are fully observed and the caller marked them compatible.
        if current.get("filters") != baseline.get("filters"):
            return {
                "status": "INCOMPATIBLE",
                "absolute": None,
                "relative": None,
                "note": "filters_differ",
            }
    cur = current.get("impressions", {}).get("value")
    base = baseline.get("impressions", {}).get("value")
    if cur is None or base is None:
        return {"status": "UNKNOWN", "absolute": None, "relative": None}
    absolute = cur - base
    relative = None if base == 0 else absolute / base
    return {"status": "observed", "absolute": absolute, "relative": relative}


def next_factual_gate(*, discovery_status: str, has_attributed_lead: bool, has_revenue: bool) -> str:
    if discovery_status != "DISCOVERY_OBSERVED":
        return "import_gsc_export_for_canary_period"
    if not has_attributed_lead:
        return "observe_correlated_lead_before_LEAD_PROVEN"
    if not has_revenue:
        return "observe_canonical_commercial_event_before_REVENUE_PROVEN"
    return "keep_append_only_watch"


def operations_for_asset(
    asset: dict[str, Any],
    observations: list[dict[str, Any]],
    *,
    baseline_observations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows = _asset_obs(observations, str(asset.get("id")))
    probe = latest_probe(rows)
    technical = "TECHNICAL_UNKNOWN"
    if asset.get("technical_status") == "LIVE_PROVEN" and probe is None:
        technical = "TECHNICAL_LIVE"
    if probe is not None:
        technical = str(probe.get("technical_status") or "UNKNOWN")
        if technical == "observed":
            technical = "TECHNICAL_LIVE"
    gsc_rows = [row for row in rows if row.get("observation_type") == "gsc"]
    outcome_rows = [
        row
        for row in rows
        if row.get("observation_type") in {"referral", "cta", "lead", "commercial_outcome"}
    ]
    gsc = summarize_gsc(gsc_rows)
    outcomes = summarize_outcomes(outcome_rows)
    discovery = "DISCOVERY_UNKNOWN"
    if gsc.get("impressions", {}).get("status") == "observed":
        discovery = "DISCOVERY_OBSERVED"
    reasons = [
        REASON_NO_SEO_SCORE,
        REASON_NO_CAUSALITY,
        REASON_NO_REVENUE_ESTIMATE,
    ]
    if discovery == "DISCOVERY_UNKNOWN":
        reasons.append(REASON_DISCOVERY_UNKNOWN)
    else:
        reasons.append(REASON_DISCOVERY_OBSERVED)
    reasons.extend(gsc.get("reason_codes") or [])
    reasons.extend(outcomes.get("reason_codes") or [])
    freshness = None
    if probe:
        freshness = probe.get("observed_at")
    elif gsc_rows:
        freshness = max(str(row.get("observed_at") or "") for row in gsc_rows)
    base_probe = baseline_probe(_asset_obs(baseline_observations or rows, str(asset.get("id"))))
    base_gsc = None
    if baseline_observations is not None:
        base_gsc = summarize_gsc(
            [row for row in _asset_obs(baseline_observations, str(asset.get("id"))) if row.get("observation_type") == "gsc"]
        )
    attributed = (outcomes.get("leads_attributed_to_search") or {}).get("value") or 0
    has_revenue = (outcomes.get("revenue") or {}).get("value") is not None
    probes = sorted(
        [row for row in rows if row.get("observation_type") == "technical_probe"],
        key=lambda row: str(row.get("observed_at") or ""),
    )
    previous_probe = probes[-2] if len(probes) >= 2 else None
    states = classify_states(
        asset=asset,
        probe=probe,
        previous_probe=previous_probe,
        gsc_summary=gsc,
        gsc_rows=gsc_rows,
        outcome_rows=outcome_rows,
        extra_rows=rows,
    )
    return {
        "technical_status": technical,
        "discovery_status": discovery,
        "lead_status": "LEAD_PROVEN" if attributed else "UNKNOWN",
        "revenue_status": "REVENUE_PROVEN" if has_revenue else "UNKNOWN",
        "states": states,
        "impressions": gsc["impressions"],
        "queries": gsc["queries"],
        "pages": gsc["pages"],
        "clicks": gsc["clicks"],
        "ctr": gsc["ctr"],
        "position": gsc["position"],
        "sessions_referrals": outcomes["sessions_referrals"],
        "cta": outcomes["cta"],
        "leads": outcomes["leads"],
        "leads_attributed_to_search": outcomes["leads_attributed_to_search"],
        "outcomes": outcomes["outcomes"],
        "revenue": outcomes["revenue"],
        "data_coverage": {
            "gsc": gsc.get("coverage"),
            "outcomes": outcomes.get("coverage"),
            "probe": "observed" if probe else "not_provided",
        },
        "period": gsc.get("period"),
        "filters": gsc.get("filters"),
        "freshness": freshness,
        "baseline": {
            "observation_start_at": asset.get("observation_start_at"),
            "probe": {
                "observed_at": (base_probe or {}).get("observed_at"),
                "content_hash": (base_probe or {}).get("content_hash")
                or ((base_probe or {}).get("metrics") or {}).get("content_hash"),
            }
            if base_probe
            else None,
        },
        "delta": {
            "content_hash": content_hash_delta(base_probe, probe),
            "impressions": gsc_delta(gsc, base_gsc),
        },
        "reason_codes": _unique_sorted(reasons),
        "next_factual_gate": next_factual_gate(
            discovery_status=discovery,
            has_attributed_lead=bool(attributed),
            has_revenue=has_revenue,
        ),
        "seo_score": None,
        "causality": False,
    }
