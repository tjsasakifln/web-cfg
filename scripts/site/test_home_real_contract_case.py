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
    assert "contexto de mercado" in html.lower()
    assert "Qual deles se parece mais com o seu?" not in html
    assert "<dt>1% do valor</dt>" not in html
    assert html.count("data-economics-illustration") == 3
    # 2026-09-08 (segunda revisao). A versao anterior desta funcao obrigava cada
    # paragrafo de ilustracao a conter "1% deste contrato e R$ X" seguido das
    # faixas de honorario. Essa juxtaposicao ERA o defeito: comparar um
    # percentual de contrato pequeno com o preco do servico convida o visitante
    # de contrato menor a se descartar sozinho. A trava literal
    # `"neste porte" not in html` nao pegava a parafrase que estava no ar
    # ("em contratos assim o comeco costuma ser ... a ferramenta publica
    # gratuita"), que preservava a exclusao com outras palavras.
    #
    # As propriedades corretas, verificadas abaixo, sao mais fortes que as
    # travas que substituem: cada cartao diz o que o contrato coloca em jogo
    # tecnicamente, e nenhum cartao usa o porte do contrato para dizer ao
    # visitante qual formato ele merece.
    illustrations = re.findall(
        r'<p[^>]*data-economics-illustration="1"[^>]*>(.*?)</p>', html, re.S
    )
    assert len(illustrations) == 3
    for text in illustrations:
        # Substancia: o cartao explica o que o contrato mostra tecnicamente.
        assert len(re.sub(r"<[^>]+>", "", text).strip()) >= 120, text
        # Nenhum percentual de valor de contrato pareado com honorario.
        assert not re.search(r"\b1\s*%|\bum por cento\b", text, re.I), text
        assert "R$ 6.900" not in text, text
        assert "R$ 12.500" not in text, text

    # A desqualificacao por porte foi revogada em 2026-09-06 e a parafrase foi
    # removida em 2026-09-08. Asserção de classe, não de frase: a home pode
    # dizer QUAL documento resolve; nao pode usar o tamanho do contrato para
    # empurrar o visitante para fora, nem para a ferramenta gratuita.
    assert "não é economicamente indicada" not in html
    assert "neste porte" not in html
    market = re.search(
        r'<div[^>]+id="mercado-pncp"[\s\S]*?</div>\s*</div>', html
    )
    assert market
    market_text = re.sub(r"<[^>]+>", " ", market.group(0))
    for parafrase in (
        "ferramenta pública gratuita",
        "entrega de entrada",
        "não compensa",
        "fica abaixo do custo",
        "prefira nossa ferramenta",
        "contratos assim",
    ):
        assert parafrase not in market_text.lower(), parafrase
    # E precisa dizer o contrario, explicitamente.
    assert "qualquer porte" in market_text.lower()
    # 2026-09-08. Reprintar as faixas de honorario aqui colocava a home no censo
    # de rotas que publicam preco, e o gate de conversao e fail-closed: rota que
    # exibe preco tem de capturar o lead. A home nao vende essas ofertas -- ela
    # diz que o porte nao decide o formato. Entao o preco nao e escondido: ele
    # segue publicado por inteiro na pagina de cada oferta, e a home leva ate la
    # a um clique. O que se exige aqui e o caminho, nao a repeticao do valor.
    assert "preço de cada oferta está publicado na página dela" in market_text
    assert 'href="/entregas/"' in market.group(0)


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
    primary = re.search(r'<a\b[^>]*class="[^"]*button-primary[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', hero)
    assert primary
    href = primary.group(1)
    if href.startswith("#"):
        assert f'id="{href[1:]}"' in html
    else:
        assert href == "/servicos/"
        assert (HOME.parent / "servicos/index.html").is_file()
    assert re.search(r"servi[çc]o|situa[çc][aã]o|necessidade|projeto", primary.group(2), re.I)
