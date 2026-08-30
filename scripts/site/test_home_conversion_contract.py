"""Fail-closed contract for the home decision path."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"


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


def test_first_fold_answers_the_four_skeptical_questions() -> None:
    html = _home()
    hero = _section(html, r'class="hero')

    assert "Consultoria para licitações e contratos de obras públicas" in hero
    assert "Para construtoras:" in hero
    assert "decidir se o edital merece o capital" in hero
    assert "precificar o risco" in hero
    assert "proteger a margem" in hero
    assert "Engenharia Civil pela EESC-USP" in hero
    assert "Iniciativa privada e Administração Pública" in hero
    assert "Ver exemplo demonstrativo de relatório" in hero
    assert 'href="#formulario-contato"' in hero
    assert hero.count("button-primary") == 1


def test_pncp_is_market_context_after_decision_and_capture() -> None:
    html = _home()
    hero = _section(html, r'class="hero')
    market = _section(html, r'id="mercado-pncp"')

    assert "PNCP" not in hero
    assert "1%" not in hero
    assert html.index('id="jornadas"') < html.index('id="formulario-contato"')
    assert html.index('id="formulario-contato"') < html.index('id="mercado-pncp"')
    assert "Contexto de mercado · PNCP" in market
    assert "não são clientes da CONFENGE" in market
    assert "Não provam resultado da CONFENGE" in market
    assert 'data-event-name="proof_expand"' not in market
    assert 'data-cta-position="hero_proof"' not in market
    assert market.count('data-event-name="evidence_drilldown"') == 3
    assert market.count('data-cta-position="market_context"') == 6


def test_three_icp_doors_lead_to_one_honest_intake() -> None:
    html = _home()

    for door in ("Edital ou proposta crítica", "Contrato sob pressão", "Operação recorrente"):
        assert door in html
    assert html.count('name="diagnostico-b2g"') == 1
    assert html.index('id="jornadas"') < html.index('id="contato"') < html.index('id="ofertas"')
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in html
    assert 'id="canal_seguro"' in html
    assert 'type="file"' not in html.lower()
    assert "O site não recebe arquivo" in html
    assert "enviar documentos para análise" not in html.lower()
    contract_door = re.search(
        r'<li\b[^>]*id="jornada-contrato"[^>]*>[\s\S]*?</li>', html, re.IGNORECASE
    )
    assert contract_door
    assert "Documentos sensíveis:" in contract_door.group(0)
    assert "solicite o canal seguro no formulário logo abaixo" in contract_door.group(0)
    assert 'aria-describedby="contrato-canal-seguro"' in contract_door.group(0)
    cta_texts = [
        re.sub(r"<[^>]+>", " ", cta).lower()
        for cta in re.findall(r"<(?:a|button)\b[^>]*>[\s\S]*?</(?:a|button)>", html)
    ]
    assert not any(
        re.search(r"\b(?:enviar|anexar)\b.*\b(?:edital|documento|arquivo)\b", text)
        for text in cta_texts
    ), "CTA must not imply an upload that the intake does not provide"


if __name__ == "__main__":
    raise SystemExit(__import__("pytest").main([__file__, "-q"]))
