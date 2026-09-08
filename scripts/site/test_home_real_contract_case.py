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
    assert "contexto de mercado" in html.lower()
    assert "Qual deles se parece mais com o seu?" not in html
    assert "<dt>1% do valor</dt>" not in html
    assert html.count("data-economics-illustration") == 3
    # 2026-09-08. Este bloco exigia as frases literais "Conta ilustrativa, nao
    # e economia observada", "Custo publicado", "Recorrencia da diretoria" e
    # "Limite:" tres vezes cada. Nao eram propriedades: eram travas de redacao,
    # e eram elas que mantinham no ar um paragrafo ilegivel. A propriedade real
    # e outra e continua verificada abaixo: cada paragrafo de ilustracao diz
    # que a conta nao e economia medida e cita as faixas de preco publicadas.
    illustrations = re.findall(
        r'<p[^>]*data-economics-illustration="1"[^>]*>(.*?)</p>', html, re.S
    )
    assert len(illustrations) == 3
    for text in illustrations:
        assert re.search(r"ilustrativ", text, re.I), text
        assert re.search(r"n[ãa]o é economia medida", text, re.I), text
        assert "R$ 6.900 a R$ 7.900" in text, text
        assert "R$ 12.500 a R$ 20.000 por mês" in text, text
    # A desqualificação por porte foi revogada em 2026-09-06. A home pode dizer
    # QUAL formato serve; não pode dizer que o visitante não merece atendimento.
    # Asserção negativa: o defeito não pode voltar por edição de copy.
    assert "não é economicamente indicada" not in html
    assert "neste porte" not in html


def test_home_contract_profiles_are_manual_and_accessible():
    html = HOME.read_text(encoding="utf-8")
    selector_match = re.search(r'<div[^>]+id="mercado-pncp"[\s\S]*?</div>\s*</div>', html)

    assert selector_match
    selector = selector_match.group(0)
    assert selector.count('class="service-card"') == 3
    assert selector.count('data-economics-illustration="1"') == 3
    assert selector.count('rel="noopener"') == 3
    assert 'role="tab"' not in selector
    assert 'role="tabpanel"' not in selector
    assert 'data-event-name="proof_expand"' not in selector
    assert 'data-cta-position="hero_proof"' not in selector
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
    pncp_at = html.find('id="mercado-pncp"')
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
    assert "Escolher minha situação" in hero
