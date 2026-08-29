"""Substantive contract for the single #127 rain-delay rewrite canary."""

from __future__ import annotations

import json
import re
import sys
from html import unescape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.cluster_prazo import OWNERSHIP, parse_page  # noqa: E402


ROUTE = "/conteudos/chuva-prorrogacao-prazo-obra-publica/"
PAGE = ROOT / ROUTE.strip("/") / "index.html"


def _html() -> str:
    return PAGE.read_text(encoding="utf-8")


def _visible(html: str) -> str:
    body = re.sub(r"<script\b[\s\S]*?</script>", " ", html, flags=re.I)
    body = re.sub(r"<style\b[\s\S]*?</style>", " ", body, flags=re.I)
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", body))).strip()


def _walk(node: object):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def test_page_owns_only_climate_event_qualification_and_hands_off_next_decisions():
    html = _html()
    assert OWNERSHIP[ROUTE]["decision_id"] == "qualificar-evento-climatico"
    assert "quando a ocorrência pluviométrica deixa de ser mero risco ordinário" in html
    assert "Ela não monta o requerimento" in html
    for href in (
        "/conteudos/prorrogacao-prazo-obra-publica-documentos/",
        "/conteudos/atraso-obra-culpa-administracao/",
        "/conteudos/resposta-notificacao-atraso-obra-publica/",
        "/lei-14133-obras/atraso-imputavel-administracao/",
    ):
        assert f'href="{href}"' in html


def test_direct_answer_and_three_layers_do_not_collapse_weather_into_entitlement():
    html = _html()
    answer = re.search(r'<div class="answer-box"[\s\S]*?</div>', html)
    assert answer
    assert "não prova nexo nem direito a prorrogação" in answer.group(0)
    layers = re.search(r'<section id="camadas">[\s\S]*?</section>', html)
    assert layers
    for label in (
        "Chuva ordinária",
        "Excepcionalidade estatística ou operacional",
        "Impacto real no prazo",
    ):
        assert label in layers.group(0)
    assert "Dias com precipitação e dias de prazo não são grandezas equivalentes" in html


def test_reproducible_matrix_has_every_required_axis_and_unknown_stop_rule():
    html = _html()
    matrix = re.search(r'<section id="matriz">[\s\S]*?</section>', html)
    assert matrix
    block = matrix.group(0)
    for heading in (
        "Evento observado",
        "Referência histórica ou oficial",
        "Atividade afetada",
        "Caminho crítico",
        "Registro contemporâneo",
        "Mitigação",
        "Dias efetivamente impactados",
    ):
        assert f'>{heading}<' in block
    assert "<caption>" in block
    assert block.count('scope="col"') == 7
    assert "UNKNOWN" in block
    assert 'role="group"' in block
    assert 'tabindex="0"' in block
    assert 'aria-label="Matriz de qualificação do impacto pluviométrico;' in block


def test_numeric_example_is_synthetic_reproducible_and_does_not_fake_contract_days():
    html = _html()
    example = re.search(r'<section id="exemplo-tecnico">[\s\S]*?</section>', html)
    assert example
    block = _visible(example.group(0))
    for token in (
        "Exemplo inteiramente sintético",
        "8 horas por turno",
        "horas críticas residuais = horas impedidas",
        "(3 turnos × 8 h/turno) − (1 × 8 h/turno) − 0 h − 0 h",
        "16 horas críticas residuais",
        "dias efetivamente impactados = UNKNOWN",
    ):
        assert token in block
    assert "não autoriza escrever “dois dias de prorrogação”" in block


def test_primary_sources_have_access_date_and_case_specific_limits():
    html = _html()
    sources = re.search(r'<section class="sources-section" id="fontes">[\s\S]*?</section>', html)
    assert sources
    block = sources.group(0)
    for href in (
        "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm",
        "https://licitacoesecontratos.tcu.gov.br/4-5-5-matriz-de-riscos/",
        "https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/639/2006/Plen%C3%A1rio",
        "https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/3077/2010/Plen%C3%A1rio",
        "https://portal.inmet.gov.br/normais",
        "https://portal.inmet.gov.br/servicos/bdmep-dados-historicos",
    ):
        assert f'href="{href}"' in block
    assert block.count("Consulta: 29/08/2026") >= 6
    assert block.count("Limite:") >= 6
    assert "não uma estação ou série específica" in block


def test_faq_schema_is_parseable_and_exactly_matches_visible_copy():
    html = _html()
    visible = _visible(html)
    raw_blocks = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.S
    )
    assert len(raw_blocks) == 1
    graph = json.loads(raw_blocks[0])
    questions = [node for node in _walk(graph) if node.get("@type") == "Question"]
    assert len(questions) == 3
    for question in questions:
        name = question["name"]
        answer = question["acceptedAnswer"]["text"]
        assert name in visible
        assert answer in visible


def test_authorship_and_delegated_review_provenance_are_explicit_not_human_washed():
    html = _html()
    assert '<meta content="Biblioteca técnica CONFENGE" name="author"' in html
    assert "Autoria editorial:</strong> Biblioteca técnica CONFENGE" in html
    assert "Autoridade de decisão:</strong> Tiago Sasaki" in html
    assert "executadas pelo agente da campanha sob delegação expressa de Tiago Sasaki" in html
    assert "Não houve revisão humana manual nem segundo revisor independente" in html
    assert "Autor e responsável técnico pelo conteúdo" not in html


def test_copy_contains_limits_and_no_outcome_promise():
    visible = _visible(_html()).lower()
    forbidden = (
        "garante prorrogação",
        "garante deferimento",
        "indenização garantida",
        "ausência de sanção garantida",
        "direito automático à prorrogação",
    )
    assert not [phrase for phrase in forbidden if phrase in visible]
    for required in (
        "não é parecer jurídico nem laudo meteorológico",
        "sem promessa de prorrogação ou deferimento",
        "não define um limiar universal de chuva em milímetros",
    ):
        assert required in visible


def test_title_h1_and_description_are_unique_within_the_owned_cluster():
    page = parse_page(ROUTE)
    for other in OWNERSHIP:
        if other == ROUTE:
            continue
        peer = parse_page(other)
        assert page.title != peer.title
        assert page.h1 != peer.h1
        assert page.description != peer.description


def test_release_has_exact_canonical_and_one_sitemap_membership_only():
    html = _html()
    assert '<meta content="index,follow" name="robots"/>' in html
    assert html.count(
        '<link href="https://confenge.com.br/conteudos/chuva-prorrogacao-prazo-obra-publica/" rel="canonical"/>'
    ) == 1
    absolute = f"https://confenge.com.br{ROUTE}"
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sitemap_txt = (ROOT / "sitemap.txt").read_text(encoding="utf-8").splitlines()
    assert sitemap.count(f"<loc>{absolute}</loc>") == 1
    assert sitemap.count("<lastmod>2026-08-29</lastmod>") >= 1
    assert sitemap_txt.count(absolute) == 1
    for other in ROOT.glob("sitemap-*.xml"):
        assert absolute not in other.read_text(encoding="utf-8"), other


def test_issue_127_sisters_remain_noindex_and_out_of_every_sitemap():
    sitemap_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in [ROOT / "sitemap.xml", ROOT / "sitemap.txt", *ROOT.glob("sitemap-*.xml")]
    )
    for route in (
        "/conteudos/aditivo-qualitativo-quantitativo/",
        "/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/",
    ):
        html = (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")
        assert re.search(r'<meta content="noindex,follow" name="robots"\s*/?>', html)
        assert f"https://confenge.com.br{route}" not in sitemap_text
