"""Fail-closed contract for the MV-04 corporate home and services candidate."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"
SERVICES = ROOT / "servicos" / "index.html"
# 2026-09-07 (#611/A02). O hash e detector de mudanca nao revisada, nao
# proibicao de mudar: a revisao desta vez abriu o formulario para as situacoes
# que ele recusava (projeto, quantitativos, obra e imovel, pericia, seguranca
# do trabalho, orgao publico). As invariantes estruturais abaixo continuam
# valendo sem alteracao: 23 controles, 3 obrigatorios, action /obrigado, sem
# upload. O que mudou foram opcoes e copy, e as assercoes semanticas novas
# dizem o que a mudanca tinha de preservar.
CAPTURE_FORM_SHA256 = "b3ebea7ad555cac7d459e4cf83186393f3630e4a49d8b6e265480a4e01cb0b15"


def _home() -> str:
    return HOME.read_text(encoding="utf-8")


def _section(html: str, marker: str) -> str:
    match = re.search(
        rf'<section\b[^>]*{marker}[^>]*>[\s\S]*?</section>',
        html,
        re.IGNORECASE,
    )
    assert match, f"missing section marked by {marker!r}"
    return match.group(0)


def test_first_fold_answers_category_problem_result_trust_and_start() -> None:
    hero = _section(_home(), r'class="hero')

    assert "Engenharia, Perícias e Inteligência Técnica" in hero
    assert "Do problema técnico" in hero
    assert "à decisão documentada" in hero
    assert "projetos, imóveis, obras, perícias, segurança do trabalho ou contratos públicos" in hero
    for deliverable in ("projeto", "orçamento", "laudo", "parecer", "plano de ação"):
        assert deliverable in hero
    assert "Engenharia Civil pela EESC-USP" in hero
    assert "CNPJ 52.407.089/0001-09" in hero
    assert 'href="#situacoes"' in hero
    assert hero.count("button-primary") == 1
    assert "PNCP" not in hero


def test_situation_chooser_has_five_paths_without_catalog_wall() -> None:
    chooser = _section(_home(), r'id="situacoes"')
    expected = (
        "Projetar, revisar, orçar ou compatibilizar",
        "Inspecionar, diagnosticar ou documentar obra e imóvel",
        "Perícia, assistência técnica ou avaliação",
        "Segurança do trabalho",
        "Licitação ou contrato de obra pública",
    )
    for label in expected:
        assert label in chooser
    assert chooser.count('class="situation-row') == 5
    assert 'href="/quantitativos-orcamento-obras/"' in chooser
    assert chooser.count('href="/triagem-tecnica/#') == 3
    assert 'href="/servicos-obras-publicas/"' in chooser
    assert "ICP" not in chooser
    assert "CTA" not in chooser


def test_pncp_proof_is_confined_to_the_b2g_vertical() -> None:
    html = _home()
    hero = _section(html, r'class="hero')
    b2g = _section(html, r'id="obras-publicas"')

    assert "PNCP" not in hero
    assert "54.055" not in hero
    assert "4,48 mi" not in hero
    assert "PNCP · 01/08/2026" in b2g
    assert "54.055" in b2g
    assert "4,48 mi" in b2g
    assert 'href="/servicos-obras-publicas/"' in b2g
    assert html.index('id="situacoes"') < html.index('id="obras-publicas"')


def test_corporate_triage_is_safe_and_capture_form_is_reviewed() -> None:
    html = _home()
    triage = _section(html, r'id="triagem-tecnica"')
    form = re.search(r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html)
    assert form

    assert "mailto:tiago.sasaki@confenge.com.br" in triage
    assert "wa.me/5548988344559" in triage
    assert "Não envie documentos sensíveis" in triage
    assert 'type="file"' not in html.lower()
    body = form.group(0)
    # Invariantes estruturais primeiro: elas dizem o que a trava existe para
    # proteger. O hash vem depois, como deteccao de qualquer mudanca nao
    # revisada -- inclusive de copy.
    assert re.findall(r'<form[^>]*action="([^"]*)"', body) == ["/obrigado"]
    assert 'method="POST"' in body and 'name="diagnostico-b2g"' in body
    controls = sorted(re.findall(r'<(?:input|select|textarea)\b[^>]*name="([^"]+)"', body))
    assert len(controls) == 23, controls
    required = sorted(re.findall(r'<(?:input|select|textarea)\b[^>]*name="([^"]+)"[^>]*required', body))
    assert len(required) == 3, required
    assert 'type="file"' not in body.lower()
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    assert digest == CAPTURE_FORM_SHA256
    assert 'name="diagnostico-b2g"' in form.group(0)
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in form.group(0)


def test_capture_form_expresses_every_situation_without_a_b2g_default() -> None:
    """#611 (A02). O select so aceitava contrato publico; quem chegava com
    projeto, quantitativos, obra, imovel, pericia, seguranca do trabalho ou do
    lado do orgao publico tinha apenas "Outro" -- e "Outro" caia na jornada
    B2G. As oito situacoes precisam estar dizíveis, e nenhuma situacao fora de
    obra publica pode carregar uma jornada de obra publica."""
    html = _home()
    select = re.search(r'<select\b[^>]*id="estagio"[\s\S]*?</select>', html)
    assert select, "estagio select missing"
    block = select.group(0)

    eight_situations = (
        "projeto, revisão ou compatibilização",
        "quantitativos ou orçamento",
        "obra ou imóvel para inspecionar ou documentar",
        "perícia, assistência técnica ou avaliação",
        "segurança do trabalho",
        "problema urgente em contrato",
        "planejamento de órgão público",
        "outro",
    )
    for value in eight_situations:
        assert f'value="{value}"' in block, value

    public_works = {
        "problema urgente em contrato": "contrato",
        "edital ou proposta em análise": "edital",
        "estruturando a operação no mercado público": "operacao",
        "escolhendo oportunidades": "operacao",
        "contrato em execução": "contrato",
    }
    options = re.findall(r'<option\b[^>]*value="([^"]*)"[^>]*data-journey="([^"]*)"', block)
    assert len(options) >= 12, options
    journeys = dict(options)
    for value, journey in public_works.items():
        assert journeys[value] == journey, (value, journeys.get(value))
    for value, journey in journeys.items():
        if value in public_works:
            continue
        assert journey not in {"contrato", "edital", "operacao"}, (value, journey)
    assert journeys["projeto, revisão ou compatibilização"] != journeys["quantitativos ou orçamento"]

    # A qualificacao de preco de obra publica tem de ser um bloco separavel,
    # senao nao ha como esconde-la de quem nao escolheu obra publica.
    form = re.search(r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html)
    ladder = re.search(
        r'<div\b[^>]*data-b2g-qualification[^>]*>[\s\S]*?data-offer-fit-hint[\s\S]*?</p>',
        form.group(0),
    )
    assert ladder, "public-works qualification block is not delimited"
    for field in ("faixa_contrato", "risco_em_jogo", "frequencia", "maturidade_documental", "capacidade_interna"):
        assert f'name="{field}"' in ladder.group(0), field
    for hook in ("data-situation-next", "data-situation-channels", "data-situation-route", "data-situation-whatsapp"):
        assert hook in form.group(0), hook


def test_services_hub_is_corporate_indexable_and_price_free() -> None:
    html = SERVICES.read_text(encoding="utf-8")
    assert 'content="index,follow" name="robots"' in html
    assert 'href="https://confenge.com.br/servicos/" rel="canonical"' in html
    assert "Serviços organizados por situação" in html
    assert html.count('class="corporate-service-row') == 5
    assert "/servicos-obras-publicas/" in html
    assert not re.search(r"R\$\s*\d", html)
    assert "campanha" not in html.lower()
    assert "família pública" not in html.lower()


if __name__ == "__main__":
    raise SystemExit(__import__("pytest").main([__file__, "-q"]))
