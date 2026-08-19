"""Drive the shipped inbound WIP canary registry (#61)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.knowledge_funnel.wip import evaluate_wip, load_registry


def test_registry_caps_one_canary_per_mechanism_and_lists_84():
    data = load_registry()
    report = evaluate_wip(data)
    assert report["ok"], report["fails"]
    ids = {row["id"] for row in data["mechanisms"]}
    assert "market_answer" in ids
    assert any(row.get("canary_issue") == 84 for row in data["mechanisms"])
    for row in data["mechanisms"]:
        assert row["count"] <= 1


def test_second_canary_on_same_mechanism_fails_closed():
    data = copy.deepcopy(load_registry())
    data["mechanisms"][0]["count"] = 2
    report = evaluate_wip(data)
    assert report["ok"] is False
    assert any("wip_exceeded" in f for f in report["fails"])
