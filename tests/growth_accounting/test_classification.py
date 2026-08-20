"""Compounding/exponential gates on labeled SYNTHETIC fixtures; current path stays insufficient."""

from __future__ import annotations

from scripts.growth_accounting.constants import (
    REASON_CLICKS_PER_ASSET_FALLING,
    REASON_COMMERCIAL_GUARDRAIL_DETERIORATED,
    REASON_COST_EXCEEDS_DEMAND,
    REASON_DEFECT_SPIKE,
    REASON_INSUFFICIENT_COHORTS,
    REASON_LEAVE_ONE_OUT_FAILED,
    REASON_LINEAR_BETTER_THAN_LOG,
    REASON_SINGLE_ASSET_DOMINANCE,
    REASON_STALE_PAYLOAD,
    REASON_TRACKING_BREAK,
)
from scripts.growth_accounting.report import build_report
from tests.growth_accounting.helpers import (
    ASSETS,
    exponential_clicks,
    linear_clicks,
    synthetic_input,
)


def test_fewer_than_six_cohorts_not_exponential():
    payload = synthetic_input(n_cohorts=5, clicks_for=exponential_clicks)
    report = build_report(payload)
    assert report["cohorts_complete"] == 5
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"
    assert report["exponential_gate_eligible"] is False
    assert REASON_INSUFFICIENT_COHORTS in report["classification"]["gates"]["exponential"]["reasons"]


def test_three_cohorts_can_be_compounding_candidate():
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    report = build_report(payload)
    assert report["current_state"] == "COMPOUNDING_CANDIDATE"
    assert report["classification"]["gates"]["compounding"]["passed"] is True
    assert report["exponential_gate_eligible"] is False


def test_exponential_candidate_on_labeled_synthetic_only():
    payload = synthetic_input(n_cohorts=6, clicks_for=exponential_clicks)
    report = build_report(payload)
    assert payload["labeled_synthetic"] is True
    assert report["labeled_synthetic"] is True
    assert report["current_state"] == "EXPONENTIAL_CANDIDATE"
    stats = report["classification"]["gates"]["exponential"]["stats"]
    assert stats["r_positive"] is True
    assert stats["log_beats_linear"] is True
    assert stats["leave_one_out_preserved"] is True
    assert report["classification"]["scale_allowed"] is False


def test_linear_better_than_log_is_not_exponential():
    payload = synthetic_input(n_cohorts=6, clicks_for=linear_clicks)
    report = build_report(payload)
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"
    reasons = report["classification"]["gates"]["exponential"]["reasons"]
    assert REASON_LINEAR_BETTER_THAN_LOG in reasons


def test_log_better_but_commercial_guardrail_deteriorating():
    payload = synthetic_input(
        n_cohorts=6,
        clicks_for=exponential_clicks,
        deteriorate_commercial=True,
    )
    report = build_report(payload)
    assert report["current_state"] not in {
        "COMPOUNDING_CANDIDATE",
        "EXPONENTIAL_CANDIDATE",
    }
    assert (
        REASON_COMMERCIAL_GUARDRAIL_DETERIORATED
        in report["classification"]["gates"]["compounding"]["reasons"]
    )
    assert (
        REASON_COMMERCIAL_GUARDRAIL_DETERIORATED
        in report["classification"]["gates"]["exponential"]["reasons"]
    )


def test_pipeline_and_revenue_unknown():
    payload = synthetic_input(
        n_cohorts=6,
        clicks_for=exponential_clicks,
        omit_commercial=True,
    )
    report = build_report(payload)
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    assert report["north_star"]["status"] == "UNKNOWN"
    assert report["components"]["commercial"]["received_revenue_brl"]["status"] == "UNKNOWN"
    assert report["components"]["commercial"]["contracted_revenue_brl"]["status"] == "UNKNOWN"


def test_tracking_break_blocks_claims():
    payload = synthetic_input(n_cohorts=6, clicks_for=exponential_clicks)
    payload["tracking_breaks"] = [
        {"start": "2026-02-01", "end": "2026-02-10", "reason": "analytics_tag_gap"}
    ]
    report = build_report(payload)
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    assert REASON_TRACKING_BREAK in report["reason_codes"]
    assert report["current_state"] not in {
        "COMPOUNDING_CANDIDATE",
        "EXPONENTIAL_CANDIDATE",
    }


def test_single_asset_over_sixty_percent_lift():
    def clicks(index: int, asset_id: str) -> float:
        if asset_id == "asset-a":
            return float(2 * (2**index))
        return 1.0

    payload = synthetic_input(n_cohorts=6, clicks_for=clicks)
    report = build_report(payload)
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"
    reasons = report["classification"]["gates"]["exponential"]["reasons"]
    assert REASON_SINGLE_ASSET_DOMINANCE in reasons or REASON_LEAVE_ONE_OUT_FAILED in reasons


def test_leave_one_out_failure():
    def clicks(index: int, asset_id: str) -> float:
        if asset_id == "asset-a":
            return float(3 * (2**index))
        if asset_id == "asset-b":
            return 1.0
        return 1.0

    payload = synthetic_input(n_cohorts=6, clicks_for=clicks, assets=ASSETS)
    report = build_report(payload)
    reasons = report["classification"]["gates"]["exponential"]["reasons"]
    assert REASON_LEAVE_ONE_OUT_FAILED in reasons or REASON_SINGLE_ASSET_DOMINANCE in reasons
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"


def test_cost_growing_faster_than_demand():
    payload = synthetic_input(
        n_cohorts=3,
        clicks_for=lambda i, a: 10,
        cost_for=lambda i: 10 * (5**i),
    )
    report = build_report(payload)
    assert report["current_state"] not in {
        "COMPOUNDING_CANDIDATE",
        "EXPONENTIAL_CANDIDATE",
    }
    assert REASON_COST_EXCEEDS_DEMAND in report["classification"]["gates"]["compounding"]["reasons"]


def test_defect_spike():
    payload = synthetic_input(
        n_cohorts=3,
        clicks_for=exponential_clicks,
        defects_for=lambda i: 20 if i == 2 else 0,
    )
    report = build_report(payload)
    assert REASON_DEFECT_SPIKE in report["classification"]["gates"]["compounding"]["reasons"]
    assert report["current_state"] != "COMPOUNDING_CANDIDATE"


def test_stale_payload():
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    payload["payload_observed_at"] = "2026-01-01T12:00:00-03:00"
    report = build_report(payload)
    assert REASON_STALE_PAYLOAD in report["reason_codes"]


def test_clicks_per_asset_falling_blocks_exponential():
    def clicks(index: int, asset_id: str) -> float:
        # Demand grows slower than inventory: more assets over time via extra
        # clicks falling per asset.
        return float(30 - 4 * index)

    payload = synthetic_input(n_cohorts=6, clicks_for=clicks)
    report = build_report(payload)
    reasons = report["classification"]["gates"]["exponential"]["reasons"]
    assert (
        REASON_CLICKS_PER_ASSET_FALLING in reasons
        or report["current_state"] != "EXPONENTIAL_CANDIDATE"
    )
