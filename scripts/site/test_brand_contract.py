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
    assert hero["h1"] in html or "Contrato rentável, sim" in html
    assert "Diretoria B2G fracionada" in html
    assert 'name="diagnostico-b2g"' in html
    assert 'id="estagio"' in html
    assert 'id="urgencia"' in html
    for o in brand["offers"]:
        assert o["url"] in html, o["url"]
    # FAQ sync
    for f in brand["faq"]:
        assert f["q"] in html


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
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "decis%C3%A3o%20cr%C3%ADtica" in html or "decisão crítica" in html.lower() or "decisao%20critica" in html.lower() or "decis%C3%A3o%20cr%C3%ADtica" in html
    # encoded critical decision message
    assert "wa.me/5548988344559" in html
    assert "cr%C3%ADtica" in html or "critica" in html.lower()


def test_radar_not_empty_wave_message():
    html = (ROOT / "radar" / "index.html").read_text(encoding="utf-8")
    assert "nenhum item publicado nesta onda" not in html.lower()
    assert "noindex" in html
    assert "Configurar meu radar" in html or "configurar meu radar" in html.lower()


def test_llms_positioning():
    text = (ROOT / "llms.txt").read_text(encoding="utf-8")
    assert "Diretoria B2G fracionada" in text
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


def test_faq_jsonld_matches_visible():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r'<script type="application/ld\+json">(\{.*?\})</script>', html, re.S)
    assert m, "jsonld missing"
    data = json.loads(m.group(1))
    faq = next((n for n in data.get("@graph", []) if n.get("@type") == "FAQPage"), None)
    assert faq
    questions = [q["name"] for q in faq["mainEntity"]]
    for q in questions:
        assert f"<summary>{q}</summary>" in html or q in html


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
