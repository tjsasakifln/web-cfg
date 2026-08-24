"""Public contract for the indexable deliverable models of the value ladder.

Each page models one deliverable of the Diagnóstico B2G de Expansão. They share a
single synthetic base so the numbers reconcile across the family, exactly as the
paid deliverables reconcile against one canonical dataset.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]
ACTION_MATRIX = ROOT / "docs/contracts/intent-action/intent-action-matrix.v1.json"
CATALOG = ROOT / "data/offers/catalog.snapshot.json"
STORY = "docs/stories/story-deliverable-models-value-ladder.md"
ANCHOR_ROUTE = "/casos/modelo-relatorio-inteligencia-licitacoes/"

# slug, display price, cents, asset_id, action id, cta prefix, whatsapp subject
MODELS = [
    (
        "modelo-base-quantitativa-canonica",
        "R$ 690",
        69000,
        "base-quantitativa-canonica-demonstrativo",
        "contratar_base_quantitativa_canonica",
        "base-690",
        "base quantitativa canônica",
    ),
    (
        "modelo-apresentacao-executiva-resultados",
        "R$ 890",
        89000,
        "apresentacao-executiva-resultados-demonstrativo",
        "contratar_apresentacao_executiva",
        "apresentacao-890",
        "apresentação executiva de resultados",
    ),
    (
        "modelo-mapa-compradores-publicos",
        "R$ 1.200",
        120000,
        "mapa-compradores-publicos-demonstrativo",
        "contratar_mapa_compradores",
        "mapa-1200",
        "mapa de compradores públicos",
    ),
    (
        "modelo-contratos-vincendos-relicitacao",
        "R$ 1.450",
        145000,
        "contratos-vincendos-relicitacao-demonstrativo",
        "contratar_contratos_vincendos",
        "vincendos-1450",
        "contratos vincendos e recontratação",
    ),
    (
        "modelo-mapeamento-concorrentes-publicos",
        "R$ 1.900",
        190000,
        "mapeamento-concorrentes-publicos-demonstrativo",
        "contratar_mapeamento_concorrentes",
        "concorrentes-1900",
        "mapeamento de concorrentes",
    ),
    (
        "modelo-painel-precos-obras-publicas",
        "R$ 2.400",
        240000,
        "painel-precos-obras-publicas-demonstrativo",
        "contratar_painel_precos",
        "precos-2400",
        "painel de preços de obras públicas",
    ),
    (
        "modelo-relatorio-executivo-consolidado",
        "R$ 3.750",
        375000,
        "relatorio-executivo-consolidado-demonstrativo",
        "contratar_relatorio_executivo",
        "consolidado-3750",
        "relatório executivo consolidado",
    ),
]

# Numbers every page must repeat, because all seven describe one synthetic base.
SHARED_BASE = ("118", "R$ 132,40 mi", "54", "76", "88")
TIPOLOGY_TOTALS = (
    "R$ 96,20 mi",
    "R$ 31,00 mi",
    "R$ 5,20 mi",
)
TIPOLOGY_SHARES = (
    "72,7%",
    "23,4%",
    "3,9%",
)
COMPETITOR_ROWS = (
    ("C-01", 0.232, "0,2%"),
    ("C-02", 0.762, "0,6%"),
    ("C-03", 0.202, "0,2%"),
    ("C-04", 8.900, "6,7%"),
    ("C-05", 0.741, "0,6%"),
)


def _page(slug: str) -> Path:
    return ROOT / "casos" / slug / "index.html"


def _html(slug: str) -> str:
    return _page(slug).read_text(encoding="utf-8")


def _message(subject: str, price: str) -> str:
    return (
        f"Olá, Tiago. Vi o modelo de {subject} e quero contratar uma versão "
        f"adaptada à minha empresa por {price}."
    )


def test_every_model_is_direct_public_html_without_friction() -> None:
    for slug, *_ in MODELS:
        html = _html(slug)
        lowered = html.casefold()
        canonical = f"https://confenge.com.br/casos/{slug}/"
        assert _page(slug).is_file(), slug
        assert _page(slug).with_name("styles.css").is_file(), slug
        assert '<main id="conteudo">' in html, slug
        assert html.count("<h1") == 1, slug
        assert (
            '<meta content="index,follow,max-image-preview:large,max-snippet:-1,'
            'max-video-preview:-1" name="robots"/>' in html
        ), slug
        assert f'<link href="{canonical}" rel="canonical"/>' in html, slug
        for forbidden in ("<form", "<dialog", "<details", ".pdf", "download"):
            assert forbidden not in lowered, (slug, forbidden)
        # The em dash gate covers /casos/; keep the family clean at source.
        assert "\u2014" not in html, slug


def test_every_model_is_irreversibly_de_identified() -> None:
    for slug, *_ in MODELS:
        html = _html(slug)
        lowered = html.casefold()
        for phrase in (
            "dados sintéticos",
            "integralmente sintéticos",
            "não representa cliente, licitação ou resultado real",
            "perfil fictício",
        ):
            assert phrase in lowered, (slug, phrase)
        for forbidden in (
            "extra construtora",
            "extra empreiteira",
            "cat/crea",
            "c:\\users\\",
            "onedrive",
            "pncp.gov.br",
            "rancho queimado",
        ):
            assert forbidden not in lowered, (slug, forbidden)
        cnpjs = set(re.findall(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", html))
        assert cnpjs == {"52.407.089/0001-09"}, (slug, cnpjs)


def test_synthetic_base_reconciles_across_the_whole_family() -> None:
    for slug, *_ in MODELS:
        html = _html(slug)
        assert "118" in html, slug
    # The pages that publish the market aggregate must agree on it.
    for slug in (
        "modelo-mapa-compradores-publicos",
        "modelo-relatorio-executivo-consolidado",
        "modelo-apresentacao-executiva-resultados",
    ):
        html = _html(slug)
        for token in SHARED_BASE:
            assert token in html, (slug, token)
    # The price panel is published identically wherever it appears.
    panel = ("R$ 520,0 mil", "R$ 1,74 mi", "R$ 6,10 mi", "R$ 198,0 mil")
    for slug in (
        "modelo-painel-precos-obras-publicas",
        "modelo-relatorio-executivo-consolidado",
    ):
        html = _html(slug)
        for token in panel:
            assert token in html, (slug, token)
    # Totals and shares must also reconcile across every published summary of
    # the same synthetic base, not only within each page in isolation.
    for slug in (
        "modelo-painel-precos-obras-publicas",
        "modelo-relatorio-executivo-consolidado",
        "modelo-apresentacao-executiva-resultados",
    ):
        html = _html(slug)
        for token in TIPOLOGY_TOTALS:
            assert token in html, (slug, token)
    for slug in (
        "modelo-relatorio-executivo-consolidado",
        "modelo-apresentacao-executiva-resultados",
    ):
        html = _html(slug)
        for token in TIPOLOGY_SHARES:
            assert token in html, (slug, token)
    # C-04's four-buyer allocation must remain identical in the buyer map,
    # competitor map and executive summaries. The four values close R$ 8,90 mi.
    buyer_map = _html("modelo-mapa-compradores-publicos")
    assert "C-04 assina 1, no valor de R$ 6,19 mi" in buyer_map
    competitor_map = _html("modelo-mapeamento-concorrentes-publicos")
    for token in ("C-04", "R$ 8,90 mi", "R$ 6,19 mi"):
        assert token in competitor_map, token
    for slug in (
        "modelo-relatorio-executivo-consolidado",
        "modelo-apresentacao-executiva-resultados",
    ):
        html = _html(slug)
        for token in ("C-04", "R$ 8,90 mi"):
            assert token in html, (slug, token)


def test_competitor_shares_use_the_shared_base_denominator() -> None:
    total_mi = 132.40
    expected_subtotal = round(
        sum(value_mi for _, value_mi, _ in COMPETITOR_ROWS) / total_mi * 100,
        1,
    )
    assert expected_subtotal == 8.2

    for slug, *_ in MODELS:
        assert "R$ 136,90 mi" not in _html(slug), slug

    for slug in (
        "modelo-mapeamento-concorrentes-publicos",
        "modelo-apresentacao-executiva-resultados",
        "modelo-relatorio-executivo-consolidado",
    ):
        html = _html(slug)
        for competitor, value_mi, share in COMPETITOR_ROWS:
            calculated = round(value_mi / total_mi * 100, 1)
            assert share == f"{calculated:.1f}%".replace(".", ",")
            row = re.search(
                rf"<tr[^>]*>.*?>{competitor}</(?:th|td)>.*?</tr>",
                html,
                flags=re.DOTALL,
            )
            assert row and share in row.group(0), (slug, competitor, share)

    competitor_map = _html("modelo-mapeamento-concorrentes-publicos")
    assert "R$ 132,40 mi elegíveis" in competitor_map
    assert "<td>8,2%</td>" in competitor_map
    assert "somar as cinco participações já arredondadas devolve 8,3%" in competitor_map


def test_price_outliers_distinguish_consolidated_rows_from_all_marks() -> None:
    """The consolidated cut marks 17, not 7.

    The consolidated Tukey ceiling is P75 + 1.5 * IQR = 664.0k + 1.5 * 615.0k =
    R$ 1.586,5k. The construção median is R$ 1,74 mi over N=24, so by the
    definition of a median at least twelve construção contracts already sit
    above that ceiling. A consolidated count of 7 is therefore arithmetically
    impossible, and any page publishing it contradicts its own Tukey limit.
    """
    price_panel = _html("modelo-painel-precos-obras-publicas")
    presentation = _html("modelo-apresentacao-executiva-resultados")
    consolidated = _html("modelo-relatorio-executivo-consolidado")
    base = _html("modelo-base-quantitativa-canonica")

    p75_k, iqr_k, construcao_median_k = 664.0, 615.0, 1740.0
    ceiling_k = p75_k + 1.5 * iqr_k
    assert ceiling_k == 1586.5
    assert ceiling_k < construcao_median_k, "consolidated ceiling must sit below the construção median"

    # Marked within each typology: 2 + 5 + 4 = 11.
    assert re.search(
        r">Construção de edificações</th><td>24</td>.*?<td>2</td></tr>",
        price_panel,
        flags=re.DOTALL,
    )
    assert "2 mais 5 mais 4, ou seja 11" in price_panel

    # Marked against the consolidated ceiling: 17 (13 construção, 3 reforma, 1 manutenção).
    for label, html in (
        ("painel", price_panel),
        ("apresentacao", presentation),
        ("consolidado", consolidated),
    ):
        total_row = re.search(
            r"<tr[^>]*>(?:(?!</tr>).)*?>(?:TOTAL|Total consolidado)</th>.*?</tr>",
            html,
            flags=re.DOTALL,
        )
        assert total_row, label
        row = total_row.group(0)
        assert row.rstrip().endswith("<td>17</td></tr>"), (label, row[-90:])
        assert not row.rstrip().endswith("<td>7</td></tr>"), label

    assert "Outliers no consolidado</dt><dd>17 de 118" in price_panel
    assert "<dd>7 de 118" not in price_panel
    assert "<dt>MARCAÇÕES DE OUTLIER</dt><dd>17" in price_panel
    assert "17 marcações de outlier" in consolidated.casefold()
    assert "17 marcações de outlier" in base.casefold()

    # No page may describe the consolidated cut as an increment over the typologies.
    for slug, *_ in MODELS:
        assert "e 7 no consolidado" not in _html(slug), slug


def test_competitor_ranking_rule_is_consistent() -> None:
    consolidated = _html("modelo-relatorio-executivo-consolidado")
    competitor_map = _html("modelo-mapeamento-concorrentes-publicos")
    assert "15 primeiros por valor" not in consolidated
    assert "15 primeiros por frequência, com desempate por valor" in consolidated
    assert "Ordenação por frequência, depois por valor" in competitor_map


def test_value_ladder_prices_are_visible_and_strictly_ascending() -> None:
    seen: list[int] = []
    for slug, price, cents, *_ in MODELS:
        html = _html(slug)
        assert price in html, slug
        # The anchor stays the cheapest asset on the site.
        assert cents > 59900, slug
        seen.append(cents)
        # Every unit points at the bundle without replacing its own price.
        assert "R$ 8.000" in html, slug
        assert 'href="/diagnostico-b2g-expansao/"' in html, slug
        assert "60 dias" in html, slug
    assert seen == sorted(seen), seen
    assert len(set(seen)) == len(seen)


def test_commercial_honesty_denylist() -> None:
    for slug, *_ in MODELS:
        lowered = _html(slug).casefold()
        for forbidden in (
            "garante vitória",
            "garantia de vitória",
            "entrega em",
            "parcelamos",
            "parcelado em",
            "caso de sucesso",
            "customer success",
        ):
            assert forbidden not in lowered, (slug, forbidden)
        assert "escopo e aceite são confirmados" in lowered, slug


def test_whatsapp_contract_is_specific_per_deliverable() -> None:
    for slug, price, _cents, asset_id, action_id, prefix, subject in MODELS:
        html = _html(slug)
        offer_id = f"handraise-{slug}-v1"
        links = re.findall(r'href="(https://wa\.me/5548988344559\?text=[^"]+)"', html)
        assert len(links) == 5, (slug, len(links))
        expected = _message(subject, price)
        for link in links:
            parsed = urlparse(link)
            assert parsed.netloc == "wa.me" and parsed.path == "/5548988344559", slug
            assert parse_qs(parsed.query).get("text") == [expected], slug

        positions = set(re.findall(r'data-cta-position="(report_[^"]+)"', html))
        assert positions == {
            "report_header",
            "report_hero",
            "report_after_proof",
            "report_final",
            "report_mobile_sticky",
        }, (slug, positions)

        tags = re.findall(
            r'<a\b[^>]*href="https://wa\.me/5548988344559\?text=[^"]+"[^>]*>', html
        )
        assert len(tags) == 5, slug
        for tag in tags:
            assert f'data-next-action-id="{action_id}"' in tag, slug
            assert f'data-offer-id="{offer_id}"' in tag, slug
            assert f'data-asset-id="{asset_id}"' in tag, slug
            assert 'data-cta-kind="offer"' in tag, slug
            assert re.search(rf'data-cta-id="{re.escape(prefix)}-[^"]+"', tag), slug
        assert 'data-event-name="offer_cta_click"' not in html, slug
        assert 'window.confengeTrack("offer_cta_click"' not in html, slug


def test_analytics_identifiers_are_stable_and_pii_free() -> None:
    for slug, _price, _cents, asset_id, *_ in MODELS:
        html = _html(slug)
        assert 'data-source="CONFENGE_WEB"' in html, slug
        assert f'data-asset-id="{asset_id}"' in html, slug
        assert 'window.confengeTrack("asset_view"' in html, slug
        body = re.search(r"<body\b[^>]*>", html)
        assert body and "data-offer-id" not in body.group(0), slug
        tagged = re.findall(r"<[a-z]+\b[^>]*data-[a-z-]+=\"[^\"]*\"[^>]*>", html)
        for tag in tagged:
            assert "@" not in tag or "href=\"mailto:" in tag, slug
            for attr in re.findall(r'data-[a-z-]+="([^"]*)"', tag):
                assert not re.search(r"\d{10,}", attr), (slug, attr)


def test_authority_slots_are_present_for_the_casos_family() -> None:
    for slug, *_ in MODELS:
        html = _html(slug)
        assert 'data-permission-class="demonstrativo"' in html, slug
        assert 'href="/correcoes/"' in html, slug
        assert 'href="/especialista/tiago-jun-sasaki/"' in html, slug
        assert '<time datetime="2026-08-23">' in html, slug
        assert "Atualizado em" in html, slug
        assert 'id="metodologia"' in html, slug
        assert "Limita" in html, slug


def test_evidence_topology_never_fabricates_a_source() -> None:
    for slug, *_ in MODELS:
        html = _html(slug)
        block = re.search(
            r'<section[^>]+id="evidencias".*?</section>', html, flags=re.DOTALL
        )
        assert block, slug
        body = block.group(0)
        for field in (
            "Fonte oficial",
            "Requisito do edital",
            "Evidência da empresa",
            "Confiança da leitura",
            "Ponto a revalidar",
            "Validade da decisão",
        ):
            assert field in body, (slug, field)
        assert 'href="http' not in body, slug


def test_schema_and_internal_discovery() -> None:
    hub = (ROOT / "entregas/index.html").read_text(encoding="utf-8")
    cases = (ROOT / "casos/index.html").read_text(encoding="utf-8")
    sitemap_xml = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sitemap_txt = (ROOT / "sitemap.txt").read_text(encoding="utf-8")
    for slug, *_ in MODELS:
        route = f"/casos/{slug}/"
        canonical = f"https://confenge.com.br{route}"
        html = _html(slug)
        payloads = re.findall(
            r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.DOTALL
        )
        assert payloads, slug
        types = {
            node.get("@type")
            for payload in payloads
            for node in json.loads(payload).get("@graph", [])
            if isinstance(node, dict)
        }
        assert {"WebPage", "Report", "BreadcrumbList"} <= types, slug
        assert not ({"Review", "AggregateRating", "CaseStudy"} & types), slug
        assert '<a href="/entregas/">Entregas</a>' in html, slug
        assert f'href="{route}"' in hub, slug
        assert f'href="{route}"' in cases, slug
        assert canonical in sitemap_xml, slug
        assert canonical in sitemap_txt, slug


def test_price_has_versioned_non_catalog_action_authority() -> None:
    matrix = json.loads(ACTION_MATRIX.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_ids = {offer["offer_id"] for offer in catalog["offers"]}
    routes = {row["id"]: row for row in matrix["routes"]}
    for slug, _price, cents, asset_id, action_id, *_ in MODELS:
        route = routes[action_id]
        offer_id = f"handraise-{slug}-v1"
        assert route["offer_id"] == offer_id, slug
        assert offer_id not in catalog_ids, slug
        assert route["service_id"] is None, slug
        assert route["asset_id"] == asset_id, slug
        assert route["authorized_amount_cents"] == cents, slug
        assert route["currency"] == "BRL", slug
        assert route["authority_source"].startswith(STORY), slug
        assert (
            route["commercial_action_type"]
            == "owner_approved_non_catalog_whatsapp_handraise"
        ), slug
        assert route["scope_state"] == "UNKNOWN_UNTIL_HUMAN_ACCEPTANCE", slug
        assert route["terms_state"] == "UNKNOWN_UNTIL_HUMAN_ACCEPTANCE", slug
        assert route["checkout_enabled"] is False, slug
        assert route["auto_send"] is False, slug
        assert route["sla"] == "UNKNOWN", slug
    assert (ROOT / STORY).is_file()


def test_public_artifact_contains_every_model_after_build() -> None:
    if not (ROOT / "_site").is_dir():
        return
    for slug, price, *_ in MODELS:
        built = ROOT / "_site" / "casos" / slug / "index.html"
        assert built.is_file(), slug
        assert price in built.read_text(encoding="utf-8"), slug
