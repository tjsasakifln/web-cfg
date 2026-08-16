"""Kill conditions fire from registered fields via evaluate_kill_conditions()."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.family import select_family
from scripts.paid_search.kill import evaluate_kill_conditions
from scripts.paid_search.package import build_package


def test_package_registers_four_kill_specs():
    package = build_package(select_family(ROOT))
    ids = {spec["id"] for spec in package["kill"]["specs"]}
    assert ids == {
        "cap_without_qualified_intent",
        "misaligned_search_terms",
        "low_lead_quality",
        "tracking_does_not_reconcile",
    }
    idle = evaluate_kill_conditions(package["kill"])
    assert idle["fired"] == []
    assert idle["should_pause"] is False


def test_cap_without_qualified_intent_fires():
    result = evaluate_kill_conditions(
        {
            "spend_brl": 150,
            "hard_stop_spend_brl": 100,
            "qualified_intent_signals": 0,
        }
    )
    assert result["should_pause"] is True
    assert result["fired"][0]["id"] == "cap_without_qualified_intent"
    assert result["fired"][0]["action"] == "PAUSE"


def test_cap_does_not_fire_without_approved_cap():
    result = evaluate_kill_conditions(
        {
            "spend_brl": 150,
            "hard_stop_spend_brl": None,
            "qualified_intent_signals": 0,
        }
    )
    ids = {row["id"] for row in result["fired"]}
    assert "cap_without_qualified_intent" not in ids


def test_misaligned_search_terms_fires():
    result = evaluate_kill_conditions(
        {
            "search_term_mismatch_rate": 0.5,
            "search_terms_observed": 8,
            "mismatch_rate_threshold": 0.4,
            "mismatch_min_terms": 5,
        }
    )
    assert any(row["id"] == "misaligned_search_terms" for row in result["fired"])


def test_low_lead_quality_fires():
    result = evaluate_kill_conditions(
        {
            "valid_leads": 5,
            "qualified_lead_rate": 0.1,
            "quality_min_valid_leads": 3,
            "quality_rate_threshold": 0.2,
        }
    )
    assert any(row["id"] == "low_lead_quality" for row in result["fired"])


def test_tracking_reconcile_fires():
    result = evaluate_kill_conditions({"tracking_reconcile_ok": False})
    assert result["fired"][0]["id"] == "tracking_does_not_reconcile"
