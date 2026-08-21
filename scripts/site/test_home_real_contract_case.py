import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"


def test_home_replaces_generic_matrix_with_real_public_contract():
    html = HOME.read_text(encoding="utf-8")

    assert "Exemplo ilustrativo" not in html
    assert "Ordem de serviço altera escopo sem termo" not in html
    assert "Contrato real · PNCP" in html
    assert "R$ 18.293.629,80" in html
    assert "900 dias" in html
    assert "R$ 182,9 mil dependem de prova" in html


def test_home_contract_case_has_provenance_and_no_client_claim():
    html = HOME.read_text(encoding="utf-8")

    assert "pncp.gov.br/app/contratos/81648859000103/2026/45" in html
    assert "pncp.gov.br/api/pncp/" not in html
    assert "Amostra verificada em 20/08/2026" in html
    assert "não são cases de clientes" in html
    assert "nem indicam problema nesses contratos" in html


def test_home_contract_case_keeps_one_primary_hero_cta():
    html = HOME.read_text(encoding="utf-8")
    hero_match = re.search(r'<section[^>]+class="hero[^>]*>[\s\S]*?</section>', html)

    assert hero_match
    hero = hero_match.group(0)
    assert hero.count("button-primary") == 1
    assert 'data-event-name="diagnostic_cta_click"' in hero
    assert "hero-real-proof" in hero
