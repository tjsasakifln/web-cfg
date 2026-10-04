import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"


def test_home_is_institutional_and_does_not_use_pncp_as_client_proof():
    html = HOME.read_text(encoding="utf-8")

    assert "Exemplo ilustrativo" not in html
    assert "Ordem de serviço altera escopo sem termo" not in html
    assert 'id="mercado-pncp"' not in html
    assert "R$ 179.737,67" not in html
    assert "R$ 719.177,48" not in html
    assert "R$ 18.293.629,80" not in html
    assert "pncp.gov.br/app/contratos/" not in html
    assert "<dt>1% do valor</dt>" not in html
    assert 'id="competencias"' in html
    assert 'href="/projetos/"' in html
    assert 'href="/servicos/"' in html
    assert not re.search(
        r"clientes? da CONFENGE|nossos clientes|cases? de cliente", html, re.I
    )


def test_home_has_accessible_institutional_paths_instead_of_market_selector():
    html = HOME.read_text(encoding="utf-8")
    journeys = re.search(
        r'<section[^>]+id="competencias"[\s\S]*?</section>',
        html,
    )
    assert journeys
    assert journeys.group(0).count("<article") >= 3
    for href in ("/projetos/estruturas/", "/projetos/instalacoes/", "/projetos/infraestrutura/"):
        assert f'href="{href}"' in journeys.group(0), href
    assert 'role="tab"' not in journeys.group(0)
    assert 'role="tabpanel"' not in journeys.group(0)
    assert "autoplay" not in journeys.group(0).lower()


def test_home_omits_retired_market_provenance_without_client_claim():
    html = HOME.read_text(encoding="utf-8")

    assert "pncp.gov.br/app/contratos/01258036000132/2026/7" not in html
    assert "pncp.gov.br/app/contratos/14862788000150/2026/69" not in html
    assert "pncp.gov.br/app/contratos/81648859000103/2026/45" not in html
    assert "pncp.gov.br/api/pncp/" not in html
    assert "Fonte: PNCP" not in html
    assert not re.search(
        r"clientes? da CONFENGE|nossos clientes|cases? de cliente", html, re.I
    )


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
    primary = re.search(r'<a\b[^>]*class="[^"]*button-primary[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', hero)
    assert primary
    href = primary.group(1)
    if href.startswith("#"):
        assert f'id="{href[1:]}"' in html
    else:
        assert href == "/triagem-tecnica/"
        assert (HOME.parent / "triagem-tecnica/index.html").is_file()
    assert re.search(r"proposta|servi[çc]o|situa[çc][aã]o|necessidade|projeto|escopo", primary.group(2), re.I)
