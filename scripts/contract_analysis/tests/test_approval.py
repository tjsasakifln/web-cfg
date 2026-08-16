"""Drive shipped approval: triple binding, drift, fixture and mass refuse."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.approval import (
    ApprovalError,
    approval_allows_index,
    approval_triple,
    approve_all,
    approve_many,
    approve_one,
    find_approval,
    material_hash,
    withdraw_approval,
)
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.tests.helpers import complete_live_record


def test_triple_is_analysis_id_pack_version_content_hash():
    rec = complete_live_record()
    assert approval_triple(rec) == (rec["id"], rec["evidence_pack_version"], rec["content_hash"])


def test_changing_evidence_pack_version_after_approval_refuses_index(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    rec["approved_for_index"] = False
    assert find_approval(rec, root=tmp_path) is not None
    drifted = dict(rec)
    drifted["evidence_pack_version"] = "1.1-refreshed"
    drifted["material_hash"] = material_hash(drifted)
    ok, reasons = approval_allows_index(drifted, root=tmp_path)
    assert ok is False
    assert "approval_absent" in reasons or "approval_triple_mismatch" in reasons
    decision = evaluate_publication(drifted, cohort=[drifted])
    assert decision.state != "PUBLISHABLE_INDEX"


def test_changing_content_hash_after_approval_refuses_index(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    drifted = dict(rec)
    drifted["content_hash"] = "drifted-hash"
    drifted["approved_for_index"] = False
    drifted["material_hash"] = material_hash(drifted)
    decision = evaluate_publication(drifted, cohort=[drifted])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.indexable is False


def test_planted_fixture_approval_cannot_index(tmp_path):
    rec = complete_live_record(
        is_fixture=True,
        test_only=True,
        catalog_mode="fixture",
        source_kind="test_only_fixture",
        producer_status="official_live",
        approved_for_index=True,
    )
    planted = {
        "schema": "contract-analysis-approvals/1.0",
        "approvals": [
            {
                "analysis_id": rec["id"],
                "evidence_pack_version": rec["evidence_pack_version"],
                "content_hash": rec["content_hash"],
                "material_hash": material_hash(rec),
                "state": "PUBLISHABLE_INDEX",
                "rollback": "git:planted",
            }
        ],
    }
    path = tmp_path / "data" / "editorial" / "contract-analysis" / "approvals.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(planted), encoding="utf-8")
    with pytest.raises(ApprovalError, match="approval_refused_fixture"):
        approve_one(rec, actor="editor", rollback="git:x", root=tmp_path)
    ok, reasons = approval_allows_index(rec, root=tmp_path)
    assert ok is False
    assert "approval_refused_fixture" in reasons
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"


def test_mass_approval_path_fails():
    rec = complete_live_record()
    with pytest.raises(ApprovalError, match="mass_approval_forbidden"):
        approve_many([rec, rec])
    with pytest.raises(ApprovalError, match="mass_approval_forbidden"):
        approve_all([rec])


def test_withdraw_invalidates_stored_approval(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:revert:ca", root=tmp_path)
    rec["approved_for_index"] = False
    assert find_approval(rec, root=tmp_path) is not None
    withdraw_approval(rec["id"], actor="editor", reason="fast_withdrawal", root=tmp_path)
    assert find_approval(rec, root=tmp_path) is None
    ok, reasons = approval_allows_index(rec, root=tmp_path)
    assert ok is False
    assert "approval_absent" in reasons
