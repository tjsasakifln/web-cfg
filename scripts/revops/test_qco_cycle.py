"""Drive the shipped founder-led QCO cycle gate (#64)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.revops.qco_cycle import evaluate_cycle, load_cycle


def test_fixture_cycle_keeps_unknown_and_blocks_bulk_send():
    data = load_cycle()
    report = evaluate_cycle(data)
    assert report["ok"], report["fails"]
    assert data["bulk_auto_send"] is False
    assert data["offer"]["charge_authorized"] is False
    assert report["outcomes"] == ["UNKNOWN"]
    assert data["icp"]["include"] and data["icp"]["exclude"] and data["icp"]["defer"]


def test_bulk_auto_send_fails_closed():
    data = copy.deepcopy(load_cycle())
    data["bulk_auto_send"] = True
    report = evaluate_cycle(data)
    assert report["ok"] is False
    assert "bulk_auto_send_must_be_false" in report["fails"]


def test_inferred_win_on_fixture_fails_closed():
    data = copy.deepcopy(load_cycle())
    data["accounts"][0]["outcome"] = "WON"
    data["accounts"][0]["pipeline"] = "qualified_pipeline"
    report = evaluate_cycle(data)
    assert report["ok"] is False


if __name__ == "__main__":
    test_fixture_cycle_keeps_unknown_and_blocks_bulk_send()
    test_bulk_auto_send_fails_closed()
    test_inferred_win_on_fixture_fails_closed()
    print("OK qco_cycle")
