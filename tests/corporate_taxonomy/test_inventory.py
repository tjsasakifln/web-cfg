"""Drive the shipped B2G-hardcode inventory parser."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.corporate_taxonomy.inventory import (  # noqa: E402
    VALID_CLASSIFICATIONS,
    load_inventory,
)


def test_inventory_classifies_every_row() -> None:
    rows = load_inventory()
    assert len(rows) >= 20
    classes = {row["classificacao"] for row in rows}
    assert classes <= VALID_CLASSIFICATIONS
    assert "REPLACE" in classes
    assert "KEEP_VERTICAL" in classes
    assert "GENERALIZE_CORPORATE" in classes


def test_owned_strategy_files_are_inventoried() -> None:
    rows = load_inventory()
    files = {row["arquivo"] for row in rows}
    assert "docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md" in files
    assert "docs/strategy/MARKET-CAPTURE-OS.md" in files
    assert "AGENTS.md" in files
    assert "data/corporate/taxonomy.v1.json" in files


def test_truth_guards_are_not_removed_as_obsolete() -> None:
    rows = load_inventory()
    removed = [
        row
        for row in rows
        if row["classificacao"] == "REMOVE_OBSOLETE"
        and "truthful" in row["arquivo"]
    ]
    assert removed == []
    kept = [
        row
        for row in rows
        if "test_truthful_gates.py" in row["arquivo"]
        and row["classificacao"] == "KEEP_VERTICAL"
    ]
    assert kept
