"""#66 prepare-only: auto_send stays false."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.citation import citation_registry, prepare_citation
from scripts.contract_analysis.tests.helpers import complete_live_record
from scripts.distribution.schema import require_auto_send_false


def test_prepare_citation_auto_send_false_even_when_indexable():
    rec = complete_live_record()
    registry = citation_registry(rec, indexable=True)
    assert registry["auto_send"] is False
    require_auto_send_false(registry)
    report = prepare_citation(rec, indexable=True)
    assert report["auto_send"] is False
    assert report["registry_auto_send"] is False
    assert report.get("smtp_called") is False
    assert report.get("webhook_called") is False


def test_fixture_citation_does_not_distribute():
    rec = complete_live_record(is_fixture=True, catalog_mode="fixture", source_kind="test_only_fixture")
    report = prepare_citation(rec, indexable=False)
    assert report["auto_send"] is False
    assert report["kill_gates"]["distribute"] is False
