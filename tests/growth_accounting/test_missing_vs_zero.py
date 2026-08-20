"""Missing stays UNKNOWN. Real zero with a complete denominator stays zero."""

from __future__ import annotations

from scripts.growth_accounting.constants import UNKNOWN, ZERO
from scripts.growth_accounting.report import build_report
from tests.growth_accounting.helpers import synthetic_input


def test_missing_clicks_are_unknown_not_zero():
    payload = synthetic_input(n_cohorts=1, clicks_for=lambda i, a: 0)
    payload["daily"][0].pop("clicks")
    payload["daily"][0]["clicks"] = UNKNOWN
    report = build_report(payload)
    clicks = report["cohorts"][0]["components"]["discovery"]["non_branded_clicks"]
    assert clicks["status"] == UNKNOWN
    assert clicks["value"] is None
    assert clicks["value"] != 0


def test_real_zero_clicks_with_complete_denominator():
    payload = synthetic_input(
        n_cohorts=1,
        clicks_for=lambda i, a: 0,
    )
    for row in payload["daily"]:
        row["impressions"] = 40
        row["clicks"] = 0
        row["engagement_admitted"] = 0
        row["content_to_service"] = 0
    report = build_report(payload)
    cohort = report["cohorts"][0]
    assert cohort["complete"] is True
    clicks = cohort["components"]["discovery"]["non_branded_clicks"]
    impressions = cohort["components"]["discovery"]["non_branded_impressions"]
    assert impressions["status"] != UNKNOWN
    assert impressions["value"] == 120
    assert clicks["status"] == ZERO
    assert clicks["value"] == 0


def test_unknown_north_star_not_coerced_to_zero():
    payload = synthetic_input(
        n_cohorts=3,
        clicks_for=lambda i, a: 3 * (2**i),
        omit_commercial=True,
    )
    report = build_report(payload)
    assert report["north_star"]["status"] == UNKNOWN
    assert report["north_star"]["value"] is None
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    commercial = report["components"]["commercial"]
    assert commercial["qualified_pipeline_brl"]["status"] == UNKNOWN
    assert commercial["qualified_pipeline_brl"]["value"] != 0
