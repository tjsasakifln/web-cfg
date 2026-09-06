import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"

OPTION_RE = re.compile(r"<option\b[^>]*>.*?</option>", re.IGNORECASE | re.DOTALL)


def prose(html):
    """Published prose only.

    2026-09-06 (#620): the C8 ceilings count published claims, not the values a
    visitor can pick for themselves. `index.html` carries a risk-bracket
    `<select>` in the `diagnostico-b2g` form whose options include the band
    "R$ 6.900 a R$ 7.900". That option states the visitor's own exposure
    bracket; it is not the CONFENGE published cost and removing it would change
    the capture form that C9 requires preserved. So the ceilings are measured
    over the document with `<option>` elements stripped, and the positive and
    negative cases below pin exactly that boundary.
    """
    return OPTION_RE.sub(" ", html)


def test_home_replaces_generic_matrix_with_real_public_contract():
    html = HOME.read_text(encoding="utf-8")
    text = prose(html)

    assert "Exemplo ilustrativo" not in html
    assert "Ordem de serviço altera escopo sem termo" not in html
    # 2026-09-06 (#620): the heading said "Contratos reais, diferentes portes".
    # With a single contract left, that literal would be false. The protection
    # is against publishing a fake case, not against dropping a plural that no
    # longer has an object, so the heading is pinned to its truthful successor.
    assert "Contratos reais, diferentes portes" not in html
    assert "Contrato público real, no menor porte" in html
    # The surviving contract, its derived percentage and its PNCP record stay.
    assert "R$ 179.737,67" in html
    assert "R$ 1.797,38" in html
    # The two withdrawn panels leave no orphan value behind.
    for withdrawn in ("R$ 719.177,48", "R$ 18.293.629,80", "R$ 7.191,77", "R$ 182.936,30"):
        assert withdrawn not in html, withdrawn
    for withdrawn_link in (
        "pncp.gov.br/app/contratos/14862788000150/2026/69",
        "pncp.gov.br/app/contratos/81648859000103/2026/45",
    ):
        assert withdrawn_link not in html, withdrawn_link
    assert "contexto de mercado" in html.lower()
    assert "Qual deles se parece mais com o seu?" not in html
    assert "<dt>1% do valor</dt>" not in html

    # (a) EXACTLY ONCE. A written value, never a ceiling: `<= 3` would let the
    # triplication back in and a revert of the HTML alone would pass silently.
    for needle in (
        "data-economics-illustration",
        "Conta ilustrativa, não é economia observada",
        "Limite:",
        "Fonte: PNCP",
    ):
        assert text.count(needle) == 1, (needle, text.count(needle))

    # (b) AT MOST ONCE, and only reachable at zero under the C11 destination
    # register. Both bands are declared in cited_bands, so both must survive
    # somewhere public: here they survive on the home, exactly once.
    for needle in (
        "Custo publicado",
        "Recorrência da diretoria",
        "R$ 6.900 a R$ 7.900",
        "R$ 12.500 a R$ 20.000",
    ):
        assert text.count(needle) <= 1, (needle, text.count(needle))
    for band in ("R$ 6.900 a R$ 7.900", "R$ 12.500 a R$ 20.000"):
        assert text.count(band) == 1, f"cited_bands value vanished from every public surface: {band}"

    # The material limit survives with its subject.
    assert "risco de caixa ou margem" in html
    assert "não é economicamente indicada" in html


def test_home_illustration_caveat_is_contained_and_exclusive():
    """C5: floor, containment and exclusivity, measured per element.

    A universal assertion over an empty set is vacuously true, so the floor
    exists to stop the attribute being deleted and the caveat demoted to a
    section footer.
    """
    html = HOME.read_text(encoding="utf-8")
    text = prose(html)

    has_arithmetic = "1% deste valor contratado" in text or "resulta em R$" in text
    assert has_arithmetic, "the illustrative arithmetic disappeared; C5 floor cannot be checked"
    assert text.count("data-economics-illustration") == 1

    marked = re.findall(
        r"<p[^>]*data-economics-illustration=\"1\"[^>]*>(.*?)</p>", html, re.DOTALL
    )
    assert len(marked) == 1
    element = marked[0]
    # Containment: percentage, derived value, caveat and the published fee
    # comparison all live in the same element, so the adjacency survives the
    # card collapsing on mobile and any CSS reordering.
    assert "1% deste valor contratado" in element
    assert "resulta em R$" in element
    assert "não é economia observada" in element
    assert "Custo publicado" in element

    # Exclusivity: the full phrases, never the bare "1%", which would collide
    # with the percent-encoded WhatsApp hrefs already on the page.
    for phrase in ("1% deste valor contratado", "resulta em R$"):
        assert text.count(phrase) == 1, (phrase, text.count(phrase))
        assert phrase in element, phrase


def test_home_distinguishes_public_contract_from_confenge_fee():
    """C6: a public contract value is never presented as CONFENGE work."""
    html = HOME.read_text(encoding="utf-8")

    for match in re.finditer(r"<(p|li|article)\b[^>]*>(.*?)</\1>", html, re.DOTALL):
        element = match.group(0)
        if "Contrato observado" not in element:
            continue
        assert "não é economia observada" in element, (
            "an element states a public contract value without the market-context label"
        )

    for section_id in ("triagem-tecnica", "contato"):
        block = re.search(
            rf'<(section|div)\b[^>]*id="{section_id}"[\s\S]*?</\1>', html
        )
        if block:
            assert "Contrato observado" not in block.group(0), section_id


def test_home_conserves_b2g_structure():
    """C9: URL, anchor, shortcut and attribution conservation.

    No existing npm gate checks these, so cutting the B2G shortcuts or dropping
    a declared CTA would otherwise pass every suite.
    """
    html = HOME.read_text(encoding="utf-8")

    shortcuts = re.search(r'<ul[^>]*class="[^"]*b2g-shortcuts[^"]*"[\s\S]*?</ul>', html)
    assert shortcuts, "ul.b2g-shortcuts disappeared"
    assert shortcuts.group(0).count("<li") == 7

    assert 'id="jornada-contrato"' in html
    assert 'data-cta-id="home-medicoes-glosas-dossie"' in html
    assert 'data-cta-id="home-private-quantities-budget"' in html

    proof = re.search(r'<dl[^>]*class="[^"]*b2g-proof[^"]*"[\s\S]*?</dl>', html)
    assert proof, "dl.b2g-proof disappeared"
    assert "PNCP · 01/08/2026" in proof.group(0)

    for route in ("/servicos-obras-publicas/", "/metodologia-inteligencia/",
                  "/triagem-tecnica/#planejamento-publico"):
        assert route in html, route
    assert 'name="diagnostico-b2g"' in html


def test_home_contract_profiles_are_manual_and_accessible():
    html = HOME.read_text(encoding="utf-8")
    selector_match = re.search(r'<div[^>]+id="mercado-pncp"[\s\S]*?</div>\s*</div>', html)

    assert selector_match
    selector = selector_match.group(0)
    # C2 content floor: the anchor does not survive as an empty shell. One card
    # remains, and with it a PNCP link, the observed value it evidences, the
    # caveat element and the source caption.
    assert selector.count('class="service-card"') == 1
    assert selector.count('data-economics-illustration="1"') == 1
    assert selector.count('rel="noopener"') == 1
    assert "pncp.gov.br/app/contratos/" in selector
    assert "Contrato observado" in selector
    assert "R$ 179.737,67" in selector
    assert "Fonte: PNCP" in selector
    assert "21/08/2026" in selector
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


def test_prose_boundary_counts_claims_and_ignores_visitor_choices():
    """Positive and negative cases for the `<option>` carve-out of C8.

    The carve-out is narrow on purpose: it excludes form option values, which
    state what the visitor picks, and nothing else. A band published twice as
    prose must still fail.
    """
    band = "R$ 6.900 a R$ 7.900"

    # POSITIVE: published once as a claim, once as a bracket the visitor picks.
    positive = (
        f"<p>Custo publicado de um dossiê crítico: {band}, pontual.</p>"
        f'<select name="risco_em_jogo"><option value="faixa_dossie">{band}</option></select>'
    )
    assert prose(positive).count(band) == 1

    # NEGATIVE: published twice as prose. The ceiling must catch this.
    negative = (
        f"<p>Custo publicado de um dossiê crítico: {band}, pontual.</p>"
        f"<p>Reforçando: o dossiê custa {band}.</p>"
    )
    assert prose(negative).count(band) == 2

    # The carve-out must not swallow a claim that merely sits near a select.
    adjacent = f'<select><option value="x">Outro</option></select><p>Custo publicado: {band}.</p>'
    assert prose(adjacent).count(band) == 1
