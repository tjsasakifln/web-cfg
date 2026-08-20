"""Mid-cohort URL, refresh-without-new-asset, overlap already fail-closed."""

from __future__ import annotations

from datetime import timedelta

from scripts.growth_accounting.report import build_report
from tests.growth_accounting.helpers import (
    ROOT_ORIGIN,
    daily_row,
    exponential_clicks,
    synthetic_input,
)


def test_new_url_mid_cohort_is_not_mature():
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    mid = ROOT_ORIGIN + timedelta(days=28 + 10)
    payload["daily"].append(
        daily_row(
            mid,
            "asset-new",
            first_seen=mid.isoformat(),
            clicks=50,
            impressions=200,
            engagement_admitted=10,
            content_to_service=2,
            lead_valid=1,
            lead_qualified=1,
            qualified_pipeline_brl=1000,
            refresh_cost=1,
            defects=0,
            stale_count=0,
            editorial_hours=1,
        )
    )
    report = build_report(payload)
    cohort = next(c for c in report["cohorts"] if c["index"] == 1)
    assert "asset-new" in cohort["mid_cohort_new_asset_ids"]
    mature = cohort["components"]["input"]["mature_active_assets"]["value"]
    assert mature == 3


def test_refresh_without_new_asset():
    payload = synthetic_input(n_cohorts=2, clicks_for=lambda i, a: 10)
    for row in payload["daily"]:
        if row["date"] == (ROOT_ORIGIN + timedelta(days=28)).isoformat():
            row["substantive_changes"] = 2
    report = build_report(payload)
    cohort = next(c for c in report["cohorts"] if c["index"] == 1)
    assert cohort["refresh_without_new_asset"] is True
    assert cohort["mid_cohort_new_asset_ids"] == []
    assert cohort["components"]["input"]["approved_indexable_assets"]["value"] == 3


def test_cohort_days_are_28_and_non_overlapping():
    payload = synthetic_input(n_cohorts=4, clicks_for=exponential_clicks)
    report = build_report(payload)
    assert report["cohort_days"] == 28
    ends = []
    for cohort in report["cohorts"]:
        assert cohort["complete"] is True
        starts = cohort["start"]
        end = cohort["end"]
        for prev_end in ends:
            assert starts > prev_end
        ends.append(end)
