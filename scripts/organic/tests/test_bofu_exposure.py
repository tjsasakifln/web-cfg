"""Drive shipped BOFU exposure functions against live pages (#128)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.bofu_exposure import (
    ADITIVOS,
    CANONICAL_TITLE,
    evaluate_aditivos_snippet,
    evaluate_indexable_bridges,
)
from scripts.organic.service_map import html_has_commercial_bridge


def test_aditivos_snippet_matches_query_not_library_boilerplate():
    html = ADITIVOS.read_text(encoding="utf-8")
    report = evaluate_aditivos_snippet(html)
    assert report["title"] == CANONICAL_TITLE
    assert report["ok"], report["fails"]
    assert "Biblioteca CONFENGE" not in report["meta"]
    assert "quando-nao-contratar" in html or "data-when-not-hire" in html


def test_old_library_snippet_fails_closed():
    html = ADITIVOS.read_text(encoding="utf-8")
    reverted = html.replace(CANONICAL_TITLE, CANONICAL_TITLE, 1)
    reverted = reverted.replace(
        'name="description" content="',
        'name="description" content="Biblioteca CONFENGE. ',
        1,
    )
    report = evaluate_aditivos_snippet(reverted)
    assert report["ok"] is False
    assert "generic_library_snippet" in report["fails"]


def test_indexable_mapped_articles_keep_commercial_bridges():
    report = evaluate_indexable_bridges(ROOT)
    assert report["ok"], report["fails"]
    assert report["coverage"]["indexable_commercial_bridge_coverage"] == 1.0
    sinapi = (
        ROOT / "conteudos" / "sinapi-desonerado-nao-desonerado" / "index.html"
    ).read_text(encoding="utf-8")
    assert html_has_commercial_bridge(sinapi)
