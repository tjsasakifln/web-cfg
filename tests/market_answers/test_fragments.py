"""Every in-page fragment link resolves and no id repeats (A11Y-FRAGMENTOS-02)."""

from __future__ import annotations

import re
from collections import Counter
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import PAGE_DIR, render_html
from tests.market_answers.helpers import load_shipped_candidate, load_shipped_fixture

ROOT = Path(__file__).resolve().parents[2]
SHIPPED = ROOT / PAGE_DIR / "index.html"
TODAY = date(2026, 8, 17)


class _Doc(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragments: list[str] = []

    def handle_starttag(self, tag, attrs):
        row = dict(attrs)
        if row.get("id"):
            self.ids.append(row["id"])
        href = row.get("href") or ""
        if tag == "a" and href.startswith("#") and len(href) > 1:
            self.fragments.append(href[1:])


def _parse(html: str) -> _Doc:
    doc = _Doc()
    doc.feed(html)
    return doc


def _rendered() -> str:
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    return render_html(record, payload, decision)


def _assert_fragments_resolve(html: str) -> None:
    doc = _parse(html)
    ids = set(doc.ids)
    missing = sorted({frag for frag in doc.fragments if frag not in ids})
    assert not missing, f"href=#x sem id correspondente: {missing}"
    duplicated = sorted(name for name, count in Counter(doc.ids).items() if count > 1)
    assert not duplicated, f"id duplicado: {duplicated}"


def test_rendered_fragment_links_resolve_and_ids_are_unique():
    _assert_fragments_resolve(_rendered())


def test_shipped_page_fragment_links_resolve_and_ids_are_unique():
    _assert_fragments_resolve(SHIPPED.read_text(encoding="utf-8"))


def test_sources_link_targets_the_sources_heading():
    html = _rendered()
    assert 'href="#fontes-titulo"' in html
    assert re.search(r'<h2 id="fontes-titulo">', html)
    assert 'href="#fontes"' not in html
