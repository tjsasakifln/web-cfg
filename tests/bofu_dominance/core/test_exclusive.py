"""Core tree must not import organic/revops/discovery engines."""

from __future__ import annotations

from scripts.bofu_dominance.core.exclusive import owned_relative_paths, scan_forbidden_imports
from tests.bofu_dominance.core.helpers import ROOT


def test_core_does_not_import_other_engines():
    hits = scan_forbidden_imports()
    assert hits == []


def test_core_does_not_recreate_organic_engine_symbols():
    text = (ROOT / "scripts" / "bofu_dominance" / "core" / "ledger.py").read_text(encoding="utf-8")
    assert "demand_graph" not in text
    assert "SEO_OPPORTUNITIES" not in text
    assert "rank_opportunities" not in text


def test_owned_paths_are_the_exclusive_tree():
    owned = owned_relative_paths()
    assert "scripts/bofu_dominance/core/" in owned
    assert "data/bofu-dominance/core/" in owned
    assert "docs/seo/bofu-dominance/core/" in owned
    assert "tests/bofu_dominance/core/" in owned
    assert "scripts/organic/" not in owned
