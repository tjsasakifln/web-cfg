"""Rendered first fold and accessibility come from the shipped renderer."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse
from datetime import date

from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import first_fold_copy, render_html
from tests.market_answers.helpers import load_shipped_candidate, load_shipped_fixture

TODAY = date(2026, 8, 17)


def test_primary_market_contact_does_not_loop_between_anchors():
    class Links(HTMLParser):
        links = []
        def handle_starttag(self, tag, attrs):
            row = dict(attrs)
            if tag == "a" and row.get("data-cta-id") == "veja-sua-empresa":
                self.links.append(row["href"])
    parser = Links()
    parser.feed(_html())
    assert len(parser.links) == 1
    for href in parser.links:
        url = urlparse(href)
        assert url.hostname == "wa.me"
        assert url.path == "/5548988344559"
        message = parse_qs(url.query)["text"][0]
        assert "pavimentação" in message
        assert "/inteligencia/valor-tipico-contratos-pavimentacao/" in message


def _html() -> str:
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    return render_html(record, payload, decision)


def test_first_fold_has_answer_range_n_period_geo_method_date_limitations():
    record = load_shipped_candidate()
    payload = load_shipped_fixture()
    fold = first_fold_copy(payload)
    html = _html()
    assert fold["answer"] in html
    assert fold["range"] in html
    assert fold["n"] in html
    assert fold["period"] in html
    assert fold["geography"] in html
    assert "não custo por km" in html.lower()
    assert 'id="metodologia"' in html
    assert "Dados atualizados em" in html
    assert "source_as_of" not in html
    assert "max_age_hours" not in html
    assert "2026-07-31" in html
    assert "Retrato histórico dos dados consultados em 31/07/2026" in html
    assert "não representa uma atualização em tempo real" in html
    assert "idade máxima para publicação" not in html
    assert "vale até" not in html
    assert 'id="limitacoes"' in html
    assert "Fontes e metodologia" in html
    assert "Demonstração sem dados oficiais" in html
    assert "não devem ser usados como referência de mercado" in html


def test_rendered_html_does_not_name_extra_cli():
    html = _html()
    assert "extra-cli" not in html.lower()
    assert "docs/contracts/market-answer" not in html


def test_ticket_never_becomes_cost_per_km():
    html = _html()
    assert "não custo por km" in html.lower()
    assert "Não é custo, preço unitário ou custo por km" in html
    assert not re.search(r"R\$\s*[\d.]+\s*/\s*km", html)
    assert "custo/km" not in html.lower() or "não" in html.lower()
    # grain displayed is ticket, not km
    assert "valor integral nominal" in html
    assert "em reais (BRL)" in html
    assert "ticket_contratual_integral" not in html


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
    assert html.count('data-ma-cta-block="1"') == 1
    assert "Aplicar o recorte à sua necessidade" in html
    assert "Analise um contrato" in html


def test_renderer_does_not_claim_a_dead_capture_form():
    html = _html()
    assert 'id="ma-next"' not in html
    assert 'id="ma-correlation"' not in html
    assert 'action="/.netlify/functions/lead"' not in html


def test_canonical_noindex_and_no_combinatorial_paths():
    html = _html()
    assert 'rel="canonical" href="https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"' in html
    assert 'content="noindex,nofollow"' in html
    assert "/inteligencia/valor-tipico-contratos-pavimentacao/sc/" not in html
    assert "municipio" not in html or "?stratum=" in html
    # only the one canonical path plus optional query strata
    assert html.count("/inteligencia/valor-tipico-contratos-pavimentacao/") >= 1


def test_public_explanation_keeps_controls_but_not_publication_internals():
    from scripts.market_answers.consume import load_payload

    record = load_shipped_candidate()
    payload = load_payload()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    html = render_html(record, payload, decision)
    assert 'content="noindex,nofollow"' in html
    assert "A comparação disponível nesta página é o recorte estadual publicado" in html
    assert "não identifica contratos individuais para consulta nesta página" in html
    assert "extensão não medida neste conjunto de dados" in html
    assert "?stratum=" not in html, "a query que não altera o resultado não pode ser CTA"
    for internal_copy in (
        "· noindex,nofollow</p>",
        "filtro noindex",
        "neste grain",
        "Drill-down:",
        "contratos/evidence",
        "X-Ray/CTA",
        "não autorizados no payload",
        "análise técnica #83",
        "ainda não publicada nesta superfície",
        "tipologia keyword",
        "outlier",
        "ticket contratual",
    ):
        assert internal_copy not in html


def test_official_page_omits_empty_distribution_visualization():
    from scripts.market_answers.consume import load_payload

    record = load_shipped_candidate()
    payload = load_payload()
    decision = evaluate(record, payload, {"approvals": []}, today=TODAY)
    html = render_html(record, payload, decision)
    assert payload.get("distribution", {}).get("rows") in (None, [])
    assert 'class="ma-chart-wrap"' not in html
    assert "<table" not in html
    assert "<tbody></tbody>" not in html
    assert "As barras do gráfico repetem a tabela" not in html
    assert "Faixa interquartil:" in html
    assert "Retrato histórico dos dados consultados em 17/08/2026" in html
    assert "idade máxima para publicação" not in html
    assert "vale até" not in html


def test_distribution_explanation_is_rendered_only_with_real_rows():
    html = _html()
    assert 'class="ma-chart-wrap"' in html
    assert "As barras do gráfico repetem a tabela" in html
    assert "Faixas de valores integrais dos contratos" in html


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
