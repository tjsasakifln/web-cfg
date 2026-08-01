"""Post-cutover registry must match manifest and have unique page_ids."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_registry_dataset_hash_matches_manifest():
    data = ROOT / "data" / "pseo"
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    registry = json.loads((data / "registry.json").read_text(encoding="utf-8"))
    inv_path = data / "national-candidate-inventory.json"
    assert manifest.get("dataset_hash")
    assert registry.get("dataset_hash") == manifest.get("dataset_hash")
    if inv_path.exists():
        inv = json.loads(inv_path.read_text(encoding="utf-8"))
        assert inv.get("dataset_hash") == manifest.get("dataset_hash")


def test_registry_page_ids_unique():
    registry = json.loads((ROOT / "data" / "pseo" / "registry.json").read_text(encoding="utf-8"))
    ids = [p.get("page_id") for p in registry.get("pages") or []]
    assert ids
    assert len(ids) == len(set(ids)), "duplicate page_id in registry"


def test_prices_unique_and_registry_price_pages_match():
    data = ROOT / "data" / "pseo"
    prices = json.loads((data / "prices.json").read_text(encoding="utf-8"))
    registry = json.loads((data / "registry.json").read_text(encoding="utf-8"))
    price_ids = [p.get("id") for p in prices]
    assert len(price_ids) == len(set(price_ids))
    reg_price_ids = [
        p.get("page_id") for p in registry.get("pages") or [] if p.get("page_type") == "price"
    ]
    assert len(reg_price_ids) == len(set(reg_price_ids))
    # Registry price pages should not exceed unique price ids (dedupe path)
    assert len(reg_price_ids) == len(set(price_ids))
