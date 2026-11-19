"""Drive the shipped SINAPI snippet evaluator against the live article (#126)."""

from __future__ import annotations

import sys
import re
from pathlib import Path

import pytest

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

# Regression targets — not a second canonical. Imported CANONICAL_TITLE is the
# only live source of truth; these strings exist so .replace() cannot silently
# no-op the way the stale literal did on bdd17f3d.
OLD_SINAPI_LESS_TITLE = "Desonerado e não desonerado: o que o edital exige | CONFENGE"
SINAPI_FRONT_LOADED_TITLE = "SINAPI desonerado ou não: qual base o edital exige | CONFENGE"


def test_live_article_front_loads_query_not_sinapi():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    title = parse_title(html)
    assert title == CANONICAL_TITLE
    assert title.startswith("Desonerado e não desonerado")
    assert "SINAPI" in title
    assert not title.startswith("SINAPI")
    # Original GSC title omitted SINAPI from the visible string; the live
    # rewrite must not regress to that SINAPI-less title (#207).
    assert title != OLD_SINAPI_LESS_TITLE
    report = evaluate_sinapi_snippet(html)
    assert report["ok"], report["fails"]
    assert report["bridge_service"] == "/auditoria-orcamento-licitacao/"
    assert html_has_commercial_bridge(html)
    assert extract_bridge_service(html) == "/auditoria-orcamento-licitacao/"


def test_old_serp_title_fails_closed():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    reverted = html.replace(
        CANONICAL_TITLE,
        SINAPI_FRONT_LOADED_TITLE,
        1,
    )
    assert reverted != html, "replace must find the live canonical title"
    assert parse_title(reverted) == SINAPI_FRONT_LOADED_TITLE
    report = evaluate_sinapi_snippet(reverted)
    assert report["ok"] is False
    assert "title_front_loads_sinapi" in report["fails"]


def test_title_that_omits_sinapi_fails_closed():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    omitted = html.replace(
        CANONICAL_TITLE,
        OLD_SINAPI_LESS_TITLE,
        1,
    )
    assert omitted != html, "replace must find the live canonical title"
    assert parse_title(omitted) == OLD_SINAPI_LESS_TITLE
    report = evaluate_sinapi_snippet(omitted)
    assert report["ok"] is False
    assert "title_omits_sinapi" in report["fails"]


@pytest.mark.parametrize("directive", [
    '<meta name="robots" content="noindex,follow">',
    "<meta content='NOINDEX, FOLLOW' name='ROBOTS'>",
    '<meta name="robots" content="none">',
    '<meta name="googlebot" content="noindex">',
    '<meta name="robots" content="index,follow"><meta name="robots" content="noindex">',
])
def test_crawler_exclusions_are_detected_after_the_title(directive):
    html = SINAPI_PATH.read_text(encoding="utf-8")
    # Preserve the real article and its title, replacing only crawler metadata.
    html = re.sub(r'<meta\b(?=[^>]*\bname=["\']robots["\'])[^>]*>', "", html, flags=re.I)
    candidate = html.replace("</head>", directive + "</head>", 1)
    assert parse_title(candidate) == CANONICAL_TITLE
    report = evaluate_sinapi_snippet(candidate)
    assert not report["ok"]
    assert "unexpected_noindex" in report["fails"]


def test_indexable_directives_and_visible_word_noindex_are_not_exclusions():
    html = SINAPI_PATH.read_text(encoding="utf-8")
    candidate = html.replace("</head>", '<meta name="googlebot" content="index,follow,max-snippet:-1"></head>', 1)
    candidate = candidate.replace("</body>", "<p>noindex</p></body>", 1)
    report = evaluate_sinapi_snippet(candidate)
    assert report["ok"], report["fails"]
