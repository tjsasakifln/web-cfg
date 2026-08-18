"""Handoff inspector: missing official-live DATA_READY stays FACTUAL_HANDOFF_PENDING."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.handoff import FACTUAL_HANDOFF_PENDING, inspect_handoff


def test_preferred_handoff_absent_is_pending():
    result = inspect_handoff()
    assert result["status"] == FACTUAL_HANDOFF_PENDING
    assert result["path"] is None
    assert result["data_ready_count"] == 0
    assert "no_official_live_DATA_READY_pack" in result["reasons"]


def test_load_canary_records_factual_handoff_pending():
    bundle = load_canary()
    assert bundle.get("handoff", {}).get("status") == FACTUAL_HANDOFF_PENDING
    assert bundle.get("live_absent") is True
    assert all(rec.get("is_fixture") for rec in bundle["records"])


def test_explicit_missing_path_is_pending(tmp_path):
    result = inspect_handoff(tmp_path / "no-such-handoff")
    assert result["status"] == FACTUAL_HANDOFF_PENDING
