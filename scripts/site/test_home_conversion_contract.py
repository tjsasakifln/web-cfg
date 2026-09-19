"""Fail-closed contract for the MV-04 corporate home and services candidate."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"
SERVICES = ROOT / "servicos" / "index.html"
BRAND = ROOT / "data" / "site" / "brand.json"
IA_MAP = ROOT / "data" / "site" / "public-ia-map.json"

# VALOR-IMEDIATO-20260914. A dobra deixou de ser medida por enumeracao de
# disciplinas e formatos: o exame cego mostrou que a lista nao gera
# pertinencia (Q1 so na segunda ou terceira tela) e transforma a entrega em
# formato. A propriedade protegida passa a ser: a primeira dobra nomeia uma
# situacao no vocabulario do comprador, um verbo de trabalho assumido, uma
# entrega ligada a um uso e credenciais autorizadas, com um so primario para a
# explicacao dos servicos. Um hero generico continua reprovando (ver
# test_generic_hero_is_rejected_by_the_fold_properties).
BUYER_SITUATION = re.compile(
    r"comparar propostas|conferir um projeto|completar|infiltra[çc][ãa]o|fissura|"
    r"avaliar um im[óo]vel|glosa|medi[çc][ãa]o|seguran[çc]a do trabalho|disputa|"
    r"or[çc]ar a obra|contratar a obra",
    re.I,
)
WORK_VERB = re.compile(
    r"\b(?:assumimos|levantamos|calculamos|conferimos|assinamos|projetamos|"
    r"elaboramos|revisamos|compatibilizamos|inspecionamos|avaliamos|or[çc]amos)\b",
    re.I,
)
NAMED_DELIVERABLE = re.compile(
    r"planilha|projeto|laudo|relat[óo]rio|parecer|mem[óo]ria de c[áa]lculo|quantitativo",
    re.I,
)
DELIVERABLE_USE = re.compile(
    r"\b(?:comparar|contratar|decidir|or[çc]ar|executar|coordenar|aprovar|licitar)\b",
    re.I,
)
PUBLIC_AND_PRIVATE = re.compile(r"p[úu]blic\w*\s+(?:e|ou)\s+privad\w*", re.I)
DEMONSTRATIVE_LABEL = re.compile(r"demonstrativ", re.I)


def _situations() -> list[dict]:
    brand = json.loads(BRAND.read_text(encoding="utf-8"))["service_situations"]
    ia = json.loads(IA_MAP.read_text(encoding="utf-8"))["service_situations"]
    assert [row["id"] for row in brand] == [row["id"] for row in ia], "brand and IA map disagree on situations"
    assert [row["href"] for row in brand] == [row["href"] for row in ia], "brand and IA map disagree on destinations"
    return brand


def _visible(fragment: str) -> str:
    fragment = re.sub(r"(?is)<(script|style|svg)[^>]*>.*?</\1>", " ", fragment)
    return re.sub(r"<[^>]+>", " ", fragment)
# 2026-09-07 (#611/A02). O hash e detector de mudanca nao revisada, nao
# proibicao de mudar: a revisao desta vez abriu o formulario para as situacoes
# que ele recusava (projeto, quantitativos, obra e imovel, pericia, seguranca
# do trabalho, orgao publico). As invariantes estruturais abaixo continuam
# valendo sem alteracao: 23 controles, 3 obrigatorios, action /obrigado, sem
# upload. O que mudou foram opcoes e copy, e as assercoes semanticas novas
# dizem o que a mudanca tinha de preservar.
# 2026-09-10: o select ganhou a opcao "ainda nao sei qual servico preciso",
# porque quem chega indefinido nao tinha como se declarar sem escolher uma
# disciplina que nao e a dele. A opcao tem proximo passo declarado em
# HOME_SITUATIONS; sem isso ela cairia no default "operacao" de stageToJourney,
# que e a reclassificacao silenciosa. As invariantes estruturais seguem
# identicas: 23 controles, 3 obrigatorios, action /obrigado, sem upload.
# 2026-09-18 (LAPIDACAO-COMERCIAL-20260918, §5.4/§8.1, A05). O passo "opcional"
# era obrigatorio: o unico botao do passo 1 era "Adicionar mais detalhes" e
# consentimento e envio so existiam no passo 2. Consentimento, Turnstile e o
# envio sairam dos dois paineis (ficam sempre visiveis); o painel de detalhes
# (mensagem, empresa, urgencia, faixas de obra publica, canal seguro) segue
# opcional, com "Voltar". Copy repetida saiu (contador de etapas, indicador de
# progresso, segunda dica de formato, bloco form-legal duplicando o limite
# gerado). As invariantes estruturais seguem identicas: 23 controles, 3
# obrigatorios (nome, estagio, consentimento), action /obrigado, sem upload.
# Gate executavel da propriedade: seo/scripts/test_form_funnel.mjs.
# 2026-09-19 (CONFENGE-BOFU-FECHAMENTO-20260919, WS-B: PUBLICAS-03 + B-05).
# Duas opcoes do select mudaram: o rotulo do orgao publico deixou de prometer
# "projeto ou fiscalizacao do lado do orgao" (oferta nao publicada; value e
# data-journey intactos) e a avaliacao de imovel ganhou opcao propria
# (value "avaliação de imóvel", data-journey "avaliacao"), separada da pericia
# porque as duas familias tem acoes terminais distintas na matriz de intencao.
# As invariantes estruturais seguem identicas: 23 controles, 3 obrigatorios,
# action /obrigado, sem upload. A entrada HOME_SITUATIONS do bundle e
# verificada por seo/scripts/test_form_funnel.mjs.
CAPTURE_FORM_SHA256 = "72c6aa7b375e23d389d09c11cfe04c77e7991f8b8a5570e11387aee5da219948"


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
    text = _visible(hero)

    assert "Engenharia, Perícias e Inteligência Técnica" in hero
    assert "engenharia" in text.casefold()
    assert PUBLIC_AND_PRIVATE.search(text), "hero must name the public and private scope"
    assert BUYER_SITUATION.search(text), "hero must name at least one buyer situation"
    assert len(set(v.casefold() for v in WORK_VERB.findall(text))) >= 2, "hero must say what work we assume"
    assert NAMED_DELIVERABLE.search(text), "hero must name a concrete deliverable"
    assert DELIVERABLE_USE.search(text), "hero must say what the deliverable is for"
    assert DEMONSTRATIVE_LABEL.search(text), "the sample in the hero must be labelled as demonstrative"
    assert "Engenharia Civil pela EESC-USP" in hero
    assert "CNPJ 52.407.089/0001-09" in hero
    assert 'href="/servicos/"' in hero
    assert hero.count("button-primary") == 1
    assert "PNCP" not in hero


def test_generic_hero_is_rejected_by_the_fold_properties() -> None:
    """Contraprova: um hero generico nao satisfaz as propriedades da dobra."""
    for generic in (
        "Engenharia que transforma o seu projeto.",
        "Engenharia com solução personalizada. Solicite uma proposta.",
    ):
        checks = (
            bool(PUBLIC_AND_PRIVATE.search(generic)),
            bool(BUYER_SITUATION.search(generic)),
            len(set(WORK_VERB.findall(generic))) >= 2,
            bool(DELIVERABLE_USE.search(generic)),
            bool(DEMONSTRATIVE_LABEL.search(generic)),
        )
        assert not all(checks), generic


def test_situation_chooser_has_one_path_per_contract_situation_without_catalog_wall() -> None:
    chooser = _section(_home(), r'id="situacoes"')
    situations = _situations()
    for row in situations:
        assert row["label"] in chooser, row["label"]
    assert chooser.count('class="situation-row') == len(situations)
    # 2026-09-08. Esta linha exigia que a situacao de projeto apontasse para
    # /quantitativos-orcamento-obras/: uma chamada que promete projetar,
    # revisar, orcar e compatibilizar levando ao unico item que e orcamento.
    # A trava congelava o defeito. A propriedade correta: cada situacao tem
    # destino proprio, nenhum repetido e todos internos.
    # VALOR-IMEDIATO-20260914. A lista literal de seis hrefs (quatro deles
    # obrigatoriamente no hub) tambem congelava um defeito: mandava quem tem
    # infiltracao, disputa ou exigencia de SST passar pelo hub mesmo com a
    # landing publicada. O destino agora e o do contrato de situacoes (hub ou
    # landing), e a home tem de reproduzi-lo dentro da propria linha.
    hrefs = re.findall(r'class="situation-action"[^>]*href="([^"]+)"', chooser)
    if not hrefs:
        hrefs = re.findall(r'<a[^>]*class="situation-action"[^>]*href="([^"]+)"', chooser)
    assert len(hrefs) == len(situations), hrefs
    assert len(set(hrefs)) == len(situations), hrefs
    assert all(h.startswith("/") and not h.startswith("//") for h in hrefs), hrefs
    assert chooser.count('href="/triagem-tecnica/#') == 0
    for row in situations:
        assert f'href="{row["href"]}"' in chooser, row["href"]
        target, _, anchor = row["href"].partition("#")
        page = ROOT / target.strip("/") / "index.html"
        assert page.is_file(), row["href"]
        if anchor:
            assert f'id="{anchor}"' in page.read_text(encoding="utf-8"), row["href"]
    assert 'href="/servicos/#servico-projeto"' in chooser
    assert 'href="/quantitativos-orcamento-obras/"' in chooser
    assert 'href="/servicos-obras-publicas/"' in chooser
    # Cada linha nomeia a entrega e o uso, em vez de so o formato.
    rows = re.findall(r'<li class="situation-row[\s\S]*?</li>', chooser)
    assert len(rows) == len(situations), len(rows)
    for row in rows:
        assert "<h3>" in row, row[:120]
        assert 'class="situation-use"' in row and "passa a ter" in row, row[:120]
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
    rows = re.findall(r'<article class="corporate-service-row[^"]*" id="([^"]+)"', html)
    # VALOR-IMEDIATO-20260914. A igualdade ordenada de oito ids impedia que a
    # avaliacao de imovel tivesse cartao proprio. A propriedade: o conjunto de
    # ancoras publicas do hub sobrevive (cada uma como cartao), sem duplicata;
    # a ordem e editorial.
    assert len(rows) == len(set(rows)), rows
    assert set(rows) >= {
        "servico-projeto",
        "servico-revisao",
        "servico-compatibilizacao",
        "servico-orcamento",
        "servico-diagnostico",
        "servico-avaliacao",
        "servico-pericia",
        "servico-sst",
        "servico-obras-publicas",
    }, rows
    for row in re.findall(r'<article class="corporate-service-row[\s\S]*?</article>', html):
        assert "O que assumimos" in row and "passa a ter" in row, row[:160]
    assert "/servicos-obras-publicas/" in html
    assert not re.search(r"R\$\s*\d", html)
    assert "campanha" not in html.lower()
    assert "família pública" not in html.lower()


if __name__ == "__main__":
    raise SystemExit(__import__("pytest").main([__file__, "-q"]))


def test_stage_options_sharing_a_journey_list_the_neutral_one_first() -> None:
    """Regressao (#650): a jornada "contrato" tem duas opcoes de estagio e o
    preenchimento automatico escolhe a PRIMEIRA que carrega a jornada; antes
    era "problema urgente em contrato", imposta a quem so entrou em obras
    publicas. A opcao neutra vem primeiro no HTML, sem marcador nem codigo
    extra no bundle: para toda jornada com mais de uma opcao, a primeira nunca
    e a urgente, e para "contrato" ela e "contrato em execução"."""
    html = _home()
    form = re.search(r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html).group(0)
    by_journey: dict[str, list[str]] = {}
    for attrs in re.findall(r'<option\b([^>]*)>', form):
        journey = re.search(r'data-journey="([^"]+)"', attrs)
        if journey:
            by_journey.setdefault(journey.group(1), []).append(attrs)
    assert "contrato" in by_journey and len(by_journey["contrato"]) >= 2
    for journey, attrs_list in by_journey.items():
        if len(attrs_list) > 1:
            assert "urgente" not in attrs_list[0].lower(), (journey, attrs_list[0])
    assert 'value="contrato em execução"' in by_journey["contrato"][0]
    assert "data-journey-default" not in form


# ---------------------------------------------------------------------------
# CONFENGE-BOFU-FECHAMENTO-20260919 (WS-B). Cada teste abaixo reprovava no
# HTML servido em fedb4768b e descreve a propriedade que a correcao protege.
# ---------------------------------------------------------------------------
TRIAGE = ROOT / "triagem-tecnica" / "index.html"
REGISTRY = ROOT / "data" / "organic" / "public-family-registry.json"
PURCHASE_MAP = ROOT / "data" / "bofu-dominance" / "core" / "purchase-route-map.v1.json"
WHATSAPP_MESSAGES = ROOT / "data" / "site" / "whatsapp-messages.json"


def _situation_row(html: str, row_id: str) -> str:
    match = re.search(rf'<li class="situation-row[^"]*" id="{row_id}">[\s\S]*?</li>', html)
    assert match, row_id
    return match.group(0)


def _triage_item(item_id: str) -> str:
    html = TRIAGE.read_text(encoding="utf-8")
    match = re.search(rf'<li id="{item_id}">[\s\S]*?</li>', html)
    assert match, item_id
    return match.group(0)


def _services_article(row_id: str) -> str:
    html = SERVICES.read_text(encoding="utf-8")
    match = re.search(rf'<article class="corporate-service-row[^"]*" id="{row_id}"[\s\S]*?</article>', html)
    assert match, row_id
    return match.group(0)


def test_home_property_row_names_receiving_reform_and_as_built() -> None:
    """HOME-HUB-01 / A-04. Quem vai receber um imovel, reformar em condominio
    ou documentar o construido nao se reconhecia na linha 03: o titulo so
    falava de infiltracao e o unico link ia a landing sem ancora."""
    row = _situation_row(_home(), "situacao-obra-imovel")
    for anchor in ("#recebimento-entrega", "#reforma-condominio", "#documentacao-as-built"):
        assert f'href="/inspecao-diagnostico-edificacoes/{anchor}"' in row, anchor
    text = _visible(row).casefold()
    for term in ("receb", "reform", "construído"):
        assert term in text, term


def test_home_public_works_row_names_edital_and_public_entity() -> None:
    """HOME-HUB-09. Licitante e orgao nao se reconheciam no h3 da linha 07."""
    row = _situation_row(_home(), "situacao-obras-publicas")
    heading = _visible(re.search(r"<h3>[\s\S]*?</h3>", row).group(0)).casefold()
    assert "edital" in heading, heading
    assert "órgão" in heading, heading


def test_home_sst_row_links_the_labor_dispute_entry() -> None:
    """B-07 (3). O advogado trabalhista nao chegava a #assistencia-trabalhista
    em duas escolhas a partir da home."""
    row = _situation_row(_home(), "situacao-sst")
    assert 'href="/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista"' in row


def test_home_triage_section_frames_every_family_before_public_works() -> None:
    """B-11. O unico paragrafo de expectativa de #triagem-tecnica abria com
    "Em obra publica": a consultoria inteira era enquadrada pela vertical."""
    triage = _section(_home(), r'id="triagem-tecnica"')
    intro = re.search(r'<h2 class="t-editorial" id="triage-title">[\s\S]*?</h2>\s*<p>([\s\S]*?)</p>', triage)
    assert intro, "triage intro paragraph missing"
    text = _visible(intro.group(1)).strip()
    assert "sem saber o nome do serviço" in text, text
    assert not text.startswith("Em obra pública"), text
    # O prazo publicado de obra publica continua na pagina (condicao material).
    assert "1 dia útil" in text, text
    assert "Não envie documentos sensíveis" in text, text


def test_home_public_entity_paragraph_points_to_the_persisted_channel() -> None:
    """PUBLICAS-02. 'descreva a necessidade' levava a um item da triagem sem
    canal; o orgao precisa chegar ao formulario persistido do hub."""
    b2g = _section(_home(), r'id="obras-publicas"')
    assert 'href="/servicos-obras-publicas/#captura-contrato"' in b2g
    assert 'href="/servicos-obras-publicas/#situacao-orgao"' in b2g


def test_triage_public_entity_item_has_whatsapp_and_form() -> None:
    """PUBLICAS-02. O li#planejamento-publico so tinha '/servicos-obras-publicas/'
    enquanto os irmaos traziam wa.me com mensagem pronta."""
    from urllib.parse import unquote

    item = _triage_item("planejamento-publico")
    hrefs = re.findall(r'href="([^"]+)"', item)
    assert "/servicos-obras-publicas/#captura-contrato" in hrefs, hrefs
    expected = json.loads(WHATSAPP_MESSAGES.read_text(encoding="utf-8"))["messages"]["orgao_planejamento"]
    texts = [unquote(h.split("text=", 1)[1]) for h in hrefs if h.startswith("https://wa.me/") and "text=" in h]
    assert expected in texts, texts


def test_purchase_map_terminals_follow_the_persisted_channels() -> None:
    """PUBLICAS-02 + B-05. O mapa de compra apontava o orgao para a triagem
    sem canal e a avaliacao para o item fundido com pericia."""
    doc = json.loads(PURCHASE_MAP.read_text(encoding="utf-8"))
    rows = {row["purchase_id"]: row for row in doc["purchases"]}
    assert rows["planejar-contratacao-publica"]["terminal_contact"]["destination"] == "/servicos-obras-publicas/#captura-contrato"
    assert rows["avaliar-imovel"]["terminal_contact"]["destination"] == "/triagem-tecnica/#avaliacao-imovel"


def test_home_select_separates_valuation_and_drops_unpublished_inspection_promise() -> None:
    """PUBLICAS-03 + B-05. O rotulo do orgao prometia 'fiscalizacao do lado do
    orgao' (oferta nao publicada) e a avaliacao de imovel so existia fundida
    com pericia, recebendo orientacao de disputa. A entrada correspondente em
    HOME_SITUATIONS (bundle) e verificada por seo/scripts/test_form_funnel.mjs."""
    html = _home()
    block = re.search(r'<select\b[^>]*id="estagio"[\s\S]*?</select>', html).group(0)
    orgao = re.search(r'<option value="planejamento de órgão público"[^>]*>([^<]*)</option>', block)
    assert orgao, "public entity option missing"
    assert "fiscaliza" not in orgao.group(1).casefold(), orgao.group(1)
    assert "órgão público" in orgao.group(1).casefold(), orgao.group(1)
    assert '<option value="avaliação de imóvel" data-journey="avaliacao">' in block
    pericia = re.search(r'<option value="perícia, assistência técnica ou avaliação"[^>]*>([^<]*)</option>', block)
    assert pericia, "dispute option missing"
    assert "avalia" not in pericia.group(1).casefold(), pericia.group(1)


def test_triage_separates_valuation_from_dispute_and_names_labor_sst() -> None:
    """B-05 (triagem) + B-07 (4)."""
    valuation = _triage_item("avaliacao-imovel")
    assert 'href="/servicos/#servico-avaliacao"' in valuation
    assert "https://wa.me/" in valuation
    valuation_text = _visible(valuation).casefold()
    assert "partilha" in valuation_text
    assert "processo" not in valuation_text
    dispute = _triage_item("pericia-avaliacao")
    assert "https://wa.me/" in dispute
    sst = _triage_item("sst")
    assert 'href="/seguranca-trabalho-apoio-tecnico/#assistencia-trabalhista"' in sst
    assert "trabalhista" in _visible(sst).casefold()


def test_sst_family_visitor_job_covers_labor_dispute_evidence() -> None:
    """B-07 (1)."""
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    row = next(r for r in registry["families"] if r.get("id") == "seguranca-trabalho-apoio-tecnico")
    assert "reclamação trabalhista" in row["visitor_job"].casefold(), row["visitor_job"]


def test_services_rows_close_with_contact_after_conditions() -> None:
    """B-04. Em #servico-avaliacao o WhatsApp vinha antes de 'Fora desta
    oferta'; quem tem imovel rural acionava o canal antes de ler a exclusao."""
    html = SERVICES.read_text(encoding="utf-8")
    checked = 0
    for article in re.findall(r'<article class="corporate-service-row[\s\S]*?</article>', html):
        row_id = re.search(r'id="([^"]+)"', article).group(1)
        conditions = [m.end() for m in re.finditer(r'class="conditions', article)]
        whatsapp = [m.start() for m in re.finditer(r'href="https://wa\.me/', article)]
        if not conditions or not whatsapp:
            continue
        assert whatsapp[0] > conditions[-1], row_id
        checked += 1
    assert checked >= 1


def test_services_contact_anchors_declare_a_cta_id() -> None:
    """B-06. As ancoras wa.me/mailto de /servicos/ disparavam whatsapp_click
    com cta_id 'unspecified': a familia avaliar_imovel nao era segmentavel."""
    html = SERVICES.read_text(encoding="utf-8")
    main = re.search(r"<main[\s\S]*?</main>", html).group(0)
    missing = []
    for attrs in re.findall(r"<a\b([^>]*)>", main):
        href = re.search(r'href="([^"]+)"', attrs)
        if not href:
            continue
        if not (href.group(1).startswith("https://wa.me/") or href.group(1).startswith("mailto:")):
            continue
        cta = re.search(r'data-cta-id="([^"]*)"', attrs)
        if not cta or not cta.group(1).strip():
            missing.append(href.group(1)[:60])
    assert not missing, missing


def test_services_valuation_names_the_taxonomy_purposes() -> None:
    """B-03 (minimo sem rota propria): finalidades nomeadas pela taxonomia."""
    text = _visible(_services_article("servico-avaliacao")).casefold()
    for term in ("partilha", "garantia", "desapropriação", "aluguel"):
        assert term in text, term


def test_services_hub_does_not_repeat_its_own_conditions() -> None:
    """RESSALVAS-10. 'ART' duas vezes na mesma frase, a lista de aceite
    repetida em tres secoes e 'nao sao o mesmo trabalho' na disputa."""
    html = SERVICES.read_text(encoding="utf-8")
    for sentence in re.split(r"(?<=[.!?])\s+", _visible(_services_article("servico-avaliacao"))):
        assert len(re.findall(r"\bART\b", sentence)) <= 1, sentence.strip()
    assert "não são o mesmo trabalho" not in html
    assert "atividade de campo, responsável técnico, ART e eventuais registros ou vistos" not in html
    assert html.count("Local, atribuição, visita e ART, quando aplicáveis, são confirmados antes do aceite técnico") == 1
