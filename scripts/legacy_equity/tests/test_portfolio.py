from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.portfolio import evaluate_portfolio, load_json, CLASS_PATH, EXECUTE_SET_PATH  # noqa: E402


def test_capability_matrix_is_complete_and_fail_closed():
    report = evaluate_portfolio()
    assert report["ok"], report["fails"]
    assert report["capability_count"] == 11
    assert report["hold_count"] == 54
    assert report["by_class"] == {
        "DEFER": 3,
        "DROP": 4,
        "KEEP_TEMPORARILY_FOR_MIGRATION": 1,
        "PORT_TO_WEB_CFG": 2,
        "REIMPLEMENT_IN_WEB_CFG": 1,
    }


def test_unknown_class_and_smartlic_runtime_fail():
    data = load_json(CLASS_PATH)
    execute = load_json(EXECUTE_SET_PATH)
    data["capabilities"][0]["class"] = "KEEP_AS_RUNTIME"
    data["capabilities"][0]["smartlic_runtime"] = True
    report = evaluate_portfolio(data, execute)
    assert not report["ok"]
    assert any(item.startswith("invalid_class:") for item in report["fails"])
    assert any(item.startswith("smartlic_runtime:") for item in report["fails"])


def test_every_hold_is_classified_exactly_once():
    data = load_json(CLASS_PATH)
    execute = load_json(EXECUTE_SET_PATH)
    data["capabilities"][0]["legacy_hold_paths"].pop()
    report = evaluate_portfolio(data, execute)
    assert not report["ok"]
    assert any(item.startswith("unclassified_hold:") for item in report["fails"])


def test_review_date_expires_against_injected_current_date():
    data = load_json(CLASS_PATH)
    execute = load_json(EXECUTE_SET_PATH)
    from datetime import date

    report = evaluate_portfolio(data, execute, today=date(2026, 9, 21))
    assert not report["ok"]
    assert "hold_review_date_stale" in report["fails"]


def test_capability_ids_and_required_content_are_fail_closed():
    data = load_json(CLASS_PATH)
    execute = load_json(EXECUTE_SET_PATH)
    data["capabilities"][0]["id"] = "invented-capability"
    data["capabilities"][0]["justification"] = ""
    report = evaluate_portfolio(data, execute)
    assert not report["ok"]
    assert any(item.startswith("missing_capability:") for item in report["fails"])
    assert any(item.startswith("unknown_capability:") for item in report["fails"])
    assert any(item.startswith("empty_field:") for item in report["fails"])
