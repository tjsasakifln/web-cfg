"""Drive the shipped execute-set vs HOLD gate (#62)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.execute_hold import evaluate_execute_hold, load_execute, load_inventory


def test_committed_execute_set_excludes_holds_and_home():
    report = evaluate_execute_hold()
    assert report["ok"], report["fails"]
    assert report["hold_count"] >= 1
    assert report["execute_redirects"] >= 1


def test_hold_row_in_execute_fails_closed():
    inventory = copy.deepcopy(load_inventory())
    execute = copy.deepcopy(load_execute())
    hold = next(
        e for e in inventory["entries"] if e["action"] == "HOLD_TARGET_NOT_READY"
    )
    execute["redirects"].append(
        {
            "legacy_url": hold["legacy_url"],
            "target_url": "https://confenge.com.br/aditivos-obras-publicas/",
        }
    )
    report = evaluate_execute_hold(inventory, execute)
    assert report["ok"] is False
    assert any("hold_in_execute" in f for f in report["fails"])


def test_home_dump_fails_closed():
    inventory = load_inventory()
    execute = copy.deepcopy(load_execute())
    execute["redirects"][0]["target_url"] = "https://confenge.com.br/"
    report = evaluate_execute_hold(inventory, execute)
    assert report["ok"] is False
    assert any("blanket_home" in f for f in report["fails"])
