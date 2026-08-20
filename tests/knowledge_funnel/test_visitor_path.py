"""Visitor-path canary: article → pillar → offer → conversion CTA.

Reads live in-repo HTML. Does not simulate GSC or a founder sale.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ARTICLE = ROOT / "conteudos/resposta-notificacao-atraso-obra-publica/index.html"
PILLAR = ROOT / "defesa-tecnica-contratos-publicos/index.html"
OFFER = ROOT / "defesa-margem-contratos-publicos/index.html"

ARTICLE_HREF = "/defesa-tecnica-contratos-publicos/"
PILLAR_OFFER_HREF = "/defesa-margem-contratos-publicos/"
OFFER_CTA_NEEDLES = (
    "offer_cta_click",
    "wa.me/5548988344559",
    "/#contato",
)


def test_visitor_path_article_to_pillar_to_offer_cta() -> None:
    article = ARTICLE.read_text(encoding="utf-8")
    pillar = PILLAR.read_text(encoding="utf-8")
    offer = OFFER.read_text(encoding="utf-8")

    assert ARTICLE.is_file()
    assert PILLAR.is_file()
    assert OFFER.is_file()
    assert ARTICLE_HREF in article
    assert PILLAR_OFFER_HREF in pillar
    assert any(needle in offer for needle in OFFER_CTA_NEEDLES)
    assert "button-primary" in offer
    for blob in (article, pillar, offer):
        assert "smartlic" not in blob.lower()
