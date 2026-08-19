"""Drive the shipped partner-hypothesis gate (#66)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.distribution.partner import evaluate_partner, load_partner


def test_partner_hypothesis_is_manual_and_unknown():
    data = load_partner()
    report = evaluate_partner(data)
    assert report["ok"], report["fails"]
    assert data["auto_send"] is False
    assert data["partner"]["attribution"] == "UNKNOWN"
    assert data["outcomes"]["assisted_qco"] == "UNKNOWN"


def test_auto_send_fails_closed():
    data = copy.deepcopy(load_partner())
    data["auto_send"] = True
    report = evaluate_partner(data)
    assert report["ok"] is False
    assert "auto_send" in report["fails"]
