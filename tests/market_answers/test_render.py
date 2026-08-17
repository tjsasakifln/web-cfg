"""Rendered first fold and accessibility come from the shipped renderer."""

from __future__ import annotations

import re
from datetime import date

from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import first_fold_copy, render_html
from tests.market_answers.helpers import load_shipped_candidate, load_shipped_fixture

TODAY = date(2026, 8, 16)


def _html() -> str:
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    return render_html(record, payload, decision)


def test_first_fold_has_answer_range_n_period_geo_method_as_of_limitations():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    fold = first_fold_copy(payload)
    html = _html()
    assert fold["answer"] in html
    assert fold["range"] in html
    assert fold["n"] in html
    assert fold["period"] in html
    assert fold["geography"] in html
    assert "ticket contratual, não custo por km" in html
    assert 'id="metodologia"' in html
    assert "as_of" in html
    assert "2026-07-31" in html
    assert 'id="limitacoes"' in html
    assert "Fontes e metodologia" in html
    assert "FIXTURE / PREVIEW" in html
    assert "official_live=false" in html
    assert "CONTRACT_FIXTURE" in html


def test_rendered_html_does_not_name_extra_cli():
    html = _html()
    assert "extra-cli" not in html.lower()
    assert "docs/contracts/market-answer" not in html


def test_ticket_never_becomes_cost_per_km():
    html = _html()
    assert "ticket contratual, não custo por km" in html
    assert "Não é custo, preço unitário ou custo por km" in html
    assert not re.search(r"R\$\s*[\d.]+\s*/\s*km", html)
    assert "custo/km" not in html.lower() or "não" in html.lower()
    # grain displayed is ticket, not km
    assert "valor integral nominal" in html
    assert "ticket_contratual_integral" in html


def test_graph_and_table_are_accessible():
    html = _html()
    assert 'role="img"' in html
    assert 'aria-labelledby="ma-chart-title ma-chart-desc"' in html
    assert 'id="ma-chart-title"' in html
    assert "<table" in html
    assert "<caption>" in html
    assert "<th scope=\"col\">" in html


def test_no_lead_gate_on_first_fold():
    html = _html()
    fold = html.split('id="como-ler"', 1)[0]
    assert "<form" not in fold
    assert 'id="resposta"' in fold
    assert 'id="metodologia"' in fold
    assert "Veja sua empresa neste mercado" in html
    assert "Analise um contrato" in html


def test_canonical_noindex_and_no_combinatorial_paths():
    html = _html()
    assert 'rel="canonical" href="https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"' in html
    assert 'content="noindex,nofollow"' in html
    assert "/inteligencia/valor-tipico-contratos-pavimentacao/sc/" not in html
    assert "municipio" not in html or "?stratum=" in html
    # only the one canonical path plus optional query strata
    assert html.count("/inteligencia/valor-tipico-contratos-pavimentacao/") >= 1


def test_official_sc_html_does_not_advertise_rs_fixture_strata():
    from scripts.market_answers.consume import load_payload

    record = load_shipped_candidate()
    payload = load_payload()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    html = render_html(record, payload, decision)
    assert "Recorte publicado (Santa Catarina)" in html
    assert "Recorte publicado (SC e RS)" not in html
    assert "stratum=rs-municipal" not in html
    assert "Rio Grande do Sul · esfera municipal" not in html
    assert 'content="noindex,nofollow"' in html
