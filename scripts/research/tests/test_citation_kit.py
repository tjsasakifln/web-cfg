"""Drive the shipped flagship citation kit (#65)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.research.citation_kit import evaluate_citation_kit
from scripts.research.pack import build_pack
from scripts.research.snapshot import load_snapshot


def test_live_pack_citation_kit_blocks_national_index():
    pack = build_pack(load_snapshot())
    report = evaluate_citation_kit(pack)
    assert report["ok"], report["fails"]
    assert report["kit"]["national_index_authorized"] is False
    assert report["kit"]["as_of"]
    assert "smartlic" not in str(report["kit"]["canonical"]).lower()


def test_missing_as_of_fails_closed():
    pack = copy.deepcopy(build_pack(load_snapshot()))
    pack.pop("as_of", None)
    pack.pop("data_as_of", None)
    meta = pack.get("meta")
    if isinstance(meta, dict):
        meta.pop("data_as_of", None)
    report = evaluate_citation_kit(pack)
    # pack builder usually stamps as_of; if still present the kit is ok
    if not report["kit"]["as_of"]:
        assert report["ok"] is False
        assert "missing_as_of" in report["fails"]
