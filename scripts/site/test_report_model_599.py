"""Public contract for the indexable R$ 599 report model."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]
ROUTE = "/casos/modelo-relatorio-inteligencia-licitacoes/"
CANONICAL = f"https://confenge.com.br{ROUTE}"
PAGE = ROOT / ROUTE.strip("/") / "index.html"
CSS = PAGE.with_name("styles.css")
EXPECTED_MESSAGE = (
    "Olá, Tiago. Vi o modelo de relatório de inteligência de licitações e quero "
    "contratar uma versão adaptada à minha empresa por R$ 599."
)


def _html() -> str:
    return PAGE.read_text(encoding="utf-8")


def test_page_is_direct_public_html_without_friction() -> None:
    html = _html()
    lowered = html.lower()
    assert PAGE.is_file()
    assert CSS.is_file()
    assert '<main id="conteudo">' in html
    assert '<meta content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" name="robots"/>' in html
    assert f'<link href="{CANONICAL}" rel="canonical"/>' in html
    assert not any(token in lowered for token in ("<form", "<dialog", "<details", ".pdf", "download"))


def test_synthetic_disclosure_and_private_identity_denylist() -> None:
    html = _html()
    lowered = html.casefold()
    for phrase in (
        "dados sintéticos",
        "integralmente sintéticos",
        "não representa cliente, licitação ou resultado real",
        "perfil fictício",
    ):
        assert phrase in lowered
    for forbidden in (
        "extra construtora",
        "extra empreiteira",
        "cat/crea",
        "c:\\users\\",
        "onedrive",
    ):
        assert forbidden not in lowered
    cnpjs = set(re.findall(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", html))
    assert cnpjs == {"52.407.089/0001-09"}, "only CONFENGE's public CNPJ may appear"


def test_value_ladder_price_and_whatsapp_contract() -> None:
    html = _html()
    positions = set(re.findall(r'data-cta-position="(report_[^"]+)"', html))
    assert {"report_hero", "report_after_proof", "report_final"} <= positions
    assert html.count("Quero meu relatório por R$ 599") >= 3
    assert "R$ 599 por relatório" in html
    for marker in (
        "Conclusão executiva",
        "Carteira priorizada",
        "Critérios e gates",
        "Capacidade da empresa",
        "Ficha decisória",
        "Comparação decisória",
        "Plano de 72 horas",
        "Método e limites",
    ):
        assert marker in html

    links = re.findall(r'href="(https://wa\.me/5548988344559\?text=[^"]+)"', html)
    assert len(links) >= 4
    for link in links:
        parsed = urlparse(link)
        assert parsed.netloc == "wa.me" and parsed.path == "/5548988344559"
        assert parse_qs(parsed.query).get("text") == [EXPECTED_MESSAGE]


def test_schema_attribution_and_internal_discovery() -> None:
    html = _html()
    scripts = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.DOTALL
    )
    schemas = [json.loads(payload) for payload in scripts]
    types = {
        item.get("@type")
        for schema in schemas
        for item in schema.get("@graph", [])
        if isinstance(item, dict)
    }
    assert {"WebPage", "Report", "BreadcrumbList"} <= types
    assert 'data-source="CONFENGE_WEB"' in html
    assert 'data-asset-id="relatorio-inteligencia-licitacoes-demonstrativo"' in html
    assert 'window.confengeTrack("asset_view"' in html

    for source in (
        ROOT / "casos/index.html",
        ROOT / "bid-room-licitacoes-obras/index.html",
        ROOT / "diretoria-b2g/index.html",
    ):
        assert f'href="{ROUTE}"' in source.read_text(encoding="utf-8")
    assert CANONICAL in (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    assert CANONICAL in (ROOT / "sitemap.txt").read_text(encoding="utf-8")


def test_public_artifact_contains_page_after_build() -> None:
    site_page = ROOT / "_site" / ROUTE.strip("/") / "index.html"
    if (ROOT / "_site").is_dir():
        assert site_page.is_file()
        assert "R$ 599" in site_page.read_text(encoding="utf-8")
