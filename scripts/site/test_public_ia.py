"""CFG10X-11: public IA contract driven against the shipped map and HTML."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.site.public_ia import (
    HUB_ROLES,
    MAX_HEADER_DESTINATIONS,
    audit_orphans,
    audit_primary_nav_hygiene,
    breadcrumb_trail,
    first_viewport_names_journey,
    footer_columns_html,
    footer_problem_cluster_dump,
    header_cta,
    header_items,
    hubs,
    load_ia_map,
    materialize_route_map,
    parent_of,
    parse_jsonld_breadcrumb_trail,
    parse_visible_breadcrumb_trail,
    validate_contract,
)
from scripts.site.shell_nav import FROZEN_SHELL_FILES, load_brand, nav_items, sync_text


ROOT = Path(__file__).resolve().parents[2]


def test_ia_contract_is_valid_without_html():
    errors = validate_contract()
    assert errors == []
    items = header_items()
    assert len(items) == MAX_HEADER_DESTINATIONS
    assert header_cta()["href"].endswith("#formulario-contato")
    labels = " ".join(item["label"].lower() for item in items)
    assert "b2g" not in labels
    assert all(
        phrase in labels
        for phrase in ("edital e proposta", "contrato sob pressão", "operação recorrente")
    )


def test_brand_header_mirrors_ia_map():
    brand_labels = [item["label"] for item in nav_items(load_brand())]
    ia_labels = [item["label"] for item in header_items()]
    assert brand_labels == ia_labels


def test_each_hub_has_exactly_one_role():
    seen = set()
    for hub in hubs():
        route = hub["route"]
        assert route not in seen
        seen.add(route)
        assert hub["role"] in HUB_ROLES
        assert hub["role"] != ""
        assert hub["next_action"]


def test_route_map_covers_every_public_page():
    routes = materialize_route_map(ROOT)
    assert len(routes) >= 50
    for route, rec in routes.items():
        assert rec["job"]
        assert rec["index_state"] in {"index", "noindex"}
        assert "next_action" in rec
        if route == "/":
            assert rec["parent"] is None
        else:
            assert rec["parent"] is not None
            if rec["parent"] != "/":
                assert rec["parent"].startswith("/")


def test_parent_chain_matches_breadcrumb_helper():
    trail = breadcrumb_trail("/conteudos/ata-reuniao-ordem-servico-obra-publica/")
    assert trail[0] == ("Início", "/")
    assert trail[1][1] == "/conteudos/"
    assert trail[-1][1] is None
    assert parent_of("/medicoes-glosas-obras-publicas/") == "/problemas-que-resolvemos/"
    assert parent_of("/bid-room-licitacoes-obras/") == "/"


CHILD_CRUMB_PROBES = (
    "/defesa-margem-contratos-publicos/",
    "/atrasos-prorrogacao-obras-publicas/",
    "/acompanhamento-contratos-obras/",
    "/defesa-tecnica-contratos-publicos/",
)


def test_shipped_child_crumbs_match_map_parent_chain():
    """Visible crumbs + BreadcrumbList on a non-hub child equal breadcrumb_trail()."""
    table = materialize_route_map(ROOT)
    hub_routes = {hub["route"] for hub in hubs()}
    checked = 0
    for route in CHILD_CRUMB_PROBES:
        rec = table.get(route)
        assert rec, route
        assert rec["parent"] not in (None, "/")
        assert route not in hub_routes
        assert rec["file"] not in FROZEN_SHELL_FILES
        html = (ROOT / rec["file"]).read_text(encoding="utf-8")
        visible = parse_visible_breadcrumb_trail(html)
        assert visible, route
        trail = breadcrumb_trail(route, current_label=visible[-1][0])
        assert visible == trail, (route, visible, trail)
        schema = parse_jsonld_breadcrumb_trail(html, route)
        assert schema == trail, (route, schema, trail)
        assert trail[1][1] == rec["parent"]
        checked += 1
    assert checked == len(CHILD_CRUMB_PROBES)


def test_all_mutable_indexable_breadcrumbs_equal_visible_ia_and_jsonld():
    table = materialize_route_map(ROOT)
    checked = 0
    for route, rec in table.items():
        if rec["index_state"] != "index" or route == "/":
            continue
        if rec["file"] in FROZEN_SHELL_FILES:
            continue
        html = (ROOT / rec["file"]).read_text(encoding="utf-8")
        visible = parse_visible_breadcrumb_trail(html)
        schema = parse_jsonld_breadcrumb_trail(html, route)
        if not visible and not schema:
            continue
        assert visible, route
        expected = breadcrumb_trail(route, current_label=visible[-1][0])
        assert visible == expected, (route, visible, expected)
        assert schema == expected, (route, schema, expected)
        checked += 1
    assert checked >= 60


def test_sync_text_inserts_missing_parent_into_crumbs_and_jsonld():
    brand = load_brand()
    route = "/defesa-margem-contratos-publicos/"
    html = """<!DOCTYPE html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Início","item":"https://confenge.com.br/"},{"@type":"ListItem","position":2,"name":"Defesa de margem","item":"https://confenge.com.br/defesa-margem-contratos-publicos/"}]}]}</script>
</head><body>
<header class="site-header"><nav class="desktop-nav"></nav></header>
<main id="conteudo">
<nav aria-label="Navegação estrutural" class="breadcrumbs container"><ol><li><a href="/">Início</a><span aria-hidden="true">/</span></li><li aria-current="page">Defesa de margem</li></ol></nav>
</main></body></html>"""
    updated = sync_text(html, brand, route)
    trail = breadcrumb_trail(route, current_label="Defesa de margem")
    assert parse_visible_breadcrumb_trail(updated) == trail
    assert parse_jsonld_breadcrumb_trail(updated, route) == trail
    assert trail[1][1] == "/problemas-que-resolvemos/"
    assert sync_text(updated, brand, route) == updated


def test_shipped_home_header_names_a_journey():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert first_viewport_names_journey(home)
    desktop = home.split('class="desktop-nav"', 1)[1].split("</nav>", 1)[0]
    assert desktop.lower().count("href=") <= MAX_HEADER_DESTINATIONS


def test_mobile_menu_preserves_order_and_44px_anchor_floor():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    mobile = home.split('class="mobile-nav"', 1)[1].split("</nav>", 1)[0]
    cursor = -1
    for item in header_items():
        anchor = f'href="{item["href"]}" style="min-height:44px">{item["label"]}</a>'
        position = mobile.find(anchor)
        assert position > cursor, item
        cursor = position
    assert 'class="button button-primary"' in mobile
    assert 'class="menu-toggle"' in home
    assert 'aria-controls="mobile-menu"' in home
    script = (ROOT / "script.js").read_text(encoding="utf-8")
    assert '"Escape"' in script


def test_footer_is_not_a_taxonomy_dump():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    brand = load_brand()
    clusters = [row["url"] for row in brand.get("problem_clusters") or [] if row.get("url")]
    assert not footer_problem_cluster_dump(home, clusters)
    rendered = footer_columns_html()
    assert rendered.count("<strong>") == 3
    assert "Inteligência" not in rendered
    assert "Metodologia" not in rendered
    assert rendered.count("<a ") <= 16


def test_primary_nav_hygiene_and_no_indexable_orphans():
    hygiene = audit_primary_nav_hygiene(ROOT)
    assert hygiene == [], hygiene
    graph = audit_orphans(ROOT)
    assert graph["orphan_count"] == 0, graph["orphans"][:20]
    baseline = load_ia_map()["quality_baseline"]
    assert graph["n_indexable"] >= baseline["indexable_routes"]
    assert graph["avg_click_depth"] <= baseline["avg_click_depth"]
    assert graph["max_depth"] <= baseline["max_click_depth"]


def test_ia_map_file_is_the_source():
    data = load_ia_map()
    raw = json.loads((ROOT / "data/site/public-ia-map.json").read_text(encoding="utf-8"))
    assert data["schema_version"] == raw["schema_version"]
    assert data["header"] == raw["header"]


def test_page_shell_output_is_idempotent_with_shell_nav():
    from scripts.pseo.html_shell import page_shell
    from scripts.site.shell_nav import sync_text

    html = page_shell(
        title="Guia",
        description="Guia",
        canonical_path="/guias-contratos-obras/",
        robots="index,follow",
        jsonld_graph=[],
        body_main="<p>x</p>",
        wa_message="Olá",
    )
    assert 'class="desktop-nav"' in html
    assert "Edital e proposta" in html
    assert sync_text(html, load_brand(), "/guias-contratos-obras/") == html
