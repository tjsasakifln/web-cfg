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
    assert len(items) == 3
    assert len(items) <= MAX_HEADER_DESTINATIONS
    assert header_cta()["href"] == "/triagem-tecnica/"
    labels = " ".join(item["label"].lower() for item in items)
    assert "b2g" not in labels
    assert all(
        phrase in labels
        for phrase in ("serviços e problemas", "obras públicas", "biblioteca")
    )
    assert "biblioteca" in labels
    assert "ferramentas" not in labels
    ia = load_ia_map()
    situations = ia["service_situations"]
    # VALOR-IMEDIATO-20260914: a taxonomia e uma so (brand.json = mapa de IA) e
    # o conjunto de ids e o contrato de public_ia.py; a contagem deixa de ser
    # um numero magico. Cada situacao tem destino distinto.
    from scripts.site.public_ia import SERVICE_SITUATION_IDS

    assert {row["id"] for row in situations} == set(SERVICE_SITUATION_IDS)
    assert len(situations) == len(SERVICE_SITUATION_IDS)
    brand_rows = load_brand()["service_situations"]
    assert [row["id"] for row in brand_rows] == [row["id"] for row in situations]
    assert [row["href"] for row in brand_rows] == [row["href"] for row in situations]
    assert len({row["href"] for row in situations}) == len(situations)
    assert sum(row["href"] == "/servicos-obras-publicas/" for row in situations) == 1
    by_id = {row["id"]: row for row in situations}
    assert by_id["project_delivery"]["href"] == "/servicos/#servico-projeto"
    assert by_id["quantities_budget"]["href"] == "/quantitativos-orcamento-obras/"
    assert by_id["property_valuation"]["href"] == "/servicos/#servico-avaliacao"
    assert by_id["project_delivery"]["index_state"] == "service_hub_index"
    assert by_id["project_delivery"]["scope"]
    assert by_id["building_diagnosis"]["href"] in (
        "/servicos/#servico-diagnostico",
        "/inspecao-diagnostico-edificacoes/",
    )
    assert by_id["building_diagnosis"]["index_state"] == "service_hub_index"
    assert by_id["expert_evidence_valuation"]["href"] in (
        "/servicos/#servico-pericia",
        "/assistencia-tecnica-pericial-engenharia/",
    )
    assert by_id["occupational_safety"]["href"] in (
        "/servicos/#servico-sst",
        "/seguranca-trabalho-apoio-tecnico/",
    )
    assert all(
        by_id[item]["index_state"] == "service_hub_index"
        for item in ("expert_evidence_valuation", "occupational_safety")
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


def test_sync_text_applies_global_corporate_shell_after_mv09_activation():
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
    assert updated != html
    assert "Serviços e problemas" in updated
    assert "/servicos-obras-publicas/" in updated
    assert load_ia_map()["rollout"]["shell_scope"] == "global"


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
    assert "Perícias e avaliações" not in rendered
    assert '<a href="/#situacao-pericia">Perícias e disputas</a>' in rendered
    assert '<a href="/#situacao-avaliacao">Avaliação de imóvel</a>' in rendered


def _assert_national_service_is_conditioned(rendered: str) -> None:
    copy = rendered.casefold()
    assert "brasil" in copy or "nacional" in copy
    assert "escopo" in copy
    assert "local" in copy
    assert any(term in copy for term in ("modalidade", "vistoria", "campo"))
    assert "<span>atendimento nacional</span>" not in copy


def test_footer_conditions_national_service_on_scope_location_and_modality(monkeypatch):
    _assert_national_service_is_conditioned(footer_columns_html())

    # The pSEO fallback must preserve the same commercial condition even if the
    # shared IA module is unavailable during an isolated generator execution.
    from scripts.pseo import html_shell

    monkeypatch.setattr(html_shell, "_footer_columns_html", None)
    _assert_national_service_is_conditioned(html_shell._build_footer())


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
    assert "Serviços e problemas" in html
    assert "Obras públicas" in html
    assert sync_text(html, load_brand(), "/guias-contratos-obras/") == html


def test_hash_bound_editorial_canary_is_not_rewritten_by_shell_sync():
    from scripts.site.shell_nav import HASH_BOUND_EDITORIAL_FILES, _shell_sync_files

    protected = {
        "conteudos/chuva-prorrogacao-prazo-obra-publica/index.html",
        "conteudos/atraso-na-medicao-obra-publica/index.html",
        "conteudos/glosa-de-medicao-obra-publica/index.html",
        "conteudos/medicao-de-obra-publica-rejeitada/index.html",
        "conteudos/fiscal-nao-assina-medicao-obra-publica/index.html",
        "medicoes-glosas-obras-publicas/index.html",
        "analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/index.html",
    }
    mutable = {path.relative_to(ROOT).as_posix() for path in _shell_sync_files()}
    assert protected <= HASH_BOUND_EDITORIAL_FILES
    assert protected.isdisjoint(mutable)


# ---------------------------------------------------------------------------
# CONFENGE-BOFU-FECHAMENTO-20260919 (WS-B). Sub-situacoes: fragmentos das
# landings de situacao que o hub /servicos/ publica como entrada propria
# (recebimento, reforma em condominio, as-built, reclamacao trabalhista,
# orgao que planeja a contratacao). Antes, #assistencia-trabalhista nao
# existia em contrato algum: so o hub e a propria rota o citavam.
# ---------------------------------------------------------------------------
import re as _re

CONTACT_FRAGMENT = _re.compile(r"^(contato|triagem|captura|pedido|formulario)", _re.I)


def _services_article(html: str, row_id: str) -> str:
    match = _re.search(rf'<article class="corporate-service-row[^"]*" id="{row_id}"[\s\S]*?</article>', html)
    assert match, row_id
    return match.group(0)


def _visible(fragment: str) -> str:
    fragment = _re.sub(r"(?is)<(script|style|svg)[^>]*>.*?</\1>", " ", fragment)
    return _re.sub(r"<[^>]+>", " ", fragment)


def test_services_diagnostic_row_speaks_the_buyer_decisions():
    """HOME-HUB-02. 'registro do imovel' lia-se como ato cartorial e reforma
    so aparecia nos links secundarios."""
    html = (ROOT / "servicos" / "index.html").read_text(encoding="utf-8")
    heading = _re.search(r"<h3>([\s\S]*?)</h3>", _services_article(html, "servico-diagnostico")).group(1)
    lowered = _visible(heading).casefold()
    assert "receb" in lowered, heading
    assert "reform" in lowered, heading
    assert "registro do imóvel" not in lowered, heading


def test_hub_fragments_on_situation_landings_are_declared_sub_situations():
    """B-07 (2). Toda ancora de /servicos/ para um fragmento de landing de
    situacao (fora os fragmentos de contato) existe no mapa de IA como
    sub-situacao, com rotulo, e o fragmento existe no destino."""
    ia = load_ia_map()
    situations = ia["service_situations"]
    landings = {}
    declared = {}
    for row in situations:
        path = row["href"].split("#", 1)[0]
        if path != "/servicos/":
            landings[path] = row["id"]
        for sub in row.get("sub_situations") or []:
            assert sub.get("label") and sub.get("href"), (row["id"], sub)
            assert sub["href"].startswith(path + "#"), (row["id"], sub["href"])
            declared[sub["href"]] = sub
    assert declared, "no sub-situations declared"
    services = (ROOT / "servicos" / "index.html").read_text(encoding="utf-8")
    hub_main = _re.search(r"<main[\s\S]*?</main>", services).group(0)
    undeclared = []
    for href in _re.findall(r'href="(/[^"#]+/#[^"]+)"', hub_main):
        path, fragment = href.split("#", 1)
        if path not in landings or CONTACT_FRAGMENT.match(fragment):
            continue
        if href not in declared:
            undeclared.append(href)
    assert not undeclared, undeclared
    assert "/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista" in declared
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    for href, sub in declared.items():
        path, fragment = href.split("#", 1)
        target = (ROOT / path.strip("/") / "index.html").read_text(encoding="utf-8")
        assert _re.search(rf'\bid="{_re.escape(fragment)}"', target), href
        assert f'href="{href}"' in hub_main, href
        assert f'href="{href}"' in home, href
    assert validate_contract() == []


def test_ia_contract_rejects_a_sub_situation_off_its_landing():
    """Contraprova do validador: sub-situacao fora da landing ou sem fragmento
    existente reprova."""
    ia = json.loads(json.dumps(load_ia_map()))
    row = next(r for r in ia["service_situations"] if r["id"] == "occupational_safety")
    row["sub_situations"] = [{"label": "x", "href": "/servicos/#servico-sst"}]
    assert any("sub-situation" in error for error in validate_contract(ia)), validate_contract(ia)
    row["sub_situations"] = [{"label": "x", "href": "/seguranca-trabalho-apoio-tecnico/#nao-existe"}]
    assert any("sub-situation" in error for error in validate_contract(ia)), validate_contract(ia)


def test_problem_clusters_name_the_published_readjustment_event():
    """HOME-HUB-12. O hub B2G publica 'Calculo de Reajuste Contratual'
    (#entrega-21) e o ciclo de /problemas-que-resolvemos/ nao nomeava o
    evento. O HTML do hub segue brand.json por render_nav_hubs.py --check."""
    brand = load_brand()
    clusters = {row["id"]: row for row in brand["problem_clusters"]}
    assert "reajuste" in clusters, sorted(clusters)
    row = clusters["reajuste"]
    assert row["url"] == "/servicos-obras-publicas/#entrega-21"
    assert row["stage"] in {s["id"] for s in brand["problem_stages"]}
    assert "reajust" in row["label"].casefold()
    hub = (ROOT / "servicos-obras-publicas" / "index.html").read_text(encoding="utf-8")
    assert 'id="entrega-21"' in hub
