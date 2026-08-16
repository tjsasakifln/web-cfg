"""Taxonomy: analysis must not collapse into CASO CONFENGE / Review."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.taxonomy import check_taxonomy
from scripts.contract_analysis.tests.helpers import complete_live_record


def test_declared_caso_confenge_is_rejected():
    rec = complete_live_record(content_class="CASO_CONFENGE")
    errors = check_taxonomy(rec)
    assert "taxonomy_declared_caso_confenge" in errors
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state == "REJECT"


def test_case_study_copy_is_rejected():
    rec = complete_live_record(
        executive_summary="Este case study mostra o customer success da CONFENGE com o cliente da CONFENGE."
    )
    errors = check_taxonomy(rec)
    assert "taxonomy_case_study" in errors or "taxonomy_customer_success" in errors
    assert evaluate_publication(rec, cohort=[rec]).state == "REJECT"


def test_schema_review_or_casestudy_is_rejected():
    rec = complete_live_record()
    schema = {"@type": "Review", "reviewBody": "excelente"}
    errors = check_taxonomy(rec, schema=schema)
    assert "taxonomy_schema_review" in errors
    schema2 = {"@type": "CaseStudy"}
    errors2 = check_taxonomy(rec, schema=schema2)
    assert "taxonomy_schema_casestudy" in errors2
    assert evaluate_publication(rec, cohort=[rec], schema=schema).state == "REJECT"


def test_atuamos_neste_contrato_is_rejected():
    rec = complete_live_record(
        cta={"label": "Atuamos neste contrato", "href": "/casos/", "text": "Nossa atuação da CONFENGE neste contrato."}
    )
    # The phrase in executive_summary is the reliable trigger.
    rec["executive_summary"] = "Atuamos neste contrato como prova de cliente."
    errors = check_taxonomy(rec)
    assert "taxonomy_atuamos_neste_contrato" in errors or "taxonomy_prova_de_cliente" in errors
    assert evaluate_publication(rec, cohort=[rec]).state == "REJECT"


def test_disclaimer_nao_e_caso_confenge_is_allowed():
    rec = complete_live_record()
    html = "Esta análise não é um caso CONFENGE e não implica relação comercial."
    assert check_taxonomy(rec, rendered_html=html) == []


def test_honest_analysis_copy_passes_taxonomy():
    rec = complete_live_record()
    assert check_taxonomy(rec) == []
    html = (
        "<p>Esta é uma análise técnica editorial independente de fonte pública. "
        "Não implica relação comercial da CONFENGE.</p>"
    )
    assert check_taxonomy(rec, rendered_html=html) == []
