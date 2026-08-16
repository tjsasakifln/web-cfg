"""Adversarial unique-content: strip empresa/órgão/município/números."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.unique_content import (
    are_substantially_different,
    check_unique_content,
    strip_entities_and_numbers,
)
from scripts.contract_analysis.tests.helpers import complete_live_record, entity_swap_clone


def test_strip_removes_company_agency_city_and_numbers():
    rec = complete_live_record()
    text = (
        "Construtora Live Alfa assinou com a Prefeitura de Live Sul em Live Sul "
        "o valor R$ 12.400.000,00 no processo LIVE-BDI-100 com 19,8% de indiretos."
    )
    stripped = strip_entities_and_numbers(text, rec)
    assert "alfa" not in stripped
    assert "live sul" not in stripped
    assert "12400000" not in stripped.replace(" ", "")
    assert "19" not in stripped.split()


def test_clones_that_differ_only_by_entities_fail_unique_content():
    rec = complete_live_record()
    clone = entity_swap_clone(rec)
    assert are_substantially_different(rec, clone) is False
    errors = check_unique_content(rec, [rec, clone])
    assert any(code.startswith("unique_content_near_duplicate") for code in errors)


def test_two_substantive_different_analyses_pass():
    rec = complete_live_record()
    other = complete_live_record(
        id="live-reajuste",
        slug="live-reajuste",
        title="Série de índice da cláusula some antes da data-base",
        executive_summary=(
            "A cláusula de reajuste ancora o aniversário numa série que deixou "
            "de ser divulgada. Sem sucessor pactuado o cálculo não tem denominador."
        ),
        why_analysis=(
            "Passar do aniversário não é crédito automático quando o parâmetro "
            "desaparece. Publicar essa distinção evita pedido sem base."
        ),
        insight_singular=(
            "O fato útil é a descontinuidade da série antes da data-base, não o "
            "calendário do aniversário. Sem índice sucessor o reajuste é "
            "incalculável a partir do pacote."
        ),
        utility_beyond_source=(
            "A fonte mostra a cláusula. A análise mostra o protocolo: achar ato "
            "de substituição ou registrar UNKNOWN antes de falar em mora."
        ),
        intent="reajuste",
        facts=[
            {
                "kind": "FACT",
                "text": "A cláusula nomeia a série e a periodicidade anual.",
                "source_ref": "contrato",
            }
        ],
        calculations=[
            {
                "kind": "CALCULATION",
                "text": "Sem cotação na competência da data-base a variação não é computável.",
            }
        ],
        interpretation=[
            {
                "kind": "INFERENCE",
                "text": "Aniversário com série descontinuada é vazio de parâmetro, não prova de mora.",
            }
        ],
        cannot_conclude="Não se conclui valor devido nem culpa da Administração.",
        methodology="Confrontar cláusula, disponibilidade da série e existência de aditivo sucessor.",
        limitations="Não se reconstrói a série histórica.",
        ficha={
            "empresa": "Outra Empresa",
            "orgao": "Outro Orgao",
            "municipio": "Outra Cidade",
            "uf": "RS",
            "objeto": "Pavimentação",
            "pncp_id": "LIVE-REAJ-1",
        },
    )
    assert are_substantially_different(rec, other) is True
    assert check_unique_content(rec, [rec, other]) == []
    assert check_unique_content(other, [rec, other]) == []


def test_thin_after_strip_fails():
    rec = complete_live_record(
        title="Contrato",
        executive_summary="A empresa X no órgão Y do município Z vale 10.",
        why_analysis="Números.",
        insight_singular="A empresa no órgão do município tem valor.",
        utility_beyond_source="Ver empresa órgão município números.",
        facts=[{"kind": "FACT", "text": "Empresa órgão município 10."}],
        calculations=[],
        interpretation=[],
        cannot_conclude="Nada.",
        methodology="Ler.",
        limitations="Pouca coisa.",
    )
    errors = check_unique_content(rec, [rec])
    assert "unique_content_too_thin_after_strip" in errors
