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
CSS = PAGE.with_name("styles.css")
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
    for forbidden in ("<form", "<dialog", "<details", ".pdf", "download=", "cadastre"):
        assert forbidden not in lowered
    assert html.count("<h1") == 1


def test_hub_is_honest_about_every_published_example() -> None:
    html = _html()
    for phrase in (
        "Conheça nossas entregas",
        "8 exemplos disponíveis",
        "Primeiro exemplo publicado",
        "Relatório Executivo de Priorização de Licitações",
        "Consultar o relatório completo",
        "12",
        "3",
        "7",
        "integralmente sintéticos",
        "R$ 599 por unidade",
    ):
        assert phrase in html
    for route in LADDER_ROUTES:
        assert f'href="{route}"' in html, route
    assert "em breve" not in html.casefold()
    assert "placeholder" not in html.casefold()
    assert html.count('class="deliverable-feature"') == len(LADDER_ROUTES)
    for number in range(1, 9):
        assert f"EXEMPLO 0{number}" in html
    assert "EXEMPLO 09" not in html
    assert "Marcações de outlier</dt><dd>17" in html
    assert "<dt>Outliers</dt><dd>17" not in html


def test_hub_states_the_bundle_without_replacing_the_unit_prices() -> None:
    html = _html()
    assert 'href="/diagnostico-b2g-expansao/"' in html
    assert "R$ 8.000" in html
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
    hub_text = _visible_text(_html())
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
    assert '<link href="/entregas/styles.css" rel="stylesheet"/>' in home
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
    # Five WhatsApp CTAs plus the persisted capture form (#289) share the offer id.
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
        "deliverables-hero-first-example",
        "deliverables-open-report",
        "deliverables-understand-scope",
        "deliverables-final-open-report",
    ):
        assert f'data-cta-id="{cta_id}"' in html
    tags = re.findall(r'<a\b[^>]*data-cta-id="[^"]+"[^>]*>', html)
    assert tags
    assert all('data-event-name="cta_click"' in tag for tag in tags)
    assert not any("@" in tag or re.search(r"\+?\d{10,}", tag) for tag in tags)

    home = _html(ROOT / "index.html")
    for cta_id in ("home-know-deliverables", "home-open-first-deliverable"):
        tag = re.search(rf'<a\b[^>]*data-cta-id="{cta_id}"[^>]*>', home)
        assert tag and 'data-event-name="cta_click"' in tag.group(0)
