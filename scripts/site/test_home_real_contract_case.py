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
    assert "Qual deles se parece mais com o seu?" in html
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
    assert selector.count('data-event-name="proof_expand"') == 3
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
    assert "Dados consultados em 21/08/2026" in html
    assert "não são clientes da CONFENGE" in html
    assert "não indicam falha nos contratos" in html


def test_home_contract_case_keeps_one_primary_hero_cta():
    html = HOME.read_text(encoding="utf-8")
    hero_match = re.search(r'<section[^>]+class="hero[^>]*>[\s\S]*?</section>', html)

    assert hero_match
    hero = hero_match.group(0)
    assert hero.count("button-primary") == 1
    assert 'data-event-name="diagnostic_cta_click"' in hero
    assert "hero-real-proof" in hero
    assert hero.count('data-set-journey="contrato"') == 3
    assert hero.count("Prefiro WhatsApp") == 3
    assert "home-proof-local-whatsapp" in hero
    assert "home-proof-regional-whatsapp" in hero
    assert "home-proof-strategic-whatsapp" in hero
    assert "Analisar meu contrato" in hero
