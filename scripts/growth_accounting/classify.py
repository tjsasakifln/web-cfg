"""State classification. SCALE_ALLOWED is never auto-emitted."""

from __future__ import annotations

from typing import Any

from scripts.growth_accounting.components import series_value
from scripts.growth_accounting.constants import (
    ADVERSARIAL_KEYS,
    DEFECT_RATE_MAX,
    MIN_COMPOUNDING_COHORTS,
    MIN_EXPONENTIAL_COHORTS,
    REASON_ADVERSARIAL_REVIEW_MISSING,
    REASON_CLICKS_PER_ASSET_FALLING,
    REASON_COMMERCIAL_GUARDRAIL_DETERIORATED,
    REASON_COST_EXCEEDS_DEMAND,
    REASON_DEFECT_SPIKE,
    REASON_DEMAND_NOT_FASTER_THAN_ASSETS,
    REASON_DEMAND_PER_ASSET_NOT_IMPROVING,
    REASON_INCOMPLETE_WINDOW,
    REASON_INSUFFICIENT_COHORTS,
    REASON_LEAVE_ONE_OUT_FAILED,
    REASON_LEAVE_ONE_OUT_INFEASIBLE,
    REASON_LINEAR_BETTER_THAN_LOG,
    REASON_LOG_RATE_NOT_POSITIVE,
    REASON_MISSING_DENOMINATOR,
    REASON_NORTH_STAR_UNKNOWN,
    REASON_SCALE_NOT_AUTO,
    REASON_SINGLE_ASSET_DOMINANCE,
    REASON_STALE_RATE_EXCEEDED,
    REASON_TRACKING_BREAK,
    STALE_RATE_MAX,
    UNKNOWN,
)
from scripts.growth_accounting.records import is_missing
from scripts.growth_accounting.stats import (
    clicks_per_asset_not_falling,
    demand_faster_than_assets,
    fit_models,
    lift_share_by_asset,
)


def _complete(cohorts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [cohort for cohort in cohorts if cohort.get("complete")]


def _num(cohort: dict[str, Any], *path: str) -> float | None:
    value = series_value(cohort, path)
    if is_missing(value):
        return None
    return float(value)


def _dpa(cohort: dict[str, Any]) -> float | None:
    return _num(cohort, "components", "efficiency", "clicks_per_mature_active_asset")


def _rate(cohort: dict[str, Any], component: str, field: str) -> float | None:
    return _num(cohort, "components", component, field)


def _non_deteriorating(values: list[float | None]) -> bool:
    observed = [value for value in values if value is not None]
    if len(observed) < 2:
        return False
    for prev, nxt in zip(observed, observed[1:]):
        if nxt < prev:
            return False
    return True


def _tracking_break_overlaps(
    payload: dict[str, Any], cohorts: list[dict[str, Any]]
) -> bool:
    breaks = payload.get("tracking_breaks") or []
    if not breaks:
        return False
    for item in breaks:
        b_start = str(item.get("start") or "")
        b_end = str(item.get("end") or b_start)
        for cohort in cohorts:
            if b_start <= str(cohort.get("end")) and b_end >= str(cohort.get("start")):
                return True
    return False


def _adversarial_ok(payload: dict[str, Any]) -> bool:
    review = payload.get("adversarial_review") or {}
    if not isinstance(review, dict):
        return False
    return all(review.get(key) not in (None, "", UNKNOWN) for key in ADVERSARIAL_KEYS)


def _quality_reasons(cohorts: list[dict[str, Any]]) -> list[str]:
    reasons: list[str] = []
    if not cohorts:
        return [REASON_INSUFFICIENT_COHORTS]
    last_three = cohorts[-3:] if len(cohorts) >= 3 else cohorts
    stale_vals = [_rate(c, "efficiency", "stale_rate") for c in last_three]
    defect_vals = [_rate(c, "efficiency", "defect_rate") for c in last_three]
    if any(v is None for v in stale_vals + defect_vals):
        reasons.append(REASON_MISSING_DENOMINATOR)
        return reasons
    if any(v > STALE_RATE_MAX for v in stale_vals if v is not None):
        reasons.append(REASON_STALE_RATE_EXCEEDED)
    if any(v > DEFECT_RATE_MAX for v in defect_vals if v is not None):
        reasons.append(REASON_DEFECT_SPIKE)
    costs = [_num(c, "components", "input", "refresh_cost") for c in last_three]
    clicks = [_num(c, "components", "discovery", "non_branded_clicks") for c in last_three]
    if any(v is None for v in costs + clicks):
        reasons.append(REASON_MISSING_DENOMINATOR)
    elif len(costs) >= 2 and len(clicks) >= 2:
        cost_growth = (costs[-1] + 1.0) / (costs[0] + 1.0)
        demand_growth = (clicks[-1] + 1.0) / (clicks[0] + 1.0)
        if cost_growth > demand_growth:
            reasons.append(REASON_COST_EXCEEDS_DEMAND)
    return reasons


def _commercial_reasons(cohorts: list[dict[str, Any]]) -> list[str]:
    reasons: list[str] = []
    if len(cohorts) < MIN_COMPOUNDING_COHORTS:
        reasons.append(REASON_INSUFFICIENT_COHORTS)
        return reasons
    window = cohorts[-MIN_COMPOUNDING_COHORTS:]
    cts = [_rate(c, "qualified_use", "content_to_service_rate") for c in window]
    lq = [_rate(c, "commercial", "lead_to_qualified") for c in window]
    qp = [_rate(c, "commercial", "qualified_to_pipeline") for c in window]
    for series in (cts, lq, qp):
        if any(v is None for v in series):
            reasons.append(REASON_MISSING_DENOMINATOR)
            reasons.append(REASON_NORTH_STAR_UNKNOWN)
            return reasons
        if not _non_deteriorating(series):
            reasons.append(REASON_COMMERCIAL_GUARDRAIL_DETERIORATED)
            return reasons
    north = [_num(c, "components", "commercial", "qualified_pipeline_brl") for c in window]
    if any(v is None for v in north):
        reasons.append(REASON_NORTH_STAR_UNKNOWN)
    return reasons


def evaluate_compounding(cohorts: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    complete = _complete(cohorts)
    reasons: list[str] = []
    if _tracking_break_overlaps(payload, complete):
        reasons.append(REASON_TRACKING_BREAK)
    if len(complete) < MIN_COMPOUNDING_COHORTS:
        reasons.append(REASON_INSUFFICIENT_COHORTS)
        return {"passed": False, "reasons": reasons, "eligible": False}

    window = complete[-MIN_COMPOUNDING_COHORTS:]
    dpa = [_dpa(c) for c in window]
    if any(v is None for v in dpa):
        reasons.append(REASON_MISSING_DENOMINATOR)
    elif not (dpa[0] < dpa[1] < dpa[2]):
        reasons.append(REASON_DEMAND_PER_ASSET_NOT_IMPROVING)

    reasons.extend(_commercial_reasons(complete))
    reasons.extend(_quality_reasons(complete))
    # Dedupe while preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for reason in reasons:
        if reason not in seen:
            seen.add(reason)
            ordered.append(reason)
    return {
        "passed": not ordered,
        "reasons": ordered,
        "eligible": True,
        "dpa": dpa,
    }


def _primary_clicks(cohorts: list[dict[str, Any]]) -> list[float] | None:
    values: list[float] = []
    for cohort in cohorts:
        value = _num(cohort, "components", "discovery", "non_branded_clicks")
        if value is None:
            return None
        values.append(value)
    return values


def _mature_assets(cohorts: list[dict[str, Any]]) -> list[float] | None:
    values: list[float] = []
    for cohort in cohorts:
        value = _num(cohort, "components", "input", "mature_active_assets")
        if value is None:
            return None
        values.append(value)
    return values


def _per_asset_series(cohorts: list[dict[str, Any]]) -> dict[str, list[float]] | None:
    ids: set[str] = set()
    for cohort in cohorts:
        ids.update(cohort.get("asset_ids") or [])
    if not ids:
        return None
    series: dict[str, list[float]] = {asset_id: [] for asset_id in sorted(ids)}
    for cohort in cohorts:
        per_asset = cohort.get("per_asset_clicks") or {}
        for asset_id in series:
            raw = per_asset.get(asset_id, 0)
            if is_missing(raw):
                return None
            series[asset_id].append(float(raw))
    return series


def evaluate_exponential(cohorts: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    complete = _complete(cohorts)
    reasons: list[str] = []
    if len(complete) < MIN_EXPONENTIAL_COHORTS:
        reasons.append(REASON_INSUFFICIENT_COHORTS)
        return {
            "passed": False,
            "reasons": reasons,
            "eligible": False,
            "stats": None,
        }
    if _tracking_break_overlaps(payload, complete):
        reasons.append(REASON_TRACKING_BREAK)
    if not _adversarial_ok(payload):
        reasons.append(REASON_ADVERSARIAL_REVIEW_MISSING)

    compounding = evaluate_compounding(complete, payload)
    # Exponential does not require 3 consecutive DPA improvements, but does
    # require commercial/quality guardrails encoded in compounding except DPA.
    for reason in compounding["reasons"]:
        if reason in {
            REASON_DEMAND_PER_ASSET_NOT_IMPROVING,
            REASON_INSUFFICIENT_COHORTS,
        }:
            continue
        if reason not in reasons:
            reasons.append(reason)

    clicks = _primary_clicks(complete)
    assets = _mature_assets(complete)
    stats = None
    if clicks is None or assets is None:
        reasons.append(REASON_MISSING_DENOMINATOR)
    else:
        stats = fit_models(clicks)
        if not stats.get("r_positive"):
            reasons.append(REASON_LOG_RATE_NOT_POSITIVE)
        if not stats.get("log_beats_linear"):
            reasons.append(REASON_LINEAR_BETTER_THAN_LOG)
        if not clicks_per_asset_not_falling(clicks, assets):
            reasons.append(REASON_CLICKS_PER_ASSET_FALLING)
        if not demand_faster_than_assets(clicks, assets):
            reasons.append(REASON_DEMAND_NOT_FASTER_THAN_ASSETS)

        per_asset = _per_asset_series(complete)
        if per_asset is None:
            reasons.append(REASON_LEAVE_ONE_OUT_INFEASIBLE)
        else:
            lift = lift_share_by_asset(per_asset)
            stats["lift"] = lift
            if lift.get("exceeds_max"):
                reasons.append(REASON_SINGLE_ASSET_DOMINANCE)
            loo_fail = False
            for held_out in per_asset:
                residual = [0.0] * len(complete)
                for other, values in per_asset.items():
                    if other == held_out:
                        continue
                    for i, value in enumerate(values):
                        residual[i] += value
                loo_stats = fit_models(residual)
                if not (loo_stats.get("r_positive") and loo_stats.get("log_beats_linear")):
                    loo_fail = True
                    break
            stats["leave_one_out_preserved"] = not loo_fail
            if loo_fail:
                reasons.append(REASON_LEAVE_ONE_OUT_FAILED)

    seen: set[str] = set()
    ordered: list[str] = []
    for reason in reasons:
        if reason not in seen:
            seen.add(reason)
            ordered.append(reason)
    return {
        "passed": not ordered,
        "reasons": ordered,
        "eligible": True,
        "stats": stats,
    }


def _linear_or_plateau(cohorts: list[dict[str, Any]]) -> str:
    complete = _complete(cohorts)
    if len(complete) < MIN_COMPOUNDING_COHORTS:
        return "INSUFFICIENT_EVIDENCE"
    clicks = _primary_clicks(complete)
    if clicks is None:
        return "INSUFFICIENT_EVIDENCE"
    stats = fit_models(clicks)
    linear = stats.get("linear") or {}
    slope = linear.get("slope")
    dpa = [_dpa(c) for c in complete]
    dpa_obs = [v for v in dpa if v is not None]
    decaying = len(dpa_obs) >= 2 and dpa_obs[-1] < dpa_obs[0]
    if decaying or (slope is not None and slope <= 0):
        return "PLATEAU_OR_DECAY"
    return "LINEAR_CANDIDATE"


FORCE_INSUFFICIENT = frozenset(
    {
        REASON_TRACKING_BREAK,
        REASON_INCOMPLETE_WINDOW,
        REASON_NORTH_STAR_UNKNOWN,
        REASON_MISSING_DENOMINATOR,
    }
)


def classify_state(
    cohorts: list[dict[str, Any]],
    payload: dict[str, Any],
    *,
    extra_reasons: list[str] | None = None,
) -> dict[str, Any]:
    extra = list(extra_reasons or [])
    complete = _complete(cohorts)
    exponential = evaluate_exponential(cohorts, payload)
    compounding = evaluate_compounding(cohorts, payload)
    combined = extra + list(compounding["reasons"]) + list(exponential["reasons"])

    if exponential["passed"] and not extra:
        state = "EXPONENTIAL_CANDIDATE"
        reasons: list[str] = []
    elif compounding["passed"] and not extra:
        state = "COMPOUNDING_CANDIDATE"
        reasons = list(exponential["reasons"])
    elif not complete or (set(extra) | set(combined)) & FORCE_INSUFFICIENT:
        state = "INSUFFICIENT_EVIDENCE"
        reasons = list(extra)
        if len(complete) < MIN_COMPOUNDING_COHORTS:
            reasons.append(REASON_INSUFFICIENT_COHORTS)
        if not complete:
            reasons.append(REASON_INCOMPLETE_WINDOW)
        reasons.extend(combined)
    else:
        state = _linear_or_plateau(cohorts)
        reasons = combined

    if state == "SCALE_ALLOWED":
        state = "INSUFFICIENT_EVIDENCE"
        reasons.append(REASON_SCALE_NOT_AUTO)

    seen: set[str] = set()
    ordered: list[str] = []
    for reason in reasons:
        if reason not in seen:
            seen.add(reason)
            ordered.append(reason)

    return {
        "state": state,
        "reason_codes": ordered,
        "scale_allowed": False,
        "exponential_gate_eligible": False
        if state != "EXPONENTIAL_CANDIDATE"
        else True,
        "gates": {
            "compounding": {
                "passed": compounding["passed"],
                "reasons": compounding["reasons"],
            },
            "exponential": {
                "passed": exponential["passed"],
                "reasons": exponential["reasons"],
                "stats": exponential.get("stats"),
            },
        },
        "cohorts_complete": len(complete),
        "cohorts_available": len(cohorts),
    }
