"""Fail-closed contract for the home decision path.

Revisao 2026-08-30 (overhaul value-first). O contrato anterior congelava tres
decisoes de produto que passaram a trabalhar contra a conversao:

1. exigia o formulario ANTES das entregas e da prova (#jornadas < #contato <
   #ofertas). A ordem agora e valor, situacao, entrega, metodo, evidencia,
   autoridade, adequacao e so entao o pedido comercial;
2. exigia literalmente "nao sao clientes da CONFENGE" e "Nao provam resultado
   da CONFENGE" na secao de mercado, isto e, obrigava a home a desautorizar a
   propria empresa. A honestidade da secao passa a ser provada por procedencia
   (fonte PNCP + data de corte), que informa sem se autodesqualificar;
3. exigia "O site nao recebe arquivo". A mesma verdade e afirmada como conduta
   positiva: o canal seguro e aberto apos o contato. As garantias estruturais
   que realmente importam continuam aqui: nenhum type="file" e nenhum CTA que
   prometa upload.

O que este contrato protege nao mudou: primeira dobra completa, captura unica,
procedencia visivel no mercado e ausencia de promessa de upload.
"""

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
    # A primeira dobra precisa dizer o que o visitante recebe, nao so o que doi.
    assert "relatório, matriz de risco e memória de cálculo" in hero
    assert 'href="#formulario-contato"' in hero
    assert hero.count("button-primary") == 1


def test_pncp_is_market_context_after_decision_and_capture() -> None:
    html = _home()
    hero = _section(html, r'class="hero')
    market = _section(html, r'id="mercado-pncp"')

    assert "PNCP" not in hero
    assert "1%" not in hero
    # Valor e evidencia precedem o pedido comercial.
    assert html.index('id="jornadas"') < html.index('id="mercado-pncp"')
    assert html.index('id="mercado-pncp"') < html.index('id="formulario-contato"')
    assert "Contexto de mercado · PNCP" in market
    # Procedencia no lugar de autodesqualificacao: fonte, data de corte e papel.
    assert "Fonte: PNCP" in market
    assert "21/08/2026" in market
    assert "Contexto de mercado." in market
    assert 'data-event-name="proof_expand"' not in market
    assert 'data-cta-position="hero_proof"' not in market
    assert market.count('data-event-name="evidence_drilldown"') == 3
    assert market.count('data-cta-position="market_context"') == 6


def test_three_icp_doors_lead_to_one_honest_intake() -> None:
    html = _home()

    # Taxonomia canonica unica: os mesmos tres rotulos no menu, na home, no
    # rodape e no formulario. Nada de vocabulario concorrente.
    for door in ("Edital e proposta", "Contrato sob pressão", "Operação recorrente"):
        assert door in html
    assert html.count('name="diagnostico-b2g"') == 1
    assert html.index('id="jornadas"') < html.index('id="ofertas"') < html.index('id="contato"')
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in html
    assert 'id="canal_seguro"' in html
    assert 'type="file"' not in html.lower()
    # A verdade permanece, agora como conduta positiva.
    assert "canal seguro" in html.lower()
    assert "enviar documentos para análise" not in html.lower()
    contract_door = re.search(
        r'<li\b[^>]*id="jornada-contrato"[^>]*>[\s\S]*?</li>', html, re.IGNORECASE
    )
    assert contract_door
    assert "Documentos sensíveis:" in contract_door.group(0)
    assert "abre um canal seguro para o envio da documentação" in contract_door.group(0)
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
