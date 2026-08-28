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
    validate_contract,
)
from scripts.site.shell_nav import load_brand, nav_items


ROOT = Path(__file__).resolve().parents[2]


def test_ia_contract_is_valid_without_html():
    errors = validate_contract()
    assert errors == []
    items = header_items()
    assert 1 <= len(items) <= MAX_HEADER_DESTINATIONS
    assert header_cta()["href"].endswith("#formulario-contato")
    labels = " ".join(item["label"].lower() for item in items)
    assert "b2g" not in labels
    assert any(
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


def test_shipped_home_header_names_a_journey():
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    assert first_viewport_names_journey(home)
    desktop = home.split('class="desktop-nav"', 1)[1].split("</nav>", 1)[0]
    assert desktop.lower().count("href=") <= MAX_HEADER_DESTINATIONS


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
