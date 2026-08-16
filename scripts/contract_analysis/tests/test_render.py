"""Rendered HTML: SEO/schema hygiene and omitted empty sections."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.render import build_schema, render_analysis_html
from scripts.contract_analysis.tests.helpers import complete_live_record
from scripts.site.authority import check_schema_mirrors_visible, extract_jsonld_blocks


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
    assert 'content="noindex,nofollow"' in html


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
