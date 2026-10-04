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
# As invariantes estruturais seguem identicas: 24 controles, 3 obrigatorios,
# action /obrigado, sem upload. A entrada HOME_SITUATIONS do bundle e
# verificada por seo/scripts/test_form_funnel.mjs.
# Campaign review: 24 original controls plus 3 hidden attribution fields;
# 3 required fields and receipt/abuse/privacy contracts are preserved.
# Previous reviewed form: 153a576f12cd5c8897fc6e9191674e3aa2fad5f7d3791e0004495bbceef24350
# 2026-10-04 (CONFENGE-QUALIDADE-SITEWIDE): presentation-only recapture
# after the Turnstile slot changed from normal to compact to fit the first
# viewport. Capture routing, controls, consent, privacy, receipt and token
# handling are protected by the assertions below and remain unchanged.
CAPTURE_FORM_SHA256 = "7d733ae97146d18fb4fe4f8ef46804c9792444ab9d85b45e878d94e093672db6"


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
    text = _visible(hero).casefold()
    assert all(term in text for term in ("estruturas", "instalações", "infraestrutura"))
    assert re.search(r"elabora|projeta|coordena", text)
    assert re.search(r"obra|execução|empreendimento", text)
    assert 'href="#contato"' in hero and 'href="/projetos/"' in hero
    assert hero.count("button-primary") == 1
    assert DEMONSTRATIVE_LABEL.search(text) or "ilustração técnica original" in text
    assert "Como conferir credenciais e limites" not in hero and "PNCP" not in hero
    brand = json.loads(BRAND.read_text(encoding="utf-8"))
    assert brand["hero"]["meta_description"] in _home()
    assert "definidos antes da proposta" not in _home()


def test_generic_hero_is_rejected_by_the_fold_properties() -> None:
    for generic in ("Engenharia que transforma o seu projeto.", "Engenharia com solução personalizada. Solicite uma proposta."):
        assert not all(term in generic.casefold() for term in ("estruturas", "instalações", "infraestrutura"))


def test_situation_chooser_has_one_path_per_contract_situation_without_catalog_wall() -> None:
    html = _home()
    disciplines = _section(html, r'id="competencias"')
    for slug in ("estruturas", "instalacoes", "infraestrutura", "coordenacao-multidisciplinar"):
        assert f'href="/projetos/{slug}/"' in disciplines
        assert (ROOT / "projetos" / slug / "index.html").is_file()
    services = _section(html, r'id="servicos-complementares"')
    for slug in ("quantitativos-orcamento-obras", "revisao-tecnica-projetos-engenharia", "seguranca-trabalho-apoio-tecnico", "servicos-obras-publicas"):
        assert f'href="/{slug}/"' in services
        assert (ROOT / slug / "index.html").is_file()
    assert 'class="situation-row' not in html
    assert "passa a ter" not in _visible(disciplines + services).casefold()


def test_pncp_proof_is_confined_to_the_b2g_vertical() -> None:
    html = _home()
    assert not re.search(r"54\.055|4,48 mi|PNCP ·", html)
    assert 'href="/servicos-obras-publicas/"' in _section(html, r'id="servicos-complementares"')
    assert (ROOT / "servicos-obras-publicas" / "index.html").is_file()


def test_corporate_triage_is_safe_and_capture_form_is_reviewed() -> None:
    html = _home()
    contact = _section(html, r'id="contato"')
    assert "mailto:tiago.sasaki@confenge.com.br" in contact and "wa.me/5548988344559" in contact
    assert re.search(r"não sigilosas|reservad[oa]|confidencia", _visible(contact), re.I)
    body = re.search(r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html).group(0)
    assert re.findall(r'<form[^>]*action="([^"]*)"', body) == ["/obrigado"]
    assert 'method="POST"' in body and 'name="diagnostico-b2g"' in body
    controls = re.findall(r'<(?:input|select|textarea)\b[^>]*name="([^"]+)"', body)
    assert len(controls) == 27 and "sst_necessidade" in controls
    for name, value in (("asset_id", "home-institutional"), ("cta_id", "home-proposal-submit"), ("route_family", "home")):
        assert f'name="{name}" type="hidden" value="{value}"' in body
    required = re.findall(r'<(?:input|select|textarea)\b[^>]*name="([^"]+)"[^>]*required', body)
    assert len(required) == 3
    assert 'type="file"' not in body.lower()
    assert 'data-runtime-profile="shared_lead_form_v1"' in body and 'data-receipt-required="true"' in body
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in body
    assert 'class="cf-turnstile" data-theme="light" data-size="compact"' in body
    assert hashlib.sha256(body.encode("utf-8")).hexdigest() == CAPTURE_FORM_SHA256


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
    assert "Projetos e serviços de engenharia" in html
    ids = re.findall(r'\sid="([^"]+)"', html)
    assert len(ids) == len(set(ids))
    assert set(ids) >= {"servico-projeto", "servico-revisao", "servico-compatibilizacao", "servico-orcamento", "servico-diagnostico", "servico-avaliacao", "servico-pericia", "servico-sst", "servico-obras-publicas"}
    for article in re.findall(r'<article class="corporate-service-row[\s\S]*?</article>', html):
        assert "<h3>" in article and len(_visible(article)) >= 180 and 'href="/' in article
    assert "/servicos-obras-publicas/" in html and not re.search(r"R\$\s*\d", html)
    assert "família pública" not in _visible(html).casefold()


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
B2G_HUB = ROOT / "servicos-obras-publicas" / "index.html"
SITEMAP = ROOT / "sitemap.xml"
TAXONOMY = ROOT / "data" / "corporate" / "taxonomy.v1.json"
OFFER_CATALOG = ROOT / "data" / "offers" / "multivertical" / "catalog.v2.json"
# PUBLICAS-01 (WS-A): enquanto o formulario do hub nao oferece o evento do
# orgao, o lead do orgao so se distingue da contratada se o visitante passar
# pela instrucao "em Evento observado, escolha Outro evento contratual", que
# vive em #situacao-orgao. Quando a opcao existir, o destino direto passa a
# ser aceito e este guarda se relaxa sozinho.
PUBLIC_ENTITY_EVENT_OPTION = 'value="planejamento_contratacao"'


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
    home = _section(_home(), r'id="servicos-complementares"')
    assert 'data-cta-id="home-service-inspection" data-cta-position="home_services" href="/servicos/#areas"' in home
    services = SERVICES.read_text(encoding="utf-8")
    assert 'href="/inspecao-diagnostico-edificacoes/"' in services
    assert 'href="/assistencia-tecnica-pericial-engenharia/"' in services
    assert 'id="servico-avaliacao"' in services
    destination = (ROOT / "inspecao-diagnostico-edificacoes/index.html").read_text(encoding="utf-8")
    for anchor in ("recebimento-entrega", "reforma-condominio", "documentacao-as-built"):
        assert f'id="{anchor}"' in destination
    assert re.search(r"recebimento|reforma|construído", _visible(destination), re.I)


def test_home_public_works_row_names_edital_and_public_entity() -> None:
    row = _section(_home(), r'id="servicos-complementares"')
    assert 'href="/servicos-obras-publicas/"' in row and "edital" in _visible(row).casefold()
    destination = B2G_HUB.read_text(encoding="utf-8")
    assert "órgão" in _visible(destination).casefold() and "planejamento_contratacao" in destination


def test_home_sst_row_exposes_the_documental_purchase_paths() -> None:
    row = _section(_home(), r'id="servicos-complementares"')
    assert 'href="/seguranca-trabalho-apoio-tecnico/"' in row
    destination = (ROOT / "seguranca-trabalho-apoio-tecnico/index.html").read_text(encoding="utf-8")
    for route in ("/elaboracao-pgr/", "/revisao-atualizacao-pgr/", "/pgr-documentacao-sst-obras/", "/terceirizacao-documentacao-sst/"):
        assert f'href="{route}"' in destination
    assert "remotamente" in _visible(destination).casefold()


def test_home_triage_section_frames_every_family_before_public_works() -> None:
    contact = _section(_home(), r'id="contato"')
    assert "informações que já tiver" in contact
    assert "proposta" in _visible(contact).casefold()
    assert 'name="estagio"' in contact and 'name="consentimento"' in contact
    assert "confidenciais" in contact and "730 dias" in contact


def _public_entity_form_destination() -> str:
    """Destino persistido do orgao: o formulario do hub quando ele nomeia o
    evento do orgao (PUBLICAS-01); ate la, a secao #situacao-orgao, que
    carrega a instrucao e o botao 'Registrar no formulario'."""
    hub = B2G_HUB.read_text(encoding="utf-8")
    form = re.search(r"<form\b[\s\S]*?</form>", hub).group(0)
    if PUBLIC_ENTITY_EVENT_OPTION in form:
        return "/servicos-obras-publicas/#captura-contrato"
    section = re.search(r'id="situacao-orgao"[\s\S]*?</ol>', hub).group(0)
    assert "Outro evento contratual" in section
    assert 'href="#captura-contrato"' in section
    return "/servicos-obras-publicas/#situacao-orgao"


def test_home_public_entity_paragraph_points_to_the_persisted_channel() -> None:
    home = _section(_home(), r'id="servicos-complementares"')
    assert 'href="/servicos-obras-publicas/"' in home
    destination = _public_entity_form_destination()
    assert destination == "/servicos-obras-publicas/#captura-contrato"
    assert PUBLIC_ENTITY_EVENT_OPTION in B2G_HUB.read_text(encoding="utf-8")


def test_triage_public_entity_item_has_whatsapp_and_form() -> None:
    item = _triage_item("planejamento-publico")
    assert 'href="/servicos-obras-publicas/"' in item
    assert _public_entity_form_destination() == "/servicos-obras-publicas/#captura-contrato"
    html = TRIAGE.read_text(encoding="utf-8")
    assert all(token in html for token in ("https://wa.me/5548988344559", "mailto:tiago.sasaki@confenge.com.br", "tel:+5548988344559"))


def test_purchase_map_terminals_follow_the_persisted_channels() -> None:
    """PUBLICAS-02 + B-05. O mapa de compra apontava o orgao para a triagem
    sem canal e a avaliacao para o item fundido com pericia."""
    doc = json.loads(PURCHASE_MAP.read_text(encoding="utf-8"))
    rows = {row["purchase_id"]: row for row in doc["purchases"]}
    assert rows["planejar-contratacao-publica"]["terminal_contact"]["destination"] == _public_entity_form_destination()
    assert rows["avaliar-imovel"]["terminal_contact"]["destination"] == "/triagem-tecnica/#avaliacao-imovel"
    # A compra de avaliacao apontava primary_url/source_of_truth para a
    # pericia (#servico-pericia) enquanto o terminal ja era a avaliacao.
    for key in ("primary_url", "proposed_primary_url", "source_of_truth"):
        assert rows["avaliar-imovel"][key] == "/servicos/#servico-avaliacao", key


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


def test_triage_separates_valuation_dispute_and_documental_sst() -> None:
    valuation = _triage_item("avaliacao-imovel")
    assert 'href="/servicos/#servico-avaliacao"' in valuation
    assert "https://wa.me/5548988344559" in valuation and "mailto:tiago.sasaki@confenge.com.br" in valuation, "valuation fragment must reach contextual contact"
    dispute = _triage_item("pericia-avaliacao")
    assert 'href="/assistencia-tecnica-pericial-engenharia/"' in dispute
    sst = _triage_item("sst")
    assert 'href="/seguranca-trabalho-apoio-tecnico/"' in sst
    assert "trabalhista" not in _visible(sst).casefold()
    assert "remotamente" in (ROOT / "seguranca-trabalho-apoio-tecnico/index.html").read_text(encoding="utf-8").casefold()
    assert all(token in TRIAGE.read_text(encoding="utf-8") for token in ("https://wa.me/", "mailto:", "tel:"))


def test_sst_family_visitor_job_covers_the_remote_documental_purchase() -> None:
    """A família SST descreve o trabalho de compra desta vertical."""
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    row = next(r for r in registry["families"] if r.get("id") == "seguranca-trabalho-apoio-tecnico")
    visitor_job = row["visitor_job"].casefold()
    for term in ("elaboração", "revisão", "remota", "pgr", "obra", "terceirização"):
        assert term in visitor_job, (term, row["visitor_job"])
    assert "reclamação trabalhista" not in visitor_job


def test_services_rows_close_with_contact_after_conditions() -> None:
    """B-04. Em #servico-avaliacao o WhatsApp vinha antes de 'Fora desta
    oferta'; quem tem imovel rural acionava o canal antes de ler a exclusao."""
    html = SERVICES.read_text(encoding="utf-8")
    checked = 0
    for article in re.findall(r'<article class="corporate-service-row[\s\S]*?</article>', html):
        row_id = re.search(r'id="([^"]+)"', article).group(1)
        conditions = [m.end() for m in re.finditer(r'class="conditions', article)]
        contact = [m.start() for m in re.finditer(r'href="(?:https://wa\.me/|/triagem-tecnica/)', article)]
        if not conditions or not contact:
            continue
        assert contact[0] > conditions[-1], row_id
        checked += 1
    assert checked >= 1


def test_services_contact_anchors_declare_a_cta_id() -> None:
    """B-06. As ancoras wa.me/mailto das linhas de servico disparavam
    whatsapp_click com cta_id 'unspecified': a familia avaliar_imovel nao era
    segmentavel. So as linhas (article.corporate-service-row) segmentam por
    nucleo; heroi e faixa de contato ficam sem data-cta-id para o subgate
    cta_subordinate de inbound_gates (max(3, palavras // 400) = 5 em
    /servicos/) nao virar divida comercial anonima."""
    html = SERVICES.read_text(encoding="utf-8")
    main = re.search(r"<main[\s\S]*?</main>", html).group(0)
    missing = []
    for article in re.findall(r'<article class="corporate-service-row[\s\S]*?</article>', main):
        for attrs in re.findall(r"<a\b([^>]*)>", article):
            href = re.search(r'href="([^"]+)"', attrs)
            if not href:
                continue
            if not (href.group(1).startswith("https://wa.me/") or href.group(1).startswith("mailto:")):
                continue
            cta = re.search(r'data-cta-id="([^"]*)"', attrs)
            if not cta or not cta.group(1).strip():
                missing.append(href.group(1)[:60])
    assert not missing, missing
    declared = re.findall(r'<a\b[^>]*\bclass="[^"]*\bbutton-primary\b[^"]*"', main)
    words = len(re.findall(r"\w+", _visible(main)))
    assert len(declared) <= max(3, words // 400), (len(declared), words)


def test_services_valuation_names_the_taxonomy_purposes() -> None:
    taxonomy = json.loads(TAXONOMY.read_text(encoding="utf-8"))
    catalog = json.loads(OFFER_CATALOG.read_text(encoding="utf-8"))
    owner = (json.dumps(taxonomy, ensure_ascii=False) + json.dumps(catalog, ensure_ascii=False)).casefold()
    article = _services_article("servico-avaliacao")
    text = _visible(article).casefold()
    for term in ("partilha", "garantia", "desapropriação", "data-base", "método", "urbano"):
        assert term in owner and term in text, term
    assert "preliminar" in text and "formal" in text
    assert "rurais" in text and "em massa" in text
    assert 'href="/triagem-tecnica/#avaliacao-imovel"' in article
    assert not re.search(r"R\$\s*\d|\b[12] dias? úteis", text)


def test_services_hub_does_not_repeat_its_own_conditions() -> None:
    html = SERVICES.read_text(encoding="utf-8")
    article = _services_article("servico-avaliacao")
    assert article.count('class="conditions"') == 1
    assert "não são o mesmo trabalho" not in html
    assert "antes do aceite técnico" not in html
    assert 'href="/triagem-tecnica/"' in html


def test_attribution_does_not_promote_discovery_but_primary_overload_fails() -> None:
    from scripts.site.inbound_gates import _cta_subordinate
    prose = "Projeto e execução com documentação técnica. " * 80
    discovery = ''.join(f'<a data-cta-id="discipline-{i}" href="/projetos/">Disciplina</a>' for i in range(9))
    primary = '<a class="button button-primary" data-cta-id="proposal" href="/triagem-tecnica/">Solicitar proposta</a>'
    shared_form = '<form action="/obrigado" data-runtime-profile="shared_lead_form_v1" data-receipt-required="true"><button>Solicitar contato</button></form>'
    assert _cta_subordinate("/", f'<main><p>{prose}</p>{discovery}{primary}{shared_form}</main>', prose).passed
    overloaded = f'<main><p>{prose}</p>{primary * 5}</main>'
    assert not _cta_subordinate("/", overloaded, prose).passed
    assert not _cta_subordinate("/", f'<main><p>{prose}</p>{shared_form * 5}</main>', prose).passed
    legacy_form = '<form action="/.netlify/functions/lead"><button>Solicitar contato</button></form>'
    assert not _cta_subordinate("/", f'<main><p>{prose}</p>{legacy_form * 5}</main>', prose).passed
    utility_form = '<form action="/ferramentas/"><button>Calcular</button></form>'
    assert _cta_subordinate("/", f'<main><p>{prose}</p>{utility_form * 5}</main>', prose).passed


def test_triage_sitemap_lastmod_matches_the_html_signal() -> None:
    """Regressao apontada na revisao: dateModified/'Pagina revista em' de
    /triagem-tecnica/ subiram para 2026-09-19 sem o lastmod do sitemap
    (fora do WS-B), reprovando scripts/organic/sitemap_graph.py. O bump de data
    pertence ao fechamento, junto com o sitemap."""
    html = TRIAGE.read_text(encoding="utf-8")
    modified = re.search(r'"dateModified"\s*:\s*"([^"]+)"', html).group(1)
    visible = re.search(r'Página revista em <time datetime="([^"]+)">', html).group(1)
    assert visible == modified, (visible, modified)
    sitemap = SITEMAP.read_text(encoding="utf-8")
    entry = re.search(r"<url>\s*<loc>https://confenge.com.br/triagem-tecnica/</loc>[\s\S]*?</url>", sitemap).group(0)
    lastmod = re.search(r"<lastmod>([^<]+)</lastmod>", entry).group(1)
    assert lastmod == modified, (lastmod, modified)
