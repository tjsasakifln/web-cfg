"""Drive the shipped Market Answer candidate-record gate (#84)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.market_answers.candidate_record import evaluate_candidate, load_candidate


def test_shipped_candidate_is_complete_and_demand_unknown():
    data = load_candidate()
    report = evaluate_candidate(data)
    assert report["ok"], report["fails"]
    assert data["demand"]["status"] == "UNKNOWN"
    assert data["kill_gate"]
    assert data["cta"]["lead_gate"] is False
    assert data.get("attribution_source") == "CONFENGE_WEB"


def test_dropping_question_fails_closed():
    data = copy.deepcopy(load_candidate())
    data["question"] = ""
    report = evaluate_candidate(data)
    assert report["ok"] is False
    assert "missing_question" in report["fails"]
