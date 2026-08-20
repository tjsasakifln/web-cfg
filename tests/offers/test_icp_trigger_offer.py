"""#64 VALIDATE: home journeys map to catalog offer ids and keep trigger copy."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAPPING = ROOT / "data/offers/icp-trigger-offer.v1.json"
HOME = ROOT / "index.html"
REGISTRY = ROOT / "scripts/offers/registry.cjs"
REQUIRED_JOURNEYS = ("contrato", "edital", "operacao")


def test_icp_trigger_offer_maps_journeys_and_html() -> None:
    data = json.loads(MAPPING.read_text(encoding="utf-8"))
    home = HOME.read_text(encoding="utf-8")
    registry = REGISTRY.read_text(encoding="utf-8")
    journeys = {row["journey_id"]: row for row in data.get("journeys") or []}
    for journey_id in REQUIRED_JOURNEYS:
        row = journeys.get(journey_id)
        assert row, f"missing journey {journey_id}"
        offer_id = row.get("offer_id")
        assert offer_id, f"{journey_id} has no offer_id"
        assert offer_id in registry, f"{offer_id} not in catalog"
        assert row.get("trigger_sentence"), f"{journey_id} has no trigger_sentence"
    contrato = journeys["contrato"]["trigger_sentence"]
    assert contrato in home, "HTML lost the contrato trigger sentence"
    assert 'id="icp-trigger-contrato"' in home
    assert "smartlic" not in home.lower()
    assert "smartlic" not in json.dumps(data).lower()
