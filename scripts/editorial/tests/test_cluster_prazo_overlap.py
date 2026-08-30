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
from urllib.parse import unquote

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
from scripts.site.document_intake import (  # noqa: E402
    capture_forms_with_file_input,
    dishonest_hits,
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
        assert pair["size_a"] >= 100, pair
        assert pair["size_b"] >= 100, pair


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
    descriptions = []
    h1s = []
    for route, spec in OWNERSHIP.items():
        page = pages[route]
        title = page.title.strip()
        description = page.description.strip()
        h1 = page.h1.strip()
        titles.append(title)
        descriptions.append(description)
        h1s.append(h1)
        assert len(description) >= 80, (route, description)
        low_h1 = h1.lower()
        for needle in spec["h1_needles"]:
            assert needle.lower() in low_h1, (route, needle, h1)
        for needle in spec["h1_needles"]:
            assert needle.lower() in title.lower(), (route, needle, title)
        if spec.get("robots_must_include"):
            directives = {
                directive.strip().lower()
                for directive in page.robots.split(",")
                if directive.strip()
            }
            assert spec["robots_must_include"] in directives
            assert "follow" in directives
            assert "nofollow" not in directives
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
    for i, da in enumerate(descriptions):
        for db in descriptions[i + 1 :]:
            score = title_token_jaccard(da, db)
            assert score < TITLE_NEAR_EQUIV, (da, db, score)


def test_stage_links_are_not_two_way_loops():
    loops = two_way_loops()
    assert loops == [], loops


def test_legal_effects_are_not_collapsed_into_one_generic_prazo_or_sanction():
    proof = html_path_for(OWNED_ROUTES[0]).read_text(encoding="utf-8")
    request = html_path_for(OWNED_ROUTES[1]).read_text(encoding="utf-8")
    response = html_path_for(OWNED_ROUTES[2]).read_text(encoding="utf-8")

    assert "a causa não fica atribuída à Administração no processo" in proof
    assert "o atraso continua sendo da obra" not in proof
    assert "registro da prorrogação automática da vigência" in request
    assert "Peça apostila" not in request
    assert "os arts. 156 a 158 disciplinam a sanção e o processo" in response
    assert "o art. 137 não substitui esse rito" in response


def test_sources_show_consulta_date_and_application_limit():
    for route in OWNED_ROUTES:
        html = html_path_for(route).read_text(encoding="utf-8")
        assert re.search(
            r"Consulta:\s*(?:\d{2}/\d{2}/\d{4}|\d{1,2} de [a-zç]+ de \d{4})",
            html,
            re.I,
        ), route
        assert "Limite:" in html or "Limite de aplicação" in html, route
        assert "planalto.gov.br" in html
        if route == "/conteudos/chuva-prorrogacao-prazo-obra-publica/":
            assert "Acórdão 639/2006-Plenário" in html
            assert "Acórdão 3.077/2010-Plenário" in html
            assert "não cria teste universal" in html
            assert "anterior à Lei 14.133" in html
        else:
            assert "Acórdão" not in html and "relator" not in html.lower()
        assert "licitacoesecontratos.tcu.gov.br/6-1-7-pagamento/" not in html
        assert "prorrogacao-escopo-cju-sp-maio-2019.docx" not in html


def test_stage_ctas_request_secure_channel_without_fake_upload():
    for route in OWNED_ROUTES:
        html = html_path_for(route).read_text(encoding="utf-8")
        assert "canal seguro" in html.lower(), route
        assert "site não recebe arquivo" in html.lower(), route
        assert not capture_forms_with_file_input(html), route
        assert dishonest_hits(html) == [], (route, dishonest_hits(html))
        main = re.search(r"<main\b[\s\S]*?</main>", html, re.I)
        assert main, route
        communication_ctas = re.findall(
            r'<a[^>]+href="((?:https://wa\.me/|mailto:)[^"]+)"[^>]*>([^<]+)</a>',
            main.group(0),
            re.I,
        )
        assert communication_ctas, route
        for href, label in communication_ctas:
            assert "canal seguro" in label.lower(), (route, label)
            decoded_href = unquote(href).lower()
            assert "canal seguro" in decoded_href, (route, href)
            assert "site não recebe arquivo" in decoded_href, (route, href)
        for claim in (
            "Enviar a prova de causa",
            "Enviar o dossiê de prorrogação",
            "Enviar a resposta para revisão",
            "Envie a cláusula de prazo",
            "Posso enviar cláusula de prazo",
        ):
            assert claim not in html, (route, claim)
