"""Drive the shipped exclusive-B2G corporate claim scanner."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.corporate_taxonomy.claims import (  # noqa: E402
    scan_owned_strategy_docs,
    scan_strategy_text,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_owned_strategy_docs_have_no_live_exclusive_b2g_thesis() -> None:
    findings = scan_owned_strategy_docs(ROOT)
    assert findings == []


def test_exclusive_b2g_fixture_fails_shipped_scanner() -> None:
    text = (FIXTURES / "exclusive-b2g-corporate-thesis.md").read_text(encoding="utf-8")
    hits = scan_strategy_text(text, source="exclusive-b2g-corporate-thesis.md")
    assert hits, hits
    assert any("B2G intelligence company" in row for row in hits)


def test_historical_block_is_not_a_live_corporate_claim() -> None:
    text = (FIXTURES / "historical-b2g-thesis.md").read_text(encoding="utf-8")
    hits = scan_strategy_text(text, source="historical-b2g-thesis.md")
    assert hits == []
