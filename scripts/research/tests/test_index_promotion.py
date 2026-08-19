"""Drive the shipped recurring-index promotion gate (#91)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.research.index_promotion import (
    evaluate_promotion,
    load_gate,
    may_build_index,
)


def test_committed_gate_defers_until_flagship_proof():
    data = load_gate()
    report = evaluate_promotion(data)
    assert report["ok"], report["fails"]
    assert data["decision_state"] == "DEFER"
    assert data["build_authorized"] is False
    assert data["public_url_authorized"] is False
    assert may_build_index(data) is False
    assert data["flagship_citation_proof"]["status"] == "UNKNOWN"


def test_unknown_proof_cannot_authorize_build():
    data = copy.deepcopy(load_gate())
    data["build_authorized"] = True
    data["decision_state"] = "EXECUTE_NOW"
    report = evaluate_promotion(data)
    assert report["ok"] is False
    assert "build_authorized_without_proof" in report["fails"]
    assert may_build_index(data) is False
