"""Drive the shipped Market Signals Brief gate (#90)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.revops.market_signals_brief import evaluate_brief, load_brief


def test_brief_is_prepare_only_with_consent_and_unsubscribe():
    data = load_brief()
    report = evaluate_brief(data)
    assert report["ok"], report["fails"]
    assert data["auto_send"] is False
    assert data["edition"]["sent"] is False
    assert data["audience_is_not_lead"] is True
    assert "/nurture/sair" in data["consent"]["unsubscribe_url"]
    sair = ROOT / "nurture" / "sair" / "index.html"
    assert sair.is_file()


def test_auto_send_fails_closed():
    data = copy.deepcopy(load_brief())
    data["auto_send"] = True
    report = evaluate_brief(data)
    assert report["ok"] is False
    assert "auto_send" in report["fails"]


if __name__ == "__main__":
    test_brief_is_prepare_only_with_consent_and_unsubscribe()
    test_auto_send_fails_closed()
    print("OK market_signals_brief")
