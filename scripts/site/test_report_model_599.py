"""Public contract for the indexable R$ 599 report model."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]
ROUTE = "/casos/modelo-relatorio-inteligencia-licitacoes/"
CANONICAL = f"https://confenge.com.br{ROUTE}"
PAGE = ROOT / ROUTE.strip("/") / "index.html"
CSS = PAGE.with_name("styles.css")
ACTION_MATRIX = ROOT / "docs/contracts/intent-action/intent-action-matrix.v1.json"
CATALOG = ROOT / "data/offers/catalog.snapshot.json"
ACTION_ID = "contratar_relatorio_inteligencia_599"
HANDRAISE_ID = "handraise-report-intelligence-599-v1"
EXPECTED_MESSAGE = (
    "Olá, Tiago. Vi o modelo de relatório de inteligência de licitações e quero "
    "contratar uma versão adaptada à minha empresa por R$ 599."
)


def _html() -> str:
    return PAGE.read_text(encoding="utf-8")


def _brl_millions(raw: str) -> Decimal:
    value = raw.removeprefix("R$").strip().casefold()
    if value.endswith("mi"):
        return Decimal(value.removesuffix("mi").strip().replace(".", "").replace(",", "."))
    if value.endswith("mil"):
        thousands = Decimal(
            value.removesuffix("mil").strip().replace(".", "").replace(",", ".")
        )
        return thousands / Decimal(1000)
    raise AssertionError(f"unsupported BRL display amount: {raw!r}")


def test_page_is_direct_public_html_without_friction() -> None:
    html = _html()
    lowered = html.lower()
    assert PAGE.is_file()
    assert CSS.is_file()
    assert '<main id="conteudo">' in html
    assert '<meta content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" name="robots"/>' in html
    assert f'<link href="{CANONICAL}" rel="canonical"/>' in html
    assert not any(token in lowered for token in ("<form", "<dialog", "<details", ".pdf", "download"))


def test_product_promise_value_and_scope_are_explicit_before_the_example() -> None:
    html = _html()
    offer_end = html.index('<article class="report-document"')
    offer = html[:offer_end]

    for phrase in (
        "Relatório Executivo de Priorização de Licitações",
        "Escolha quais licitações disputar e quais recusar.",
        "12 analisadas",
        "3 priorizadas",
        "7 recusadas",
        "O que você recebe",
        "R$ 599 = 1 relatório adaptado",
        "quantidade de oportunidades e documentos",
        "prazo são confirmados",
        "antes de qualquer cobrança",
    ):
        assert phrase in offer

    for deliverable in (
        "Decisão executiva",
        "Carteira priorizada",
        "Impedimentos e condições",
        "Aderência à sua empresa",
        "Exposição financeira preliminar",
        "Ficha por oportunidade",
        "Próximas ações",
        "Fontes e rastreabilidade",
    ):
        assert deliverable in offer

    assert offer.index("O que você recebe") < offer.index("CONSULTE O EXEMPLO")
    assert "garante vitória" not in offer.casefold()
    assert "entrega em" not in offer.casefold()


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


def test_portfolio_total_reconciles_with_all_twelve_synthetic_rows() -> None:
    html = _html()
    row_amounts = re.findall(
        r'<tr[^>]*><td>A-\d{2}</td><th[^>]*>.*?</th><td>(R\$\s*[\d.,]+\s*(?:mi|mil))</td>',
        html,
        flags=re.DOTALL,
    )
    assert len(row_amounts) == 12
    summary = re.search(r"<dt>Carteira lida</dt><dd>(R\$[^<]+)</dd>", html)
    assert summary
    assert sum(map(_brl_millions, row_amounts), Decimal(0)) == _brl_millions(
        summary.group(1)
    )

    mobile_items = re.findall(
        r'<li class="report-mobile-opportunity[^>]*"[^>]*data-decision="([^"]+)"',
        html,
    )
    assert len(mobile_items) == 12
    assert mobile_items.count("PARTICIPAR") == 1
    assert mobile_items.count("COM CONDIÇÕES") == 2
    assert mobile_items.count("INVESTIGAR") == 2
    assert mobile_items.count("NÃO PARTICIPAR") == 7


def test_decision_sheet_preserves_evidence_topology_without_fake_sources() -> None:
    html = _html()
    evidence = re.search(
        r'<section[^>]+id="evidencias".*?</section>', html, flags=re.DOTALL
    )
    assert evidence
    block = evidence.group(0)
    for field in (
        "Fonte oficial",
        "Requisito do edital",
        "Evidência da empresa",
        "Confiança da leitura",
        "Ponto a revalidar",
        "Validade da decisão",
    ):
        assert field in block
    assert "referência sintética" in block.casefold()
    assert "links diretos para as fontes oficiais" in block.casefold()
    assert 'href="http' not in block


def test_value_ladder_price_and_whatsapp_contract() -> None:
    html = _html()
    positions = set(re.findall(r'data-cta-position="(report_[^"]+)"', html))
    assert {
        "report_header",
        "report_hero",
        "report_after_proof",
        "report_final",
        "report_mobile_sticky",
    } == positions
    assert html.count("Quero meu relatório por R$ 599") >= 3
    assert "R$ 599 = 1 relatório adaptado" in html
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
    assert len(links) == 5
    for link in links:
        parsed = urlparse(link)
        assert parsed.netloc == "wa.me" and parsed.path == "/5548988344559"
        assert parse_qs(parsed.query).get("text") == [EXPECTED_MESSAGE]

    commercial_tags = re.findall(
        r'<a\b[^>]*href="https://wa\.me/5548988344559\?text=[^"]+"[^>]*>', html
    )
    assert len(commercial_tags) == 5
    for tag in commercial_tags:
        assert f'data-next-action-id="{ACTION_ID}"' in tag
        assert f'data-offer-id="{HANDRAISE_ID}"' in tag
        assert 'data-cta-kind="offer"' in tag
        assert re.search(r'data-cta-id="report-599-[^"]+"', tag)
        assert re.search(r'data-cta-position="report_[^"]+"', tag)
    assert 'data-event-name="offer_cta_click"' not in html


def test_price_has_versioned_non_catalog_action_authority() -> None:
    html = _html()
    matrix = json.loads(ACTION_MATRIX.read_text(encoding="utf-8"))
    route = next(row for row in matrix["routes"] if row["id"] == ACTION_ID)
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_ids = {offer["offer_id"] for offer in catalog["offers"]}

    assert matrix["version"] == "1.2.0"
    assert route["offer_id"] == HANDRAISE_ID
    assert route["service_id"] is None
    assert route["asset_id"] == "relatorio-inteligencia-licitacoes-demonstrativo"
    assert HANDRAISE_ID not in catalog_ids
    assert route["commercial_action_type"] == "owner_approved_non_catalog_whatsapp_handraise"
    assert route["authority_source"].startswith("docs/stories/story-public-report-model-599.md")
    assert route["authorized_amount_cents"] == 59900
    assert route["currency"] == "BRL"
    assert route["unit"] == "one_adapted_report"
    assert route["scope_state"] == "UNKNOWN_UNTIL_HUMAN_ACCEPTANCE"
    assert route["terms_state"] == "UNKNOWN_UNTIL_HUMAN_ACCEPTANCE"
    assert route["checkout_enabled"] is False
    assert route["auto_send"] is False
    assert route["sla"] == "UNKNOWN"
    assert f'data-next-action-id="{ACTION_ID}"' in html
    assert f'data-offer-id="{HANDRAISE_ID}"' in html
    body_tag = re.search(r"<body\b[^>]*>", html)
    assert body_tag and "data-offer-id" not in body_tag.group(0), (
        "non-catalog handraise must not emit catalog offer_view on page load"
    )
    assert "Escopo e aceite são confirmados" in html

    assert 'window.confengeTrack("offer_cta_click"' not in html
    assert "data-next-action-id" not in html.split("<script>")[-1]


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
