"""Gating tests for the prazo / atraso / notificação cluster.

Reads shipped HTML of the four owned URLs. Overlap, title uniqueness,
exclusive blocks and stage CTAs are computed by scripts.editorial.cluster_prazo
from the rendered pages, not from a reimplementation of the copy.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.cluster_prazo import (  # noqa: E402
    OWNERSHIP,
    OVERLAP_LIMIT,
    OWNED_ROUTES,
    TITLE_NEAR_EQUIV,
    html_path_for,
    measure_cluster,
    parse_page,
    section_normalized,
    title_token_jaccard,
    two_way_loops,
)


def test_owned_html_exists_and_canonical_matches_route():
    for route in OWNED_ROUTES:
        path = html_path_for(route)
        assert path.is_file(), route
        page = parse_page(route)
        assert route.rstrip("/") in page.canonical, (route, page.canonical)


def test_pairwise_paragraph_overlap_under_15_percent():
    report = measure_cluster()
    over = [p for p in report["pairs"] if p["overlap"] >= OVERLAP_LIMIT]
    assert not over, json.dumps(over, ensure_ascii=False, indent=2)
    assert report["max_overlap"] < OVERLAP_LIMIT
    for pair in report["pairs"]:
        assert pair["size_a"] >= 8, pair
        assert pair["size_b"] >= 8, pair


def test_checklists_and_examples_are_not_reused():
    pages = {r: parse_page(r) for r in OWNED_ROUTES}
    for section_id in ("checklist", "exemplo-tecnico", "cronologia", "matriz"):
        blobs = {r: section_normalized(pages[r], section_id) for r in OWNED_ROUTES}
        missing = [r for r, b in blobs.items() if len(b) < 80]
        assert not missing, f"thin_or_missing_{section_id}:{missing}"
        seen: dict[str, str] = {}
        for route, blob in blobs.items():
            assert blob not in seen, f"duplicate_{section_id}:{seen[blob]}={route}"
            seen[blob] = route


def test_one_owner_decision_and_titles_not_near_equivalent():
    pages = {r: parse_page(r) for r in OWNED_ROUTES}
    decisions = [OWNERSHIP[r]["decision_id"] for r in OWNED_ROUTES]
    assert len(set(decisions)) == len(decisions)
    titles = []
    h1s = []
    for route, spec in OWNERSHIP.items():
        page = pages[route]
        title = page.title.strip()
        h1 = page.h1.strip()
        titles.append(title)
        h1s.append(h1)
        low_h1 = h1.lower()
        for needle in spec["h1_needles"]:
            assert needle.lower() in low_h1, (route, needle, h1)
        for needle in spec["h1_needles"]:
            assert needle.lower() in title.lower(), (route, needle, title)
        if spec.get("robots_must_include"):
            assert spec["robots_must_include"] in page.robots.lower()
        html = html_path_for(route).read_text(encoding="utf-8")
        article = re.search(r"<article[\s\S]*?</article>", html)
        ctas = re.findall(r'<section class="editorial-cta"[\s\S]*?</section>', html)
        decision_surface = (article.group(0) if article else "") + "".join(ctas)
        for href in spec["forbidden_hrefs"]:
            assert href not in decision_surface, f"{route} still points at {href}"
        for href in spec["required_hrefs"]:
            assert href in html, (route, href)
        surface = decision_surface.lower()
        for needle in spec["cta_needles"]:
            assert needle.lower() in surface, (route, needle)
    for i, ta in enumerate(titles):
        for tb in titles[i + 1 :]:
            score = title_token_jaccard(ta, tb)
            assert score < TITLE_NEAR_EQUIV, (ta, tb, score)
    for i, ha in enumerate(h1s):
        for hb in h1s[i + 1 :]:
            score = title_token_jaccard(ha, hb)
            assert score < TITLE_NEAR_EQUIV, (ha, hb, score)


def test_stage_links_are_not_two_way_loops():
    loops = two_way_loops()
    assert loops == [], loops


def test_sources_show_consulta_date_and_application_limit():
    for route in OWNED_ROUTES:
        html = html_path_for(route).read_text(encoding="utf-8")
        assert "Consulta:" in html or "consulta em" in html.lower() or "28/08/2026" in html, route
        assert "Limite:" in html or "Limite de aplicação" in html or "não vincula" in html.lower() or "não gera sozinho" in html.lower(), route
        assert "planalto.gov.br" in html
        assert "Acórdão" not in html and "relator" not in html.lower()
