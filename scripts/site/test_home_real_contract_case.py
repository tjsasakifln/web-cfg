import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"


def test_home_replaces_generic_matrix_with_real_public_contract():
    html = HOME.read_text(encoding="utf-8")

    assert "Exemplo ilustrativo" not in html
    assert "Ordem de serviço altera escopo sem termo" not in html
    assert "Contratos reais, diferentes portes" in html
    assert "R$ 179.737,67" in html
    assert "R$ 719.177,48" in html
    assert "R$ 18.293.629,80" in html
    assert "R$ 1.797,38" in html
    assert "R$ 7.191,77" in html
    assert "R$ 182.936,30" in html
    assert "180 dias" in html
    assert "365 dias" in html
    assert "900 dias" in html
    assert "contexto de mercado" in html.lower()
    assert "Qual deles se parece mais com o seu?" not in html
    assert "<dt>1% do valor</dt>" not in html
    assert html.count("data-economics-illustration") == 3
    assert html.count("Conta ilustrativa, não é economia observada") == 3
    for needle in ("Custo publicado", "Recorrência da diretoria", "Limite:"):
        assert html.count(needle) == 3, needle
    assert "risco de caixa ou margem" in html
    assert "não é economicamente indicada" in html


def test_home_contract_profiles_are_manual_and_accessible():
    html = HOME.read_text(encoding="utf-8")
    selector_match = re.search(r'<aside[^>]+data-evidence-selector[\s\S]*?</aside>', html)

    assert selector_match
    selector = selector_match.group(0)
    assert selector.count('role="tab"') == 3
    assert selector.count('role="tabpanel"') == 3
    assert 'data-event-name="evidence_drilldown"' not in selector
    assert 'data-event-name="proof_expand"' not in selector
    assert 'data-cta-position="market_context"' not in selector
    assert 'data-cta-position="hero_proof"' not in selector
    assert selector.count('aria-selected="true"') == 1
    assert selector.count('aria-selected="false"') == 2
    assert ' hidden' not in selector
    assert "autoplay" not in selector.lower()
    assert "aria-live" not in selector.lower()


def test_home_contract_case_has_provenance_and_no_client_claim():
    html = HOME.read_text(encoding="utf-8")

    assert "pncp.gov.br/app/contratos/01258036000132/2026/7" in html
    assert "pncp.gov.br/app/contratos/14862788000150/2026/69" in html
    assert "pncp.gov.br/app/contratos/81648859000103/2026/45" in html
    assert "pncp.gov.br/api/pncp/" not in html
    # 2026-08-30 (overhaul value-first). Este gate exigia que a home escrevesse
    # "nao sao clientes da CONFENGE" e "nao indicam falha nos contratos", isto
    # e, obrigava a pagina a desautorizar a propria empresa para provar que nao
    # estava passando registro do PNCP por prova de cliente. A propriedade real
    # continua protegida, agora pela via correta: procedencia visivel (fonte e
    # data de corte) e rotulo explicito de contexto de mercado.
    assert "Fonte: PNCP" in html
    assert "21/08/2026" in html
    assert "contexto de mercado" in html.lower()
    assert "Contexto de mercado." in html
    offers_at = html.find('data-section-archetype="offer_dominant"')
    pncp_at = html.find("data-evidence-selector")
    assert 0 < offers_at < pncp_at


def test_home_contract_case_keeps_one_primary_hero_cta():
    html = HOME.read_text(encoding="utf-8")
    hero_match = re.search(r'<section[^>]+class="hero[^>]*>[\s\S]*?</section>', html)

    assert hero_match
    hero = hero_match.group(0)
    assert hero.count("button-primary") == 1
    # 2026-08-30: o CTA de entrada emite `cta_click`, o nome canonico do
    # registro de eventos. `diagnostic_cta_click` era um alias que colapsava
    # para o mesmo evento e vinha acompanhado de um data-journey fixo em
    # "operacao", que classificava errado todo visitante do botao generico.
    assert 'data-event-name="cta_click"' in hero
    assert 'data-journey=' not in hero
    assert "data-evidence-selector" not in hero
    assert "Prefiro WhatsApp" not in hero
    assert "Analisar meu contrato" not in hero
    assert "Registrar situação para triagem" in hero
