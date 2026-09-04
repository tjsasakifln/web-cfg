"""Repositioning must not delete the shipped truth-guard fixture path."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.test_copy_gates import evaluate_copy_html  # noqa: E402
from scripts.site.test_truthful_gates import (  # noqa: E402
    test_forbidden_phrase_fixture_fails_shipped_copy_scanner,
)


def test_forbidden_phrase_truth_guard_still_fails_closed() -> None:
    fixture = ROOT / "scripts" / "site" / "fixtures" / "truthful_gates" / "forbidden-phrase.html"
    assert fixture.is_file()
    hits = evaluate_copy_html(fixture.read_text(encoding="utf-8"), str(fixture))
    assert hits
    assert any("Conversão com utilidade real" in hit for hit in hits)
    test_forbidden_phrase_fixture_fails_shipped_copy_scanner()


def test_truthful_gates_module_was_not_deleted() -> None:
    path = ROOT / "scripts" / "site" / "test_truthful_gates.py"
    fixture = ROOT / "scripts" / "site" / "fixtures" / "truthful_gates" / "forbidden-phrase.html"
    assert path.is_file()
    assert fixture.is_file()
    source = path.read_text(encoding="utf-8")
    assert "def test_forbidden_phrase_fixture_fails_shipped_copy_scanner" in source
    assert "from scripts.site.test_copy_gates import evaluate_copy_html" in source
