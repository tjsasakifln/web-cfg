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
    assert "asset-new" not in cohort["mature_asset_ids"]
    mature = cohort["components"]["input"]["mature_active_assets"]["value"]
    assert mature == 3
    # Cohort 1 stock is 3 assets * 6 clicks; the mid-cohort 50 clicks must
    # not enter the mature DPA numerator.
    assert cohort["mature_clicks"] == 18
    dpa = cohort["components"]["efficiency"]["clicks_per_mature_active_asset"]
    assert dpa["value"] == 6
    total_clicks = cohort["components"]["discovery"]["non_branded_clicks"]["value"]
    assert total_clicks == 68
    assert dpa["value"] != total_clicks / mature


def test_flat_stock_growing_mid_cohort_url_is_not_compounding():
    """Inventory growth of new URLs must not masquerade as demand-per-mature-asset compounding."""
    payload = synthetic_input(n_cohorts=3, clicks_for=lambda i, a: 10)
    for index, extra_clicks in enumerate((20, 80, 200)):
        day = ROOT_ORIGIN + timedelta(days=index * 28 + 10)
        payload["daily"].append(
            daily_row(
                day,
                f"asset-new-{index}",
                first_seen=day.isoformat(),
                clicks=extra_clicks,
                impressions=extra_clicks * 10,
                engagement_admitted=extra_clicks,
                content_to_service=extra_clicks * 0.25,
                lead_valid=8,
                lead_qualified=4,
                qualified_pipeline_brl=40000,
                refresh_cost=5,
                defects=0,
                stale_count=0,
                editorial_hours=1,
            )
        )
    report = build_report(payload)
    assert report["current_state"] != "COMPOUNDING_CANDIDATE"
    assert report["current_state"] != "EXPONENTIAL_CANDIDATE"
    dpas = []
    for cohort in report["cohorts"]:
        assert cohort["complete"] is True
        assert any(item.startswith("asset-new-") for item in cohort["mid_cohort_new_asset_ids"])
        dpa = cohort["components"]["efficiency"]["clicks_per_mature_active_asset"]["value"]
        dpas.append(dpa)
        # 3 stock assets * 10 clicks; new-URL clicks excluded from numerator.
        assert cohort["mature_clicks"] == 30
        assert dpa == 10
    assert dpas == [10, 10, 10]
    assert not (dpas[0] < dpas[1] < dpas[2])


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
