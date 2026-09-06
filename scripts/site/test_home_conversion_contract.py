"""Fail-closed contract for the MV-04 corporate home and services candidate."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"
SERVICES = ROOT / "servicos" / "index.html"
B2G_FORM_SHA256 = "0f49d7f5f23da5ecc2e58c282d0a57a3bd0d56aabdad678c53165ed85b5883a4"


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

    assert "Engenharia, Perícias e Inteligência Técnica" in hero
    assert "Do problema técnico" in hero
    assert "à decisão documentada" in hero
    assert "projetos, imóveis, obras, perícias, segurança do trabalho ou contratos públicos" in hero
    for deliverable in ("projeto", "orçamento", "laudo", "parecer", "plano de ação"):
        assert deliverable in hero
    assert "Engenharia Civil pela EESC-USP" in hero
    assert "CNPJ 52.407.089/0001-09" in hero
    assert 'href="#situacoes"' in hero
    assert hero.count("button-primary") == 1
    assert "PNCP" not in hero


def test_situation_chooser_has_five_paths_without_catalog_wall() -> None:
    chooser = _section(_home(), r'id="situacoes"')
    expected = (
        "Projetar, revisar, orçar ou compatibilizar",
        "Inspecionar, diagnosticar ou documentar obra e imóvel",
        "Perícia, assistência técnica ou avaliação",
        "Segurança do trabalho",
        "Licitação ou contrato de obra pública",
    )
    for label in expected:
        assert label in chooser
    assert chooser.count('class="situation-row') == 5
    assert chooser.count('href="/triagem-tecnica/#') == 4
    assert 'href="/servicos-obras-publicas/"' in chooser
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


def test_corporate_triage_is_safe_and_b2g_form_is_unchanged() -> None:
    html = _home()
    triage = _section(html, r'id="triagem-tecnica"')
    form = re.search(r'<form\b[^>]*id="formulario-contato"[\s\S]*?</form>', html)
    assert form

    assert "mailto:tiago.sasaki@confenge.com.br" in triage
    assert "wa.me/5548988344559" in triage
    assert "Não envie documentos sensíveis" in triage
    assert 'type="file"' not in html.lower()
    digest = hashlib.sha256(form.group(0).encode("utf-8")).hexdigest()
    assert digest == B2G_FORM_SHA256
    assert 'name="diagnostico-b2g"' in form.group(0)
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in form.group(0)


def test_services_hub_is_corporate_indexable_and_price_free() -> None:
    html = SERVICES.read_text(encoding="utf-8")
    assert 'content="index,follow" name="robots"' in html
    assert 'href="https://confenge.com.br/servicos/" rel="canonical"' in html
    assert "Serviços organizados por situação" in html
    assert html.count('class="corporate-service-row') == 5
    assert "/servicos-obras-publicas/" in html
    assert not re.search(r"R\$\s*\d", html)
    assert "campanha" not in html.lower()
    assert "família pública" not in html.lower()


if __name__ == "__main__":
    raise SystemExit(__import__("pytest").main([__file__, "-q"]))
