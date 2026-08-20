"""Fail-closed paths drive the shipped validator/generator, not a reimplementation."""

from __future__ import annotations

import json

import pytest

from scripts.growth_accounting.constants import (
    REASON_AGGREGATE_WITHOUT_PROVENANCE,
    REASON_DEFINITION_CHANGED,
    REASON_INCOMPATIBLE_SOURCE,
    REASON_INFERRED_OUTCOME,
    REASON_INVALID_CLOCK,
    REASON_LATE_ARRIVAL_UNRECONCILED,
    REASON_OVERLAPPING_WINDOWS,
    REASON_PAGE_COUNT_NOT_KPI,
    REASON_QUERY_LEVEL_PII,
    REASON_QUERY_TO_LEAD_JOIN_REFUSED,
    REASON_RETROACTIVE_REDEFINITION,
    REASON_WALL_CLOCK_FORBIDDEN,
)
from scripts.growth_accounting.errors import GrowthAccountingError
from scripts.growth_accounting.report import build_report
from scripts.growth_accounting.validate import validate_input
from tests.growth_accounting.helpers import exponential_clicks, synthetic_input


def _raises(reason: str, payload: dict) -> None:
    with pytest.raises(GrowthAccountingError) as exc:
        validate_input(payload)
    assert exc.value.reason == reason


def test_invalid_clock_naive_as_of():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["as_of"] = "2026-06-01T12:00:00"
    _raises(REASON_INVALID_CLOCK, payload)


def test_invalid_timezone():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["timezone"] = "UTC"
    _raises(REASON_INVALID_CLOCK, payload)


def test_wall_clock_forbidden():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["clock_source"] = "wall"
    _raises(REASON_WALL_CLOCK_FORBIDDEN, payload)


def test_changed_definition():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["definition_id"] = "CONFENGE_COMPOUNDING_STANDARD/0.9"
    _raises(REASON_DEFINITION_CHANGED, payload)


def test_retroactive_redefinition():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["prior_definition_id"] = "CONFENGE_COMPOUNDING_STANDARD/0.9"
    _raises(REASON_RETROACTIVE_REDEFINITION, payload)


def test_incompatible_source_family():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["daily"][0]["source_family"] = "facebook_ads"
    _raises(REASON_INCOMPATIBLE_SOURCE, payload)


def test_aggregate_without_provenance():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["snapshot_aggregates"] = [
        {
            "id": "orphan",
            "source_family": "organic_non_branded",
            "clicks": 10,
        }
    ]
    _raises(REASON_AGGREGATE_WITHOUT_PROVENANCE, payload)


def test_query_level_pii_refused():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["daily"][0]["query"] = "reequilibrio contrato obra"
    _raises(REASON_QUERY_LEVEL_PII, payload)


def test_query_to_lead_join_refused():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["flags"]["query_to_lead_join"] = True
    _raises(REASON_QUERY_TO_LEAD_JOIN_REFUSED, payload)


def test_inferred_outcome_refused():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["daily"][0]["inferred_from_clicks"] = True
    _raises(REASON_INFERRED_OUTCOME, payload)


def test_unreconciled_late_arrival():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["late_arrivals"] = [{"cohort_id": "c000", "reconciled": False}]
    _raises(REASON_LATE_ARRIVAL_UNRECONCILED, payload)


def test_overlapping_windows():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["cohort_windows"] = [
        {"start": "2026-01-05", "end": "2026-02-01"},
        {"start": "2026-01-20", "end": "2026-02-16"},
    ]
    _raises(REASON_OVERLAPPING_WINDOWS, payload)


def test_page_count_primary_refused():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["primary_series"] = "page_count"
    _raises(REASON_PAGE_COUNT_NOT_KPI, payload)


def test_incomplete_window_does_not_claim_compounding():
    payload = synthetic_input(n_cohorts=3, clicks_for=exponential_clicks)
    payload["as_of"] = "2026-01-10T12:00:00-03:00"
    report = build_report(payload)
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    assert report["current_state"] not in {
        "COMPOUNDING_CANDIDATE",
        "EXPONENTIAL_CANDIDATE",
    }
    assert "INCOMPLETE_WINDOW" in report["reason_codes"]
    for cohort in report["cohorts"]:
        assert cohort["complete"] is False


def test_fail_closed_does_not_emit_scale_allowed():
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    report = build_report(payload)
    dumped = json.dumps(report)
    assert report["current_state"] != "SCALE_ALLOWED"
    assert report["classification"]["scale_allowed"] is False
    assert "SCALE_ALLOWED" not in dumped or report["classification"]["state"] != "SCALE_ALLOWED"
