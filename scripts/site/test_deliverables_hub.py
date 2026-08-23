"""Public contract for the indexable CONFENGE deliverables library."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path


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
    assert [f"EXEMPLO 0{n}" for n in range(1, 9)] == [
        f"EXEMPLO 0{n}" for n in range(1, 9) if f"EXEMPLO 0{n}" in html
    ]
    assert "EXEMPLO 09" not in html


def test_hub_states_the_bundle_without_replacing_the_unit_prices() -> None:
    html = _html()
    assert 'href="/diagnostico-b2g-expansao/"' in html
    assert "R$ 8.000" in html
    for price in ("R$ 599", "R$ 690", "R$ 890", "R$ 1.200", "R$ 1.450", "R$ 1.900", "R$ 2.400", "R$ 3.750"):
        assert price in html, price


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


def test_new_surfaces_and_frozen_shell_runtime_promotion() -> None:
    brand = json.loads((ROOT / "data/site/brand.json").read_text(encoding="utf-8"))
    labels = [item["label"] for item in brand["navigation"]["desktop"]]
    # Keep the approval-era generator contract stable: its rendered hash protects
    # already-reviewed technical analyses. The shipped runtime promotes those
    # frozen shells, while new hand-authored surfaces emit Entregas directly.
    assert labels == LEGACY_NAV
    for path in (ROOT / "index.html", PAGE, REPORT):
        assert _desktop_labels(path) == EXPECTED_NAV, path
    nav_source = (ROOT / "js/modules/nav.js").read_text(encoding="utf-8")
    assert "nav.querySelector('a[href=\"/entregas/\"]')" in nav_source
    assert "nav.querySelector('a[href=\"/ferramentas/\"]')" in nav_source
    assert "toolsLink.textContent = 'Entregas'" in nav_source
    for path in (ROOT / "index.html", PAGE):
        footer = _html(path).split('<footer class="site-footer">', 1)[1]
        assert 'href="/ferramentas/"' in footer


def test_report_returns_to_deliverables_without_changing_offer_contract() -> None:
    html = _html(REPORT)
    assert '<a href="/entregas/">Entregas</a>' in html
    assert '"name":"Entregas","item":"https://confenge.com.br/entregas/"' in html
    assert "R$ 599 = 1 relatório adaptado" in html
    assert html.count('data-next-action-id="contratar_relatorio_inteligencia_599"') == 5
    assert html.count('data-offer-id="handraise-report-intelligence-599-v1"') == 5


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
    assert not any("@" in tag or re.search(r"\+?\d{10,}", tag) for tag in tags)
