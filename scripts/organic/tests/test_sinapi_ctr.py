"""Drive the shipped SINAPI snippet evaluator against the live article (#126)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.service_map import extract_bridge_service, html_has_commercial_bridge
from scripts.organic.sinapi_snippet import (
    CANONICAL_TITLE,
    SINAPI_PATH,
    evaluate_sinapi_snippet,
    parse_title,
)


def test_live_article_front_loads_query_not_sinapi():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    title = parse_title(html)
    assert title == CANONICAL_TITLE
    assert title.startswith("Desonerado e não desonerado")
    assert not title.startswith("SINAPI")
    report = evaluate_sinapi_snippet(html)
    assert report["ok"], report["fails"]
    assert report["bridge_service"] == "/auditoria-orcamento-licitacao/"
    assert html_has_commercial_bridge(html)
    assert extract_bridge_service(html) == "/auditoria-orcamento-licitacao/"


def test_old_serp_title_fails_closed():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    reverted = html.replace(
        "Desonerado e não desonerado: qual tabela o edital pede | CONFENGE",
        "SINAPI desonerado ou não: qual base o edital exige | CONFENGE",
        1,
    )
    report = evaluate_sinapi_snippet(reverted)
    assert report["ok"] is False
    assert "title_front_loads_sinapi" in report["fails"]
