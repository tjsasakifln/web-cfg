import json
import html
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "services" / "institutional-service-pages.v1.json"
HUB = ROOT / "engenharia-condominios" / "index.html"
INSPECTION = ROOT / "inspecao-diagnostico-edificacoes" / "index.html"
ASSISTANCE = ROOT / "assistencia-tecnica-pericial-engenharia" / "index.html"


class PageStructure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.h1_count = 0
        self.forms = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        if tag == "h1":
            self.h1_count += 1
        if tag == "form":
            self.forms += 1


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def json_ld(document: str) -> list[dict]:
    blocks = re.findall(
        r'<script type="application/ld\+json">([\s\S]*?)</script>', document
    )
    assert blocks
    return [json.loads(block) for block in blocks]


def types(document: str) -> set[str]:
    observed = set()
    for block in json_ld(document):
        for item in block.get("@graph", [block]):
            value = item.get("@type")
            if isinstance(value, list):
                observed.update(value)
            elif value:
                observed.add(value)
    return observed


def cta_href(document: str, cta_id: str) -> str:
    tag = re.search(
        rf'<a\b(?=[^>]*\bdata-cta-id="{re.escape(cta_id)}")[^>]*>',
        document,
    )
    assert tag, cta_id
    href = re.search(r'\bhref="([^"]+)"', tag.group(0))
    assert href, cta_id
    return html.unescape(href.group(1))


def test_central_route_is_one_editorial_entry_for_three_existing_situations():
    data = json.loads(read(SOURCE))
    assert len(data["hubs"]) == 1
    hub = data["hubs"][0]
    assert hub["route"] == "engenharia-condominios"
    assert len(hub["situations"]) == 3
    assert {item["id"] for item in hub["situations"]} == {
        "problemas-edificacao",
        "disputa-laudo",
        "recebimento-reforma-manutencao",
    }
    serialized = json.dumps(hub, ensure_ascii=False)
    for forbidden_key in ('"nucleus_id"', '"intent_family"', '"offer_id"'):
        assert forbidden_key not in serialized


def test_central_route_has_search_sharing_and_valid_structured_data():
    document = read(HUB)
    assert "<title>Engenharia para condomínios:" in document
    assert (
        '<link href="https://confenge.com.br/engenharia-condominios/" '
        'rel="canonical"/>' in document
    )
    for field in (
        'property="og:title"',
        'property="og:description"',
        'property="og:url"',
        'property="og:image"',
        'name="twitter:card"',
        'name="twitter:title"',
        'name="twitter:description"',
        'name="twitter:image"',
    ):
        assert field in document
    assert {"CollectionPage", "ItemList", "FAQPage", "BreadcrumbList"} <= types(document)
    assert "Service" not in types(document)
    graph = json_ld(document)[0]["@graph"]
    item_list = next(item for item in graph if item["@type"] == "ItemList")
    assert item_list["numberOfItems"] == 3


def test_central_route_preserves_scope_coverage_and_contact_context():
    document = read(HUB)
    required = (
        "Grande Florianópolis",
        "A conversa inicial e a leitura documental podem ocorrer a distância",
        "disponibilidade de visita",
        "no local do cliente, mediante agendamento",
        "sem presumir quem pode aprovar sozinho",
        "Exemplos demonstrativos",
        "sem imóvel, processo ou resultado de cliente",
        'data-route-family="engenharia-condominios"',
        'data-journey="outro"',
        'data-origem="/engenharia-condominios/"',
        'data-origin-url="/engenharia-condominios/"',
        'data-tema="engenharia-condominios"',
        'data-asset-id="condominium_engineering_editorial_route_v1"',
        "https://wa.me/5548988344559?text=",
        "mailto:tiago.sasaki@confenge.com.br",
        "tel:+5548988344559",
        'href="/triagem-tecnica/"',
        'href="/privacidade/"',
    )
    for phrase in required:
        assert phrase in document
    parser = PageStructure()
    parser.feed(document)
    assert parser.h1_count == 1
    assert len(parser.ids) == len(set(parser.ids))
    assert parser.forms == 0


def test_central_names_the_service_and_links_directly_to_the_contextual_form():
    document = read(HUB)
    assert '<h1 class="t-service" id="service-title">Engenharia para condomínios' in document
    target = urlsplit(cta_href(document, "condominios-contact-calm"))
    params = parse_qs(target.query)
    assert target.path == "/"
    assert target.fragment == "contato"
    assert set(params) == {"jornada", "tema", "origem", "route_family", "asset_id"}
    assert params == {
        "jornada": ["outro"],
        "tema": ["Engenharia para condomínio"],
        "origem": ["/engenharia-condominios/"],
        "route_family": ["engenharia-condominios"],
        "asset_id": ["condominium_engineering_editorial_route_v1"],
    }
    assert 'href="https://wa.me/' in document
    assert 'href="mailto:' in document
    assert 'href="tel:' in document
    assert 'href="/triagem-tecnica/">Solicitar proposta' in document


def test_central_links_to_real_specialist_anchors():
    hub = read(HUB)
    destinations = {
        "/inspecao-diagnostico-edificacoes/#fissuras-infiltracoes": INSPECTION,
        "/inspecao-diagnostico-edificacoes/#reforma-condominio": INSPECTION,
        "/inspecao-diagnostico-edificacoes/#amostra-disponivel": INSPECTION,
        "/assistencia-tecnica-pericial-engenharia/#amostra-disponivel": ASSISTANCE,
    }
    for href, destination in destinations.items():
        assert f'href="{href}"' in hub
        fragment = href.rsplit("#", 1)[1]
        assert f'id="{fragment}"' in read(destination)


def test_specialist_pages_answer_purchase_questions_without_losing_general_buyers():
    inspection = read(INSPECTION)
    assistance = read(ASSISTANCE)
    for phrase in (
        "condomínios, proprietários, empresas, construtoras",
        "Como os honorários são definidos?",
        "A visita é sempre necessária?",
        "sem abandono depois do diagnóstico",
        "Fotografias localizam e registram sinais",
    ):
        assert phrase in inspection
    for phrase in (
        "partes, condomínios, empresas e advogados",
        "Preparação de quesitos",
        "Diligência pericial",
        "Análise do laudo",
        "verificação de conflito",
        "não promete decisão judicial",
    ):
        assert phrase in assistance
    for document in (inspection, assistance):
        assert "Cliente</dt><dd>Nenhum" not in document
        assert document.count("Exemplo demonstrativo") >= 2
        assert 'property="og:image"' in document
        assert 'name="twitter:card"' in document
        assert "FAQPage" in types(document)


def test_renderer_is_stable_with_the_new_route():
    result = subprocess.run(
        [sys.executable, "-X", "utf8", "scripts/site/render_institutional_service_pages.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip() == "OK 7"
