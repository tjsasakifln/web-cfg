"""The #84 LIVE_PROVEN canary is registered from evidenced identifiers only."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.observation import validate_observation
from scripts.discovery.registry import load_cohort
from scripts.discovery.store import default_store_path, load_observations

EVIDENCED_ID = "valor-tipico-contratos-pavimentacao"
EVIDENCED_URL = "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
EVIDENCED_COMMIT = "6cc46a1a99f1af4c20778f5fcfa947d4758aaf94"
EVIDENCED_DEPLOY = "6a8351c558fa180008f11b16"
EVIDENCED_PAYLOAD = "568880b7eacf30e2adaf7481945fa50cfc77039be10b27ffc6af0959bf6c6d9d"
EVIDENCED_RENDERED = "185dcd038951689ef1482973c7bdc51d858c01b77bfeb460a2d05e2ece8d39fa"


def test_canary_is_registered_from_issue_84_evidence():
    cohort = load_cohort(root=ROOT)
    assert cohort["approved_asset_id"] == EVIDENCED_ID
    assert cohort["mode"] == "prepare-only"
    assert cohort["observation_mode"] == "live-read-only"
    asset = next(item for item in cohort["assets"] if item["id"] == EVIDENCED_ID)
    assert asset["canonical"] == EVIDENCED_URL
    assert asset["technical_status"] == "LIVE_PROVEN"
    assert asset["discovery_status"] == "DISCOVERY_UNKNOWN"
    assert asset["lead_status"] == "UNKNOWN"
    assert asset["revenue_status"] == "UNKNOWN"
    assert "DISCOVERY_PROVEN" not in str(asset)
    assert "LEAD_PROVEN" not in str(asset)
    assert "REVENUE_PROVEN" not in str(asset)
    assert asset["observation_start_at"] == "2026-08-17T18:25:58Z"
    assert asset["search_intent"] == "quanto_custa_ticket_contratual"
    assert asset["geography"]["code"] == "SC"
    assert asset["cta_family"] == "veja-sua-empresa"
    assert asset["offer_family"] == "defesa-margem"
    assert asset["offer_activation"] is False
    assert asset["hashes"]["payload_content_hash"] == EVIDENCED_PAYLOAD
    assert asset["hashes"]["rendered_content_hash"] == EVIDENCED_RENDERED
    assert asset["provenance"]["issue"] == 84
    assert asset["provenance"]["pr"] == 113
    assert asset["provenance"]["commit"] == EVIDENCED_COMMIT
    assert asset["provenance"]["deploy"] == EVIDENCED_DEPLOY
    assert asset["owner"] == "Tiago Sasaki"
    assert "issues/84" in asset["source_of_truth"]
    assert asset["index_intent"] == "DO_NOT_INDEX"
    assert asset["noindex"] is True
    assert asset["publicable"] is False
    # Previous noindex #84 member remains; we did not invent a replacement id.
    leftover = next(item for item in cohort["assets"] if item["id"] == "market-answer-aditivos-margem")
    assert leftover["index_intent"] == "DO_NOT_INDEX"
    assert leftover["canonical"] == "https://confenge.com.br/inteligencia/cenarios/aditivos-e-risco-de-margem/"


def test_committed_live_snapshots_are_valid_technical_probes_only():
    rows = load_observations(default_store_path(ROOT))
    assert rows, "live probe snapshot must be committed"
    for row in rows:
        validate_observation(row)
        assert row["observation_type"] == "technical_probe"
        assert row["asset_id"] == EVIDENCED_ID
    assert any(row.get("technical_status") == "TECHNICAL_LIVE" for row in rows)
    assert any(row.get("http", {}).get("status") == 200 for row in rows)
    assert any(row.get("declared_canonical") == EVIDENCED_URL for row in rows)
    # No imported GSC/outcome in the committed store: discovery stays unproven.
    assert all(row["observation_type"] != "gsc" for row in rows)
