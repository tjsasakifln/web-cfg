"""CFG10X-09: action/document lists stay readable without CFG10X-01.

Structural check on shipped CSS + HTML: numbered-column grid applies only when
a list item has a leading number <span>. Items that are <li><div>… must not be
assigned a 42px first column.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


PAGES = (
    "conteudos/limite-aditivo-25-50-obra-publica/index.html",
    "conteudos/aditivo-empreitada-por-preco-global/index.html",
    "conteudos/demolicao-nao-prevista-obra-publica/index.html",
)


def _css() -> str:
    return (ROOT / "styles.css").read_text(encoding="utf-8")


def test_action_list_default_is_single_column_not_42px_number_gutter():
    css = _css()
    # Later unminified override must exist and win over the legacy 42px grid.
    assert "grid-template-columns:minmax(0,1fr)" in css
    assert ".action-list li:has(> span:first-child)" in css
    # Numbered gutter is gated on :has(span), not applied to every li.
    gated = re.search(
        r"\.action-list li:has\(> span:first-child\)\{[^}]*grid-template-columns:42px",
        css,
    )
    assert gated, "numbered 42px column must be behind :has(> span:first-child)"


def test_owned_indexable_lists_have_usable_markup():
    for rel in PAGES:
        html = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        docs = re.findall(r'<ul class="document-list">(.*?)</ul>', html, flags=re.S)
        actions = re.findall(r'<ol class="action-list">(.*?)</ol>', html, flags=re.S)
        assert docs, f"{rel}: missing document-list"
        assert actions, f"{rel}: missing action-list"
        for block in docs:
            items = re.findall(r"<li\b[^>]*>(.*?)</li>", block, flags=re.S)
            assert items, f"{rel}: empty document-list"
            for item in items:
                text = re.sub(r"<[^>]+>", " ", item)
                text = re.sub(r"\s+", " ", text).strip()
                assert len(text) >= 12, f"{rel}: document item too short: {text!r}"
        for block in actions:
            items = re.findall(r"<li\b[^>]*>(.*?)</li>", block, flags=re.S)
            assert items, f"{rel}: empty action-list"
            for item in items:
                text = re.sub(r"<[^>]+>", " ", item)
                text = re.sub(r"\s+", " ", text).strip()
                assert len(text) >= 12, f"{rel}: action item too short: {text!r}"
                # Numbered items keep a leading span; unnumbered items must not
                # rely on a 42px column (they are a single <div>).
                has_number = bool(re.match(r"\s*<span>", item))
                has_div = "<div" in item
                assert has_number or has_div, f"{rel}: action item has neither span nor div"
