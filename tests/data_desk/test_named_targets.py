"""Drive named Data Desk syndication targets (#89)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data_desk.named_targets import evaluate_named_targets, load_targets
from scripts.data_desk.schema import SYNDICATION_TARGET_COUNT


def test_five_named_prepare_only_targets():
    data = load_targets()
    report = evaluate_named_targets(data)
    assert report["ok"], report["fails"]
    assert report["count"] == SYNDICATION_TARGET_COUNT
    assert data["auto_send"] is False
    assert data["sent"] is False
    for row in data["targets"]:
        assert row["target_nominal"]
        assert row["target_nominal"] != "UNNAMED"
        assert row["outcome"] == "UNKNOWN"


def test_unnamed_target_fails_closed():
    data = copy.deepcopy(load_targets())
    data["targets"][0]["target_nominal"] = "UNNAMED"
    report = evaluate_named_targets(data)
    assert report["ok"] is False
    assert any("unnamed" in f for f in report["fails"])
