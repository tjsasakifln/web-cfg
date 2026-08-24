from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.portfolio import evaluate_portfolio, load_json, CLASS_PATH, EXECUTE_SET_PATH  # noqa: E402


def test_capability_matrix_is_complete_and_fail_closed():
    report = evaluate_portfolio()
    assert report["ok"], report["fails"]
    assert report["capability_count"] == 10
    assert report["hold_count"] == 54
    assert report["by_class"] == {
        "DEFER": 2,
        "DROP": 4,
        "MIGRATION_ONLY": 1,
        "PORT_TO_WEB_CFG": 2,
        "REIMPLEMENT": 1,
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
