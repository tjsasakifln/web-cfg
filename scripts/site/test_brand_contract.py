"""Brand contract gates for CONFENGE value communication."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.brand import (  # noqa: E402
    approved_cases,
    commercial_pages,
    find_forbidden_in_text,
    load_brand,
    load_cases,
    load_proof,
    public_proof_claims,
    validate_brand_contract,
)


def test_brand_contract_valid():
    result = validate_brand_contract()
    assert result["ok"], result["errors"]


def test_public_proof_only_verified():
    claims = public_proof_claims()
    assert claims, "expected at least one public verified claim"
    for c in claims:
        assert c["status"] == "VERIFIED"
        assert c["public_allowed"] is True


def test_no_approved_fabricated_cases():
    cases = load_cases()
    for c in cases.get("cases") or []:
        if c.get("public_status") == "APPROVED":
            assert c.get("client_authorized") is True
            assert c.get("outcome")
    # Currently zero approved is OK
    assert approved_cases() == []


def _visible_home_text(html: str) -> str:
    """Texto que uma pessoa le na home: sem script, style, svg e sem tags."""
    import html as _h

    stripped = re.sub(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</\1>", " ", html)
    stripped = re.sub(r"(?s)<!--.*?-->", " ", stripped)
    return _h.unescape(re.sub(r"<[^>]+>", " ", stripped))

def test_home_has_canonical_copy():
    brand = load_brand()
    hero = brand["hero"]
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert hero["h1"] in html
    assert "Diretoria Fracionada para o Mercado Público" in html
    assert "Engenharia, Perícias e Inteligência Técnica" in html
    assert brand["positioning"]["org_description"] in html
    # 2026-09-08. Esta linha exigia o rotulo publico "Obras publicas e B2G".
    # B2G e vocabulario interno: nenhum comprador de obra procura por isso, e
    # a diretriz manda tirar a sigla de todo texto percebido pelo visitante.
    # A propriedade que a linha protegia -- a home precisa apresentar a
    # especialidade em obras publicas como secao propria, e nao dilui-la --
    # continua verificada, agora pelo texto que o comprador usa.
    assert "Especialidade em obras públicas" in html
    assert "Obras públicas: edital, proposta e contrato em execução." in html
    assert "B2G" not in _visible_home_text(html)
    assert 'name="diagnostico-b2g"' in html
    assert 'id="estagio"' in html
    assert 'id="urgencia"' in html
    assert 'data-form-multistep="true"' in html
    # Corporate chooser uses customer situations and keeps the B2G intake intact.
    assert "Projetar, revisar, orçar ou compatibilizar" in html
    assert "Perícia, assistência técnica ou avaliação" in html
    assert "Segurança do trabalho" in html
    assert "Conhecer os serviços" in html
    assert 'href="/servicos/#servico-projeto"' in html
    assert "Contrato sob pressão" in html
    assert "Edital e proposta" in html
    assert "Operação recorrente" in html
    assert "enviar documentos para análise" not in html.lower()
    assert "Sem CTA genérico" not in html
    for situation in brand.get("service_situations") or []:
        assert situation["label"] in html, situation["label"]
    for o in brand["offers"]:
        assert o["url"] in html, o["url"]
    assert 'id="triagem-tecnica"' in html


def test_offer_pages_exist_with_canonical():
    brand = load_brand()
    for o in brand["offers"]:
        rel = o["url"].strip("/") + "/index.html"
        path = ROOT / rel
        assert path.exists(), rel
        html = path.read_text(encoding="utf-8")
        assert f'rel="canonical" href="https://confenge.com.br{o["url"]}"' in html or f'href="https://confenge.com.br{o["url"]}"' in html
        assert o["name"] in html
        assert o["headline"] in html
        assert "application/ld+json" in html
        assert "extra-cli" not in html.lower()


def test_forbidden_phrases_on_commercial_pages():
    brand = load_brand()
    phrases = brand["forbidden_phrases"]
    pages = [
        ROOT / "index.html",
        ROOT / "diretoria-b2g" / "index.html",
        ROOT / "diagnostico-b2g-360" / "index.html",
        ROOT / "bid-room-licitacoes-obras" / "index.html",
        ROOT / "defesa-margem-contratos-publicos" / "index.html",
        ROOT / "inteligencia" / "index.html",
        ROOT / "radar" / "index.html",
        ROOT / "llms.txt",
    ]
    failures = []
    for p in pages:
        text = p.read_text(encoding="utf-8")
        hits = find_forbidden_in_text(text, phrases)
        # allow methodology page to discuss limits; commercial pages must be clean
        if hits:
            failures.append(f"{p.relative_to(ROOT)}: {hits}")
    assert not failures, failures


def test_org_description_consistent():
    brand = load_brand()
    org = brand["positioning"]["org_description"]
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert org in html
    shell = (ROOT / "scripts" / "pseo" / "html_shell.py").read_text(encoding="utf-8")
    # shell loads brand dynamically — ensure fallback matches thesis
    assert "Diretoria B2G" in shell or "org_description" in shell


def _home_whatsapp_links(html: str) -> list[tuple[str, str]]:
    """Cada link do WhatsApp da home com a tag de abertura e o texto decodificado."""
    import urllib.parse

    out = []
    for match in re.finditer(r"<a\b[^>]*wa\.me/5548988344559([^\"']*)[^>]*>", html):
        query = match.group(1).replace("&amp;", "&").lstrip("?")
        text = urllib.parse.parse_qs(query).get("text", [""])[0]
        out.append((match.group(0), text))
    return out


def test_whatsapp_contextual_on_home():
    """Todo canal de WhatsApp da home tem de chegar com contexto.

    Regra substituida (campanha 2026-09-10): a versao anterior exigia UMA de
    quatro frases congeladas de obra publica ("problema urgente", "decisao
    critica"). Isso obrigava o canal GERAL da home a declarar contrato publico,
    reclassificando a disciplina de quem chega com projeto, pericia ou seguranca
    do trabalho -- o proprio defeito que a campanha corrige.

    A regra que entra e mais forte, nao mais frouxa: em vez de UM link com uma
    frase especifica, TODOS os links precisam ser contextuais, seja pelo texto
    pre-escrito, seja porque o script preenche a mensagem com a situacao que o
    visitante acabou de escolher.
    """
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    links = _home_whatsapp_links(html)
    assert links, "a home precisa de pelo menos um canal de WhatsApp"

    for tag, text in links:
        scripted = "data-situation-whatsapp" in tag
        assert scripted or text.strip(), f"canal sem contexto: {tag[:120]}"

    prefilled = [text for _tag, text in links if text.strip()]
    assert prefilled, "nenhum canal chega com mensagem escrita"
    # O contexto tem de nomear a situacao em palavras do visitante, sem prender
    # a home a uma unica disciplina.
    assert any(
        re.search(r"projeto|servi[çc]o de engenharia|situa[çc][ãa]o t[ée]cnica|obra|im[óo]vel|per[íi]cia", t, re.I)
        for t in prefilled
    ), prefilled


def test_radar_not_empty_wave_message():
    html = (ROOT / "radar" / "index.html").read_text(encoding="utf-8")
    assert "nenhum item publicado nesta onda" not in html.lower()
    assert "noindex" in html
    assert "Configurar meu radar" in html or "configurar meu radar" in html.lower()
    assert "preview (revisão)" not in html.lower()
    # Must survive build:site — source template in build.py
    build_src = (ROOT / "scripts" / "pseo" / "build.py").read_text(encoding="utf-8")
    assert "Configurar meu radar de oportunidades" in build_src
    assert "Radar evergreen de oportunidades" not in build_src


def test_inteligencia_hub_decision_copy():
    html = (ROOT / "inteligencia" / "index.html").read_text(encoding="utf-8")
    assert "O mercado público deixa rastros" in html
    assert "critérios de evidência" not in html.lower()
    assert "revisão editorial" not in html.lower()
    assert "sem ranking proprietário" not in html.lower()
    build_src = (ROOT / "scripts" / "pseo" / "build.py").read_text(encoding="utf-8")
    assert "O mercado público deixa rastros" in build_src
    assert "critérios de evidência" not in build_src
    assert "sem ranking proprietário" not in build_src


def _llms_positioning_errors(text: str) -> set[str]:
    lower = text.lower()
    errors = set()
    if not re.search(r"obras? públicas? e privadas?", lower):
        errors.add("corporate_public_private_scope_missing")
    if "https://confenge.com.br/servicos/" not in text:
        errors.add("corporate_services_missing")
    if "obras públicas são uma especialidade" not in lower or "/servicos-obras-publicas/" not in text:
        errors.add("legitimate_public_works_vertical_missing")
    if not all(
        path in text
        for path in (
            "/servicos/#servico-projeto",
            "/servicos/#servico-diagnostico",
            "/servicos/#servico-pericia",
            "/servicos/#servico-sst",
            "/quantitativos-orcamento-obras/",
            "/entregas/",
        )
    ):
        errors.add("service_or_delivery_path_missing")
    if not all(audience in lower for audience in ("pessoas físicas", "condomínios", "empresas", "órgãos públicos")):
        errors.add("inclusive_audience_missing")
    if "tiago.sasaki@confenge.com.br" not in lower or "+55 48 98834-4559" not in text:
        errors.add("direct_contact_missing")
    if "não recebe arquivos" not in lower or "não conclui contratação" not in lower:
        errors.add("contact_boundary_missing")
    if "exclusivamente obras públicas" in lower or "somente construtoras" in lower:
        errors.add("corporate_scope_narrowed_to_b2g")
    return errors


def test_llms_positioning():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert _llms_positioning_errors(text) == set()
    assert "Diretoria Fracionada para o Mercado Público" in text
    assert "/diretoria-b2g/" in text
    assert "lance ótimo" not in text.lower() or "não" in text.lower()
    assert "extra-cli" not in text.lower()

    catalog = (ROOT / "entregas" / "index.html").read_text(encoding="utf-8")
    cards = re.findall(
        r'<article\b[^>]*data-public-state="PUBLISHED"[^>]*>(.*?)</article>',
        catalog,
        re.I | re.S,
    )
    assert len(cards) == 8
    for card in cards:
        name = re.search(r"<h2\b[^>]*>([^<]+)</h2>", card, re.I)
        price = re.search(r'class="vitrine-item__price"[\s\S]*?<strong>(R\$\s*[\d.]+)</strong>', card, re.I)
        assert name and price
        assert name.group(1).strip() in text
        assert price.group(1).strip() in text


def test_llms_scope_guard_rejects_b2g_only_but_accepts_a_legitimate_vertical():
    b2g_only = """
    # CONFENGE
    Consultoria exclusivamente para obras públicas e somente construtoras.
    Serviços: https://confenge.com.br/servicos-obras-publicas/
    """
    assert "corporate_public_private_scope_missing" in _llms_positioning_errors(b2g_only)
    assert "corporate_scope_narrowed_to_b2g" in _llms_positioning_errors(b2g_only)

    current = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "legitimate_public_works_vertical_missing" not in _llms_positioning_errors(current)
    assert "corporate_scope_narrowed_to_b2g" not in _llms_positioning_errors(current)


def test_sitemap_includes_offers():
    sm = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    for path in (
        "/diagnostico-b2g-360/",
        "/diretoria-b2g/",
        "/bid-room-licitacoes-obras/",
        "/defesa-margem-contratos-publicos/",
    ):
        assert f"https://confenge.com.br{path}" in sm


def test_pillar_urls_preserved():
    for slug in (
        "medicoes-glosas-obras-publicas",
        "aditivos-obras-publicas",
        "reequilibrio-obras-publicas",
        "defesa-tecnica-contratos-publicos",
        "acompanhamento-contratos-obras",
        "atrasos-prorrogacao-obras-publicas",
        "diagnostico-pre-licitacao",
        "auditoria-orcamento-licitacao",
    ):
        p = ROOT / slug / "index.html"
        assert p.exists()
        html = p.read_text(encoding="utf-8")
        assert f"https://confenge.com.br/{slug}/" in html
        assert "commercial-bridge" in html


def test_content_not_overwhelmed_by_sales_copy():
    """Technical guides must retain informational focus — sample check."""
    sample = ROOT / "conteudos"
    if not sample.exists():
        return
    guides = list(sample.glob("*/index.html"))[:5]
    for g in guides:
        html = g.read_text(encoding="utf-8")
        # guides should not become pure sales landing pages
        sales_markers = html.lower().count("diagnosticar minha operação")
        assert sales_markers <= 3, f"{g} over-commercialized"


def test_home_jsonld_matches_corporate_positioning_and_preserves_b2g_services():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r'<script type="application/ld\+json">(\{.*?\})</script>', html, re.S)
    assert m, "jsonld missing"
    data = json.loads(m.group(1))
    graph = data.get("@graph", [])
    org = next(n for n in graph if n.get("@type") == "Organization")
    person = next(n for n in graph if n.get("@type") == "Person")
    assert org["description"] == load_brand()["positioning"]["org_description"]
    assert person["jobTitle"] == "Engenheiro Civil"
    assert "consultor B2G" not in person["jobTitle"]
    service_urls = {n.get("url") for n in graph if n.get("@type") == "Service"}
    assert "https://confenge.com.br/diretoria-b2g/" in service_urls
    assert "https://confenge.com.br/bid-room-licitacoes-obras/" in service_urls


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    sys.exit(1 if failed else 0)
