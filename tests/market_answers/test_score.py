"""Candidate score and reason codes come from the shipped record, not hardcoded totals."""

from __future__ import annotations

from scripts.market_answers import SCORE_COMPONENTS, SCORE_VERSION
from scripts.market_answers.score import score_candidate
from tests.market_answers.helpers import load_shipped_candidate, load_shipped_fixture


def test_score_from_record_keeps_unknown_demand():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    result = score_candidate(record, payload)
    assert result.version == SCORE_VERSION
    assert set(result.components) == set(SCORE_COMPONENTS)
    assert result.components["demand"] is None
    assert "demand" in result.unknown_components
    assert "demand_UNKNOWN" in result.reason_codes
    assert record["demand"]["status"] == "UNKNOWN"
    assert result.total is not None
    # UNKNOWN demand is excluded, not zeroed into the total.
    assert "demand" not in result.weights_used
    for name in SCORE_COMPONENTS:
        if name == "demand":
            continue
        assert name in result.reason_codes or any(
            code.startswith(name) for code in result.reason_codes
        )


def test_score_moves_when_record_component_moves():
    record = load_shipped_candidate()
    baseline = score_candidate(record)
    raised = dict(record)
    raised["utility"] = {"score": 0.1, "reason_codes": ["utility_weak"]}
    moved = score_candidate(raised)
    assert moved.components["utility"] == 0.1
    assert moved.total is not None and baseline.total is not None
    assert moved.total < baseline.total
    assert "utility_weak" in moved.reason_codes


def test_unknown_demand_string_stays_unknown():
    record = load_shipped_candidate()
    record = dict(record)
    record["demand"] = "UNKNOWN"
    result = score_candidate(record)
    assert result.components["demand"] is None
    assert "demand_UNKNOWN" in result.reason_codes
