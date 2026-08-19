"""Drive the shipped contract-analysis canary verdict (#83)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.canary_verdict import evaluate_verdict, load_approvals


def test_live_approvals_do_not_expand_on_unknown_evidence():
    data = load_approvals()
    report = evaluate_verdict(data)
    assert report["ok"], report["fails"]
    assert report["verdict"] in {"EXPAND", "ADJUST", "KILL", "UNKNOWN"}
    if report["evidence"] in {None, "", "UNKNOWN"}:
        assert report["verdict"] != "EXPAND"


def test_expand_without_evidence_fails_closed():
    report = evaluate_verdict({"canary_verdict": "EXPAND", "canary_evidence": "UNKNOWN"})
    assert report["ok"] is False
    assert "expand_without_evidence" in report["fails"]
