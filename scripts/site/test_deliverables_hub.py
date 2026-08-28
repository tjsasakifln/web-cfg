"""Public contract for the indexable CONFENGE deliverables library."""

from __future__ import annotations

import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import pytest

from scripts.bofu_dominance.frozen_specs.constants import PILLARS
from scripts.site.public_navigation import (
    CANONICAL_NAV_ITEMS,
    audit_public_navigation_tree,
    promote_public_navigation,
)
from scripts.site.test_report_model_599 import (
    _assert_no_scope_contradictions,
    _visible_text,
)


ROOT = Path(__file__).resolve().parents[2]
ROUTE = "/entregas/"
CANONICAL = f"https://confenge.com.br{ROUTE}"
PAGE = ROOT / "entregas" / "index.html"
CSS = PAGE.with_name("catalog.css")
CATALOG_DATA = PAGE.with_name("catalog-data.js")
REPORT_ROUTE = "/casos/modelo-relatorio-inteligencia-licitacoes/"
REPORT = ROOT / REPORT_ROUTE.strip("/") / "index.html"
# Ascending value ladder, anchored on the published R$ 599 report.
LADDER_ROUTES = [
    REPORT_ROUTE,
    "/casos/modelo-base-quantitativa-canonica/",
    "/casos/modelo-apresentacao-executiva-resultados/",
    "/casos/modelo-mapa-compradores-publicos/",
    "/casos/modelo-contratos-vincendos-relicitacao/",
    "/casos/modelo-mapeamento-concorrentes-publicos/",
    "/casos/modelo-painel-precos-obras-publicas/",
    "/casos/modelo-relatorio-executivo-consolidado/",
]
EXPECTED_NAV = [
    "Serviços",
    "Problemas que resolvemos",
    "Entregas",
    "Conteúdos",
    "Ferramentas",
    "Especialista",
]
LEGACY_NAV = [
    "Serviços",
    "Problemas que resolvemos",
    "Conteúdos",
    "Ferramentas",
    "Especialista",
]


class _NavParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_desktop = False
        self.capture = False
        self.buf: list[str] = []
        self.labels: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {key: (value or "") for key, value in attrs}
        if tag == "nav" and "desktop-nav" in ad.get("class", "").split():
            self.in_desktop = True
        elif self.in_desktop and tag == "a":
            self.capture = True
            self.buf = []

    def handle_endtag(self, tag: str) -> None:
        if self.capture and tag == "a":
            self.labels.append(re.sub(r"\s+", " ", "".join(self.buf)).strip())
            self.capture = False
        elif self.in_desktop and tag == "nav":
            self.in_desktop = False

    def handle_data(self, data: str) -> None:
        if self.capture:
            self.buf.append(data)


def _html(path: Path = PAGE) -> str:
    return path.read_text(encoding="utf-8")


def _desktop_labels(path: Path) -> list[str]:
    parser = _NavParser()
    parser.feed(_html(path))
    return parser.labels


def _jsonld_graph() -> list[dict]:
    html = _html()
    scripts = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.DOTALL
    )
    assert scripts, "deliverables hub JSON-LD missing"
    data = json.loads(scripts[0])
    return data.get("@graph", [])


def test_hub_is_direct_indexable_html_without_friction() -> None:
    html = _html()
    lowered = html.casefold()
    assert PAGE.is_file() and CSS.is_file()
    assert '<main id="conteudo">' in html
    assert f'<link href="{CANONICAL}" rel="canonical"/>' in html
    assert (
        '<meta content="index,follow,max-image-preview:large,max-snippet:-1,'
        'max-video-preview:-1" name="robots"/>' in html
    )
    for forbidden in ("<dialog", ".pdf", "download=", "cadastre"):
        assert forbidden not in lowered
    # Details are progressive disclosure for dense scope and the alphabetical
    # index; their summaries are present in the direct HTML and never gate the
    # published example routes or the terminal capture.
    assert lowered.count("<details") == lowered.count("<summary")
    # Issue #290 gives the hub a terminal capture. The library still must not be
    # gated: exactly one form, and it opens only after the last published example.
    assert lowered.count("<form") == 1, "the hub takes one terminal capture, not a gate"
    form_at = lowered.index("<form")
    last_feature_at = lowered.rindex('class="deliverable-feature"')
    assert form_at > last_feature_at, "capture must not sit above the published examples"
    assert 'action="/.netlify/functions/lead"' in lowered
    assert html.count("<h1") == 1


def test_progressive_catalog_never_serializes_false_integrity_conclusions() -> None:
    html = _html().casefold()
    client_data = CATALOG_DATA.read_text(encoding="utf-8").casefold()
    for forbidden in (
        "no_match_confirmed",
        "empresa limpa",
        "empresa idônea",
        "empresa idonea",
        "nada consta",
    ):
        assert forbidden not in f"{html}\n{client_data}"
    assert "data-exclusion=" not in html
    assert "confenge.public-deliverable-catalog/1.1" in client_data
    assert "certificado, selo ou declaração" in client_data
    assert "universal" in client_data


def test_progressive_catalog_controls_keep_a_mobile_touch_target() -> None:
    css = CSS.read_text(encoding="utf-8")
    selector = (
        ".catalog-filter-actions button,.catalog-compare-tray button,"
        ".catalog-empty button"
    )
    rule = re.search(rf"{re.escape(selector)}\{{([^}}]+)\}}", css)
    assert rule
    assert "min-height:44px" in rule.group(1)


def test_progressive_catalog_css_does_not_block_first_paint() -> None:
    html = _html()
    assert '<link data-catalog-css' not in html
    assert '<noscript><link href="/entregas/catalog.css" rel="stylesheet"/></noscript>' in html
    assert html.index("/entregas/catalog-bootstrap.js") > html.index("</footer>")
    assert "/entregas/catalog-data.js" not in html
    assert '<script defer fetchpriority="low" src="/entregas/catalog.js"' not in html
    base_css = (PAGE.with_name("styles.css")).read_text(encoding="utf-8")
    assert ".catalog-framing select,.catalog-framing input" in base_css
    assert "max-width:100%" in base_css
    assert "min-height:44px" in base_css


def test_hub_is_honest_about_every_published_example() -> None:
    html = _html()
    for phrase in (
        "54 entregáveis, de R$ 599 a R$ 39.800",
        "Amostra verificável: 8 exemplos integrais, sem cadastro",
        "Radar de Licitações Prioritárias",
        "12",
        "3",
        "7",
        "integralmente sintéticos",
        "R$ 599 por unidade",
    ):
        assert phrase in html
    for route in LADDER_ROUTES:
        assert f'href="{route}"' in html, route
    # "No placeholder" is a claim about the published library, not about the
    # input hints of the terminal capture form (#290).
    library = re.sub(r"(?is)<form\b.*?</form>", "", html).casefold()
    assert "em breve" not in library
    assert "placeholder" not in library
    features = re.findall(r'class="deliverable-feature(?:["\s])', html)
    assert len(features) == len(LADDER_ROUTES)
    for number in range(1, 9):
        assert f"EXEMPLO 0{number}" in html
    assert "EXEMPLO 09" not in html
    assert html.count("DADOS SINTÉTICOS") == len(LADDER_ROUTES)
    assert "Marcações de outlier</dt><dd>17" in html
    assert "<dt>Outliers</dt><dd>17" not in html


def test_every_example_uses_the_same_action_label() -> None:
    """One label for the same action; the entry step is not a special case."""
    html = _html()
    assert html.count("Consultar o exemplo completo") == len(LADDER_ROUTES)
    assert "Consultar o relatório completo" not in html
    assert html.count("Ver o que a entrega inclui") == len(LADDER_ROUTES)


def test_the_library_has_one_name_across_its_own_surfaces() -> None:
    html = _html()
    title = re.search(r"<title>([^<]*)</title>", html).group(1)
    h1 = re.sub(r"<[^>]+>", " ", re.search(r"<h1[^>]*>(.*?)</h1>", html, re.DOTALL).group(1))
    breadcrumb = re.search(r'class="breadcrumbs container">(.*?)</nav>', html, re.DOTALL).group(1)
    assert title.startswith("Entregas da CONFENGE")
    assert "entregas" in h1.casefold()
    assert "Entregas" in breadcrumb
    assert "Exemplos de entregas da CONFENGE" not in html
    # The entry example carries the canonical #343 name here, on its own page and in JSON-LD.
    report = _html(REPORT)
    for surface in (html, report):
        assert "Radar de Licitações Prioritárias" in surface
    assert "Modelo de relatório de inteligência" not in report


def test_the_eight_are_comparable_before_the_long_sections() -> None:
    """Price, question answered and ladder position must precede the sections."""
    html = _html()
    compare = re.search(
        r'<section[^>]+id="comparar".*?</section>', html, flags=re.DOTALL
    )
    assert compare, "no comparable view"
    table = compare.group(0)
    assert html.index('id="comparar"') < html.index('id="primeiro-exemplo"')
    for price in ("R$ 599", "R$ 690", "R$ 890", "R$ 1.200", "R$ 1.450", "R$ 1.900", "R$ 2.400", "R$ 3.750"):
        assert price in table, price
    for route in LADDER_ROUTES:
        assert f'href="{route}"' in table, route
    assert table.count("<tr>") == len(LADDER_ROUTES) + 1
    # Credit rule is legible per row, including the declared exception.
    assert table.count("Sim, em até 60 dias") == len(LADDER_ROUTES) - 1
    assert "Não. Entrega à parte, fora do pacote" in table
    # The mobile equivalent is the same table inside a focusable scroll region.
    assert 'class="compare-scroll" role="region"' in table
    assert 'tabindex="0"' in table


def test_bundle_arithmetic_is_derived_from_the_comparison_rows() -> None:
    """The package total excludes the declared R$ 599 standalone delivery."""
    html = _html()
    tbody = re.search(r"<tbody>(.*?)</tbody>", html, flags=re.DOTALL)
    assert tbody, "comparison table has no body"
    rows = re.findall(r"<tr>(.*?)</tr>", tbody.group(1), flags=re.DOTALL)
    assert len(rows) == len(LADDER_ROUTES)

    def row_price(row: str) -> int:
        prices = re.findall(r"R\$\s*([\d.]+)", row)
        assert len(prices) == 1, row
        return int(prices[0].replace(".", ""))

    standalone = [row for row in rows if "fora do pacote" in row]
    credited = [row for row in rows if "Sim, em até 60 dias" in row]
    assert len(standalone) == 1
    assert row_price(standalone[0]) == 599
    assert len(credited) == 7

    units_total = sum(row_price(row) for row in credited)
    bundle_total = 8_000
    assert units_total == 12_280
    assert units_total - bundle_total == 4_280
    assert f"R$ {units_total:,.0f}".replace(",", ".") in html
    assert f"R$ {bundle_total:,.0f}".replace(",", ".") in html
    assert f"R$ {units_total - bundle_total:,.0f}".replace(",", ".") in html


def test_the_credit_rule_is_coherent_across_the_eight() -> None:
    html = _html()
    credit = "se ele for contratado em até 60 dias"
    assert html.count(credit) >= len(LADDER_ROUTES) - 1
    entry = re.search(
        r'<section[^>]+id="primeiro-exemplo".*?</section>', html, flags=re.DOTALL
    ).group(0)
    assert "Por que abre a biblioteca" in entry
    assert "único sem o crédito de 60 dias" in entry
    assert "Primeiro exemplo publicado" not in html
    assert "Entrega à parte, fora do Diagnóstico de Expansão no Mercado Público" in entry


def test_hub_states_the_bundle_without_replacing_the_unit_prices() -> None:
    html = _html()
    assert 'href="/diagnostico-b2g-expansao/"' in html
    # Ladder arithmetic authorised in docs/stories/story-deliverable-models-value-ladder.md
    assert html.count("R$ 8.000") >= 3
    assert "R$ 12.280" in html
    assert "R$ 4.280" in html
    assert "R$ 599 a R$ 3.750" in html
    for price in (
        "R$ 599",
        "R$ 690",
        "R$ 890",
        "R$ 1.200",
        "R$ 1.450",
        "R$ 1.900",
        "R$ 2.400",
        "R$ 3.750",
    ):
        assert price in html, price


def test_hub_and_report_share_the_versioned_delivery_scope() -> None:
    # The scope linter below owns the wording of the published eight examples.
    # Catalogue numbers 01..54 and the matching form select are identifiers, not
    # promises about how many opportunities a report will contain.
    hub_scope_html = re.sub(
        r"(?s)<!-- GENERATED:PUBLIC-CATALOG:START -->.*?<!-- GENERATED:PUBLIC-CATALOG:END -->",
        "",
        _html(),
    )
    hub_scope_html = re.sub(r"(?is)<form\b.*?</form>", "", hub_scope_html)
    hub_text = _visible_text(hub_scope_html)
    report_text = _visible_text(_html(REPORT))

    for phrase in (
        "editais abertos localizados pela confenge",
        "a confenge busca os editais abertos no raio informado",
        "a quantidade depende das licitações publicadas",
        "a profundidade é a máxima permitida pelas informações da empresa",
    ):
        assert phrase in hub_text

    for text in (hub_text, report_text):
        _assert_no_scope_contradictions(text)
        assert "quantidade de oportunidades e documentos, escopo e prazo" not in text


def test_schema_describes_the_full_collection_and_breadcrumb() -> None:
    graph = _jsonld_graph()
    types = {node.get("@type") for node in graph}
    assert {"CollectionPage", "ItemList", "BreadcrumbList"}.issubset(types)
    collection = next(node for node in graph if node.get("@type") == "CollectionPage")
    item_list = next(node for node in graph if node.get("@type") == "ItemList")
    breadcrumb = next(node for node in graph if node.get("@type") == "BreadcrumbList")
    assert collection["url"] == CANONICAL
    assert item_list["numberOfItems"] == len(LADDER_ROUTES)
    assert len(item_list["itemListElement"]) == len(LADDER_ROUTES)
    assert item_list["itemListElement"][0]["url"].endswith(REPORT_ROUTE)
    listed = [entry["url"] for entry in item_list["itemListElement"]]
    for route in LADDER_ROUTES:
        assert any(url.endswith(route) for url in listed), route
    assert breadcrumb["itemListElement"][-1]["item"] == CANONICAL


def test_home_discovery_is_inside_the_existing_commercial_section() -> None:
    home = _html(ROOT / "index.html")
    assert '<link href="/entregas/styles.css" rel="stylesheet"/>' not in home
    assert 'data-home-deliverables-critical=""' in home
    assert ".home-deliverables{" in home
    assert "Conheça nossas entregas" in home
    assert 'href="/entregas/"' in home
    assert f'href="{REPORT_ROUTE}"' in home
    assert "home-deliverables-result" in home
    archetypes = re.findall(r'data-section-archetype="([^"]+)"', home)
    assert len(archetypes) == 7
    offers = re.search(
        r'<section[^>]+data-section-archetype="offer_dominant".*?</section>',
        home,
        flags=re.DOTALL,
    )
    assert offers and "home-deliverables" in offers.group(0)


def test_new_surfaces_do_not_mutate_the_frozen_runtime() -> None:
    brand = json.loads((ROOT / "data/site/brand.json").read_text(encoding="utf-8"))
    labels = [item["label"] for item in brand["navigation"]["desktop"]]
    assert labels == EXPECTED_NAV
    for path in (ROOT / "index.html", PAGE, REPORT):
        assert _desktop_labels(path) == EXPECTED_NAV, path
    nav_source = (ROOT / "js/modules/nav.js").read_text(encoding="utf-8")
    assert "Promote the public deliverables library" not in nav_source
    assert "toolsLink.textContent = 'Entregas'" not in nav_source
    script_hash = hashlib.sha256((ROOT / "script.js").read_bytes()).hexdigest()
    frozen_hashes = json.loads(
        (ROOT / "data/bofu-dominance/frozen-specs/hashes.json").read_text(
            encoding="utf-8"
        )
    )
    assert script_hash == frozen_hashes["forbidden"]["script.js"]
    for pillar in PILLARS:
        frozen = ROOT / pillar["html_rel"]
        assert _desktop_labels(frozen) == LEGACY_NAV, frozen
        assert promote_public_navigation(
            _html(frozen), relative_path=pillar["html_rel"]
        ) == _html(frozen)
    for path in (ROOT / "index.html", PAGE):
        footer = _html(path).split('<footer class="site-footer">', 1)[1]
        assert 'href="/ferramentas/"' in footer


def test_public_artifact_navigation_promotion_is_ordered_and_fail_closed(
    tmp_path: Path,
) -> None:
    legacy = """<header>
    <nav class="desktop-nav"><a href="/#atuacao">Atuação</a><a href="/conteudos/">Conteúdos</a><a aria-current="page" href="/ferramentas/">Qualquer texto</a><a href="/#faq">Dúvidas</a></nav>
    <nav class="mobile-nav"><a href="/bid-room-licitacoes-obras/">Analisar licitação</a><a href="/conteudos/">Conteúdos</a><a href="/ferramentas/">Ferramentas</a><a class="button button-primary" href="/#contato">Analisar meu caso</a></nav>
    </header>"""
    promoted = promote_public_navigation(legacy, relative_path="ferramentas/index.html")
    blocks = re.findall(
        r'<nav\b[^>]*(?:desktop-nav|mobile-nav)[^>]*>(.*?)</nav>',
        promoted,
        flags=re.DOTALL,
    )
    expected_hrefs = [href for _, href in CANONICAL_NAV_ITEMS]
    expected_labels = [label for label, _ in CANONICAL_NAV_ITEMS]
    for index, block in enumerate(blocks):
        anchors = re.findall(r'<a\b[^>]*>.*?</a>', block, flags=re.DOTALL)
        navigation = [anchor for anchor in anchors if 'class="button ' not in anchor]
        hrefs = [
            re.search(r'href="([^"]+)"', anchor).group(1)
            for anchor in navigation
        ]
        labels = [
            re.sub(r"<[^>]+>", "", anchor).strip() for anchor in navigation
        ]
        assert hrefs == expected_hrefs
        assert labels == expected_labels
        expected_position = "header_nav" if index == 0 else "mobile_nav"
        assert all(
            f'data-cta-position="{expected_position}"' in anchor
            for anchor in navigation
        )
        assert '/#ofertas' not in block and '/#jornadas' not in block
        current = [
            anchor for anchor in navigation if 'aria-current="page"' in anchor
        ]
        assert len(current) == 1
        assert 'href="/ferramentas/"' in current[0]
        if index == 1:
            assert "Analisar meu caso" in block

    artifact = tmp_path / "artifact"
    artifact.mkdir()
    (artifact / "index.html").write_text(promoted, encoding="utf-8")
    assert audit_public_navigation_tree(artifact) == {
        "audited_files": 1,
        "audited_blocks": 2,
        "frozen_files": 0,
    }
    (artifact / "index.html").write_text(legacy, encoding="utf-8")
    with pytest.raises(ValueError, match="navigation is not canonical"):
        audit_public_navigation_tree(artifact)

    unsupported = legacy.replace(
        '<a href="/#faq">Dúvidas</a>',
        '<span data-nav-extra>Texto solto</span>',
    )
    with pytest.raises(ValueError, match="unsupported content"):
        promote_public_navigation(unsupported, relative_path="mutable/index.html")


def test_report_returns_to_deliverables_without_changing_offer_contract() -> None:
    html = _html(REPORT)
    assert '<a href="/entregas/">Entregas</a>' in html
    assert '"name":"Entregas","item":"https://confenge.com.br/entregas/"' in html
    assert "R$ 599 = 1 relatório adaptado" in html
    assert html.count('data-next-action-id="contratar_relatorio_inteligencia_599"') == 5
    # Five canonical order-entry CTAs plus the inline capture form share the id.
    assert html.count('data-offer-id="handraise-report-intelligence-599-v1"') == 6
    assert (
        html.count(
            'data-cta-position="offer_capture" action="/.netlify/functions/lead"'
        )
        + html.count(
            'action="/.netlify/functions/lead" data-offer-id='
            '"handraise-report-intelligence-599-v1"'
        )
        == 1
    )


def test_sitemap_allowlist_and_public_artifact_contract() -> None:
    for name in ("sitemap.xml", "sitemap.txt"):
        assert CANONICAL in _html(ROOT / name)
    public_source = _html(ROOT / "scripts/pseo/public_artifact.py")
    assert '"entregas"' in public_source
    built = ROOT / "_site" / "entregas" / "index.html"
    if (ROOT / "_site").is_dir():
        assert built.is_file()
        assert CANONICAL in _html(built)


def test_asset_identifiers_are_stable_and_do_not_contain_pii() -> None:
    html = _html()
    assert 'data-asset-id="entregas-exemplos-hub"' in html
    assert 'data-asset-family="biblioteca-entregas"' in html
    assert 'data-source="CONFENGE_WEB"' in html
    for cta_id in (
        "deliverables-hero-compare",
        "deliverables-open-report",
        "deliverables-understand-scope",
        "deliverables-final-bundle",
    ):
        assert f'data-cta-id="{cta_id}"' in html
    tags = re.findall(r'<a\b[^>]*data-cta-id="[^"]+"[^>]*>', html)
    assert tags
    assert all('data-event-name="cta_click"' in tag for tag in tags)
    assert all('data-cta-position="' in tag for tag in tags)
    assert not any("@" in tag or re.search(r"\+?\d{10,}", tag) for tag in tags)
    ids = re.findall(r'data-cta-id="([^"]+)"', html)
    assert len(ids) == len(set(ids)), f"duplicate cta ids: {ids}"

    home = _html(ROOT / "index.html")
    for cta_id in ("home-know-deliverables", "home-open-first-deliverable"):
        tag = re.search(rf'<a\b[^>]*data-cta-id="{cta_id}"[^>]*>', home)
        assert tag and 'data-event-name="cta_click"' in tag.group(0)


def test_every_bundle_transition_is_attributable_to_its_origin() -> None:
    """The most valuable transition of the page cannot stay anonymous."""
    html = _html()
    links = re.findall(
        r'<a\b[^>]*href="/diagnostico-b2g-expansao/"[^>]*>', html
    )
    assert len(links) >= 8, f"expected the bundle link on every example, got {len(links)}"
    ids, positions = [], []
    for link in links:
        cta_id = re.search(r'data-cta-id="([^"]+)"', link)
        position = re.search(r'data-cta-position="([^"]+)"', link)
        assert cta_id, f"unattributed bundle link: {link}"
        assert position, f"bundle link without position: {link}"
        assert 'data-asset-id="entregas-exemplos-hub"' in link, link
        assert 'data-event-name="cta_click"' in link, link
        ids.append(cta_id.group(1))
        positions.append(position.group(1))
    assert len(set(ids)) == len(ids), ids
    assert len(set(positions)) == len(positions), positions
    for number in range(1, 9):
        assert f"example_{number:02d}_price" in positions, number
    assert "UNKNOWN_SERVICE" not in html
