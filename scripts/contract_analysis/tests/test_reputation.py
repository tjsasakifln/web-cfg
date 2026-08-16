"""Reputational safety: no accusation without documentary basis."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.reputation import (
    atypical_collapsed_to_irregular,
    check_reputational_safety,
)
from scripts.contract_analysis.tests.helpers import complete_live_record


def test_accusatory_lemmas_without_basis_are_rejected():
    lemmas = {
        "fraude": "Há fraude no contrato.",
        "irregularidade": "Isso é uma irregularidade da contratada.",
        "culpa": "A culpa é da fiscalização.",
        "má-fé": "A empresa agiu de má-fé.",
        "incapacidade": "Fica evidente a incapacidade técnica da equipe.",
        "ilegalidade": "Trata-se de ilegalidade na medição.",
    }
    for lemma, sentence in lemmas.items():
        rec = complete_live_record(
            interpretation=[{"kind": "INFERENCE", "text": sentence}]
        )
        errors = check_reputational_safety(rec)
        assert errors, lemma
        assert evaluate_publication(rec, cohort=[rec]).state == "REJECT"


def test_negated_lemmas_are_not_accusations():
    rec = complete_live_record(
        cannot_conclude=(
            "Não se afirma irregularidade, culpa, fraude, má-fé, incapacidade "
            "ou ilegalidade. Nem que houve irregularidade no aditivo."
        )
    )
    assert check_reputational_safety(rec) == []
    assert evaluate_publication(rec, cohort=[rec]).state == "PUBLISHABLE_INDEX"


def test_atipico_is_not_accepted_as_irregular():
    honest = "A composição é atípica em relação à amostra. Atípico não é irregular."
    assert atypical_collapsed_to_irregular(honest) is False
    rec = complete_live_record(
        interpretation=[{"kind": "INFERENCE", "text": honest}]
    )
    assert "reputation_atipico_as_irregular" not in check_reputational_safety(rec)

    collapsed = "A composição é atípica e portanto irregular."
    assert atypical_collapsed_to_irregular(collapsed) is True
    bad = complete_live_record(
        interpretation=[{"kind": "INFERENCE", "text": collapsed}]
    )
    errors = check_reputational_safety(bad)
    assert "reputation_atipico_as_irregular" in errors
    assert evaluate_publication(bad, cohort=[bad]).state == "REJECT"


def test_documentary_basis_allows_named_term_only():
    rec = complete_live_record(
        interpretation=[
            {
                "kind": "INFERENCE",
                "text": "O acórdão publicado registra irregularidade formal no aditivo.",
            }
        ],
        documentary_basis=[
            {
                "kind": "tcu_acordao",
                "document_id": "AC-1/2024",
                "url": "https://pesquisa.apps.tcu.gov.br/",
                "allows_terms": ["irregularidade"],
            }
        ],
    )
    errors = check_reputational_safety(rec)
    assert "reputation_irregularidade" not in errors
    # Basis for irregularidade does not authorize fraude.
    rec2 = complete_live_record(
        interpretation=[{"kind": "INFERENCE", "text": "O mesmo acórdão provaria fraude."}],
        documentary_basis=[
            {
                "kind": "tcu_acordao",
                "document_id": "AC-1/2024",
                "url": "https://pesquisa.apps.tcu.gov.br/",
                "allows_terms": ["irregularidade"],
            }
        ],
    )
    assert "reputation_fraude" in check_reputational_safety(rec2)
