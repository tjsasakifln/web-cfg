import html
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from scripts.site.apply_article_pillar_form import service_map, transform
from scripts.site.inbound_first_remediate import LEAD_INLINE_RE, inject_journey_cta
from scripts.site.version_commercial_media import load_commercial_media


ROOT = Path(__file__).resolve().parents[3]
APPEAL = "/conteudos/recurso-inabilitacao-tecnica-licitacao/"
GUIDE = "gestao-contrato-obra-publica-indicadores"
RETIRED = f"assets/conteudos/{GUIDE}.jpg"


def _page(route):
    return (ROOT / route.strip("/") / "index.html").read_text(encoding="utf-8")


def _lead(page):
    return LEAD_INLINE_RE.search(page).group(0)


def test_appeal_contact_is_for_the_open_case_not_the_next_bid():
    page = _page(APPEAL)
    next_step = _lead(page)
    links = [urlsplit(html.unescape(href)) for href in re.findall(r'href="([^"]+)"', next_step)]
    whatsapp, email = links
    assert (whatsapp.scheme, whatsapp.netloc) == ("https", "wa.me")
    assert (email.scheme, email.path) == ("mailto", "tiago.sasaki@confenge.com.br")
    context = parse_qs(email.query)
    assert "inabilitação" in context["subject"][0]
    assert "Data da intimação" in context["body"][0]
    assert "Motivo registrado" in context["body"][0]
    assert "Atestado ou requisito questionado" in context["body"][0]
    assert "Continuar pelo formulário" not in next_step
    assert "Nas licitações seguintes, o <a href=\"/diagnostico-pre-licitacao/\">" in page


def test_remediation_preserves_context_and_does_not_reintroduce_pre_bid_form():
    page = _page(APPEAL)
    brand = {"journeys": [{"id": "edital"}]}
    overrides, labels = service_map()
    transformed, _ = transform(APPEAL.strip("/").split("/")[-1], page, overrides, labels)
    assert _lead(transformed) == _lead(page)
    assert _lead(inject_journey_cta(page, brand, "edital", "inabilitação", APPEAL)) == _lead(page)
    wrong_form = re.sub(r'href="mailto:[^"]+"', 'href="/diagnostico-pre-licitacao/#captura-pilar"', _lead(page))
    with pytest.raises(ValueError, match="Contato contextual inválido"):
        inject_journey_cta(page.replace(_lead(page), wrong_form), brand, "edital", "inabilitação", APPEAL)


def test_contract_indicators_share_the_pillars_current_card():
    guide = _page(f"/conteudos/{GUIDE}/")
    pillar = _page("/acompanhamento-contratos-obras/")
    expected = re.search(r'property="og:image" content="([^"]+)"', pillar)[1]
    actual = re.search(r'<meta content="([^"]+)" property="og:image"', guide)[1]
    schema = next(
        node for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', guide, re.S)
        for node in json.loads(raw).get("@graph", []) if node["@type"] == "Article"
    )
    assert actual == expected == schema["image"]
    assert (ROOT / urlsplit(actual).path.lstrip("/")).is_file()
    assert RETIRED not in guide
    assert RETIRED not in {asset["target"] for asset in load_commercial_media(ROOT)}
    title = json.loads((ROOT / "seo/content-map.json").read_text(encoding="utf-8"))[GUIDE]["title"]
    assert title == schema["headline"]
