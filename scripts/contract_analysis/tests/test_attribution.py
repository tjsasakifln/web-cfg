"""Attribution keep-list: analysis family stays, PII drops."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.attribution import KEEP_LIST, pick_attribution
from scripts.contract_analysis.tests.helpers import complete_live_record
from scripts.contract_analysis.attribution import attribution_payload


def test_keep_list_has_required_keys():
    for key in ("analysis_id", "evidence_pack_version", "asset_family", "correlation_id"):
        assert key in KEEP_LIST


def test_pick_keeps_family_and_drops_pii():
    rec = complete_live_record()
    payload = attribution_payload(rec, correlation_id="corr-1")
    payload["email"] = "ceo@empresa.com.br"
    payload["nome"] = "Alice"
    payload["telefone"] = "+5548988344559"
    payload["arbitrary"] = "drop"
    kept = pick_attribution(payload)
    assert kept["analysis_id"] == rec["id"]
    assert kept["evidence_pack_version"] == "1.0"
    assert kept["asset_family"]
    assert kept["correlation_id"] == "corr-1"
    assert "email" not in kept
    assert "nome" not in kept
    assert "telefone" not in kept
    assert "arbitrary" not in kept
