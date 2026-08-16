"""Correction / refresh / fast withdrawal drive shipped invalidate + gate."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.approval import approve_one, find_approval
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.invalidate import apply_correction, apply_fast_withdraw, apply_refresh
from scripts.contract_analysis.tests.helpers import complete_live_record


def test_correction_leaves_publishable_index():
    rec = complete_live_record()
    assert evaluate_publication(rec, cohort=[rec]).state == "PUBLISHABLE_INDEX"
    corrected = apply_correction(
        rec,
        {"date": "2026-08-16", "text": "Correção material do fato de planilha."},
    )
    decision = evaluate_publication(corrected, cohort=[corrected])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "correction_invalidated" in decision.reason_codes


def test_refresh_changes_triple_and_refuses_index(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    rec["approved_for_index"] = False
    assert find_approval(rec, root=tmp_path) is not None
    refreshed = apply_refresh(rec, evidence_pack_version="2.0", content_hash="new-hash")
    decision = evaluate_publication(refreshed, cohort=[refreshed])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert find_approval(refreshed, root=tmp_path) is None


def test_fast_withdraw_rejects_and_cannot_index(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    withdrawn = apply_fast_withdraw(rec, reason="reputational_risk", actor="editor", root=tmp_path)
    decision = evaluate_publication(withdrawn, cohort=[withdrawn])
    assert decision.state == "REJECT"
    assert decision.indexable is False
    assert "withdrawn" in decision.reason_codes
    assert find_approval(rec, root=tmp_path) is None
