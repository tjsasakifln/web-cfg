"""Rendered HTML: SEO/schema hygiene and omitted empty sections."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.render import (
    HUB_DESCRIPTION,
    build_schema,
    render_analysis_html,
    render_hub_html,
)
from scripts.contract_analysis.tests.helpers import complete_live_record
from scripts.site.authority import (
    check_required_slots,
    check_schema_mirrors_visible,
    extract_jsonld_blocks,
)


def _html(rec=None):
    rec = rec or complete_live_record()
    decision = evaluate_publication(rec, cohort=[rec])
    return rec, decision, render_analysis_html(rec, decision)


def test_required_chrome_and_correction_link():
    rec, decision, html = _html()
    assert 'lang="pt-BR"' in html
    assert 'name="viewport"' in html
    assert "skip-link" in html
    assert "/correcoes/" in html
    assert 'rel="canonical"' in html
    assert rec["title"] in html
    assert "name=\"description\"" in html
    assert "Navegação estrutural" in html
    assert "Engº Tiago Sasaki" in html
    assert "datetime=\"2026-08-16\"" in html
    assert "https://www.gov.br/pncp" in html
    assert "data-surface-type=\"analise_tecnica_contrato\"" in html
    assert "análise técnica editorial independente" in html.lower() or "analise tecnica editorial independente" in html.lower()


def test_empty_sections_are_omitted():
    rec = complete_live_record(timeline=[], comparisons=[], update_history=[])
    _, _, html = _html(rec)
    assert 'id="timeline"' not in html
    assert 'id="comparacoes"' not in html
    assert 'id="historico"' not in html
    assert 'id="resumo"' in html
    assert 'id="fatos"' in html


def test_schema_is_article_not_casestudy_or_review():
    rec, decision, html = _html()
    blob = json.dumps(extract_jsonld_blocks(html), ensure_ascii=False)
    assert "CaseStudy" not in blob
    assert "Review" not in blob
    assert "AggregateRating" not in blob
    assert "customer success" not in blob.lower()
    assert '"Article"' in blob
    assert check_schema_mirrors_visible(html) == []
    types = json.dumps(build_schema(rec, decision))
    assert "CaseStudy" not in types
    assert "Review" not in types


def test_fixture_render_is_noindex():
    rec = complete_live_record(
        is_fixture=True,
        source_kind="test_only_fixture",
        approved_for_index=True,
    )
    _, decision, html = _html(rec)
    assert decision.state != "PUBLISHABLE_INDEX"
    assert 'content="noindex' in html
    assert "noarchive" in html


def test_fixture_preview_has_visible_banner_and_no_casestudy():
    rec = complete_live_record(
        is_fixture=True,
        source_kind="test_only_fixture",
        catalog_mode="fixture",
        approved_for_index=True,
    )
    _, decision, html = _html(rec)
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "Prévia editorial de teste" in html
    assert "não deve ser indexada" in html.lower() or "nao deve ser indexada" in html.lower()
    assert "CaseStudy" not in html
    assert "noarchive" in html


def test_cta_url_has_no_cnpj_or_email():
    rec = complete_live_record()
    rec["ficha"] = dict(rec["ficha"], cnpj="52407089000109")
    _, _, html = _html(rec)
    assert 'id="proximo-passo"' in html
    assert "analysis_id=live-bdi-alpha" in html
    href_start = html.find('id="proximo-passo"')
    cta_chunk = html[href_start : href_start + 1200]
    assert "52407089000109" not in cta_chunk
    assert "52.407.089" not in cta_chunk
    assert "@" not in cta_chunk.split("href=")[1].split(">")[0]


def test_hub_and_analysis_expose_residual_authority_slots():
    rec, _decision, analysis_html = _html(
        complete_live_record(reviewer={}, solo_reviewer_disclosure=True)
    )
    assert "não há segundo revisor nomeado" in analysis_html
    assert "Revisor Técnico Independente" not in analysis_html
    assert 'id="ai-disclosure"' in analysis_html
    assert 'data-ai-disclosure="assistive"' in analysis_html
    assert "as_of" in analysis_html
    assert "/correcoes/" in analysis_html
    assert rec["title"] in analysis_html
    assert "CaseStudy" not in analysis_html
    assert '"@type":"Review"' not in analysis_html
    assert check_required_slots(analysis_html, "analise_tecnica_contrato") == []

    hub = render_hub_html([], index_count=0)
    assert 'content="noindex' in hub
    assert "não há segundo revisor nomeado" in hub
    assert 'id="ai-disclosure"' in hub
    assert 'id="metodo"' in hub
    assert "ANÁLISE TÉCNICA DE CONTRATO PÚBLICO" in hub
    assert "NÃO É CASO CONFENGE" in hub
    assert "/correcoes/" in hub
    assert '"@type":"CollectionPage"' in hub or '"@type": "CollectionPage"' in hub
    assert "CaseStudy" not in hub
    assert '"@type":"Review"' not in hub
    assert check_required_slots(hub, "analise_tecnica_contrato") == []
    assert check_schema_mirrors_visible(hub) == []


def test_hub_collectionpage_description_matches_visible_meta():
    html = render_hub_html([], index_count=0)
    assert f'name="description" content="{HUB_DESCRIPTION}"' in html or (
        f'content="{HUB_DESCRIPTION}" name="description"' in html
    )
    blocks = extract_jsonld_blocks(html)
    pages = []
    for block in blocks:
        nodes = block if isinstance(block, list) else block.get("@graph", [block])
        if isinstance(nodes, dict):
            nodes = [nodes]
        for node in nodes:
            if isinstance(node, dict) and node.get("@type") == "CollectionPage":
                pages.append(node)
    assert pages, "hub must emit CollectionPage JSON-LD"
    assert all(node.get("description") == HUB_DESCRIPTION for node in pages)
    assert check_schema_mirrors_visible(html) == []


def test_headings_and_table_accessibility():
    rec, _, html = _html()
    assert html.count("<h1>") == 1
    assert "<h2>" in html
    assert "scope='row'" in html or 'scope="row"' in html
    assert "skip-link" in html
    assert 'lang="pt-BR"' in html


def test_epistemic_labels_are_visible():
    rec = complete_live_record(
        facts=[{"kind": "FACT", "text": "Linha de administração local única na planilha."}],
        calculations=[{"kind": "CALCULATION", "text": "A linha concentra os indiretos publicados."}],
        interpretation=[{"kind": "INFERENCE", "text": "A forma de apresentar custo é atípica no recorte."}],
        cannot_conclude="UNKNOWN: não se conclui sobrepreço nem irregularidade.",
    )
    _, _, html = _html(rec)
    assert 'data-epistemic="FACT"' in html
    assert 'data-epistemic="CALCULATION"' in html
    assert 'data-epistemic="INFERENCE"' in html
    assert "Fato" in html
    assert "Cálculo" in html or "Calculo" in html
    assert "Interpretação técnica" in html
    assert "CONFENGE" in html
    assert "O que não é possível concluir" in html
    assert "UNKNOWN" in html
    # The four types stay labeled; they do not collapse into one blob.
    assert html.find('data-epistemic="FACT"') != html.find('data-epistemic="INFERENCE"')
