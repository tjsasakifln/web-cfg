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


def test_home_has_canonical_copy():
    brand = load_brand()
    hero = brand["hero"]
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert hero["h1"] in html
    assert "Diretoria Fracionada para o Mercado Público" in html
    assert "Engenharia, Perícias e Inteligência Técnica" in html
    assert brand["positioning"]["org_description"] in html
    assert "Obras públicas e B2G" in html
    assert 'name="diagnostico-b2g"' in html
    assert 'id="estagio"' in html
    assert 'id="urgencia"' in html
    assert 'data-form-multistep="true"' in html
    # Corporate chooser uses customer situations and keeps the B2G intake intact.
    assert "Projetar, revisar, orçar ou compatibilizar" in html
    assert "Perícia, assistência técnica ou avaliação" in html
    assert "Segurança do trabalho" in html
    assert "Escolher minha situação" in html
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


def test_whatsapp_contextual_on_home():
    """Every home WhatsApp link must open with context, not a bare number.

    This used to be satisfied by one of four B2G phrases ("problema urgente",
    "decisão crítica", ...). #616 neutralised the contact channel because it was
    announcing an urgent public-contract problem on a form that now serves five
    nuclei, and forcing a B2G phrase back would recreate exactly that. The
    property worth protecting is that the visitor arrives in the conversation
    with their situation already stated, whatever the situation is.
    """
    import urllib.parse

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "wa.me/5548988344559" in html

    links = re.findall(r'href="(https://wa\.me/5548988344559[^"]*)"', html)
    assert links, "the home has no WhatsApp link"
    for link in links:
        query = urllib.parse.urlparse(link).query
        text = urllib.parse.parse_qs(query).get("text", [""])[0]
        assert len(text) >= 40, f"WhatsApp link opens with no usable context: {link}"
        # It must name a situation, not merely greet.
        assert re.search(
            r"situa[çc][ãa]o|demanda|problema|contrato|obra|per[íi]cia|avalia[çc][ãa]o|"
            r"seguran[çc]a do trabalho|quantitativos|or[çc]amento",
            text,
            re.IGNORECASE,
        ), f"WhatsApp prefill states no situation: {text}"


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


def test_llms_positioning():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "Diretoria Fracionada para o Mercado Público" in text
    assert "/diretoria-b2g/" in text
    assert "lance ótimo" not in text.lower() or "não" in text.lower()
    assert "extra-cli" not in text.lower()


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
