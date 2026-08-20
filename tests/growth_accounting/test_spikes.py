"""Paid/branded/legacy/direct spikes stay separated from the primary series."""

from __future__ import annotations

from datetime import timedelta

from scripts.growth_accounting.report import build_report
from tests.growth_accounting.helpers import (
    ROOT_ORIGIN,
    daily_row,
    exponential_clicks,
    synthetic_input,
)


def _spike(family: str) -> dict:
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    day = ROOT_ORIGIN + timedelta(days=28)
    payload["daily"].append(
        daily_row(
            day,
            "paid-or-other",
            source_family=family,
            clicks=10000,
            impressions=50000,
        )
    )
    return payload


def _primary_clicks(report: dict) -> float:
    last = report["cohorts"][-1]
    # Use cohort 1 (index 1) where the spike is injected.
    target = next(c for c in report["cohorts"] if c["index"] == 1)
    return target["components"]["discovery"]["non_branded_clicks"]["value"]


def test_paid_spike_separated():
    baseline = build_report(synthetic_input(n_cohorts=3, clicks_for=exponential_clicks))
    report = build_report(_spike("paid"))
    assert report["flags"]["source_families_separated"] is True
    assert _primary_clicks(report) == _primary_clicks(baseline)
    paid = report["source_families"]["paid"]["clicks"]["value"]
    assert paid == 10000
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"


def test_branded_spike_separated():
    baseline = build_report(synthetic_input(n_cohorts=3, clicks_for=exponential_clicks))
    report = build_report(_spike("organic_branded"))
    assert _primary_clicks(report) == _primary_clicks(baseline)
    assert report["source_families"]["organic_branded"]["clicks"]["value"] == 10000
    branded = report["cohorts"][1]["components"]["moat"]["branded_clicks_secondary"]
    assert branded["value"] == 10000


def test_legacy_smartlic_spike_separated():
    baseline = build_report(synthetic_input(n_cohorts=3, clicks_for=exponential_clicks))
    report = build_report(_spike("legacy_brand"))
    assert _primary_clicks(report) == _primary_clicks(baseline)
    assert report["source_families"]["legacy_brand"]["clicks"]["value"] == 10000


def test_direct_spike_separated():
    baseline = build_report(synthetic_input(n_cohorts=3, clicks_for=exponential_clicks))
    report = build_report(_spike("direct"))
    assert _primary_clicks(report) == _primary_clicks(baseline)
    assert report["source_families"]["direct"]["clicks"]["value"] == 10000


def test_single_asset_outlier_does_not_masquerade_as_compounding_of_the_stock():
    def clicks(index: int, asset_id: str) -> float:
        if asset_id == "asset-a":
            return float(100 * (index + 1))
        return 2.0

    payload = synthetic_input(n_cohorts=6, clicks_for=clicks)
    report = build_report(payload)
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"
    lift = (report["classification"]["gates"]["exponential"].get("stats") or {}).get("lift") or {}
    if lift:
        assert lift.get("exceeds_max") is True
