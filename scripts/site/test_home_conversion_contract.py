"""Fail-closed contract for the MV-04 corporate home and services candidate."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "index.html"
SERVICES = ROOT / "servicos" / "index.html"


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
    assert 'href="/quantitativos-orcamento-obras/"' in chooser
    assert chooser.count('href="/triagem-tecnica/#') == 3
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
    body = form.group(0)
    # This assertion used to be a sha256 equality against a pinned digest of the
    # whole form. That froze every byte of its copy, including the pre-form value
    # that told a private visitor CONFENGE would "separar edital, contrato e
    # operação" -- so the guard protecting the form's SAFETY was also protecting
    # its worst sentence, and any honest correction read as a regression. The
    # safety properties the test name claims are now asserted directly, and the
    # capture's coverage of the canonical nuclei is asserted in
    # tests/intake/test_home_capture_covers_all_nuclei.mjs.
    assert 'name="diagnostico-b2g"' in body
    assert 'name="document_intent" type="hidden" value="secure_channel_request"' in body
    # No file upload and no sensitive field may appear on the corporate capture.
    assert 'type="file"' not in body.lower()
    field_names = {name.lower() for name in re.findall(r'name="([^"]+)"', body)}
    forbidden_fields = {
        "cpf", "cnpj", "rg", "processo", "numero_processo", "prontuario",
        "prontuário", "laudo", "arquivo", "upload", "endereco", "endereço",
    }
    assert not (field_names & forbidden_fields), sorted(field_names & forbidden_fields)
    # Consent, honeypot and the receipt contract must all survive any rewrite.
    assert 'name="consentimento"' in body
    assert 'class="honeypot"' in body
    assert 'data-receipt-required="true"' in body
    assert 'data-form-contract="next-state/v1"' in body
    # Every situation offered must declare both its journey and its canonical
    # nucleus, so no option can be added that reaches the lead function
    # unlabelled or outside the taxonomy.
    stage_select = re.search(r'<select id="estagio"[\s\S]*?</select>', body)
    assert stage_select, "the situation select is missing from the corporate capture"
    options = re.findall(r'<option\b[^>]*value="[^"]+"[^>]*>', stage_select.group(0))
    assert len(options) >= 10, f"situation options collapsed to {len(options)}"
    # Values, not just attribute presence: asserting that data-journey= appears
    # would pass with every option set to the same journey, or with a nucleus
    # that is not a nucleus at all.
    canonical_journeys = {"edital", "contrato", "operacao", "outro"}
    canonical_nuclei = {
        "public_works_b2g",
        "building_engineering_documentation",
        "expert_evidence_assistance",
        "property_valuation",
        "occupational_safety",
        "other_technical_need",
    }
    seen_nuclei = set()
    for option in options:
        journey = re.search(r'data-journey="([^"]*)"', option)
        nucleus = re.search(r'data-nucleus="([^"]*)"', option)
        assert journey and journey.group(1) in canonical_journeys, option
        assert nucleus and nucleus.group(1) in canonical_nuclei, option
        seen_nuclei.add(nucleus.group(1))
        # The journey must match the nucleus, or the set could be flattened to a
        # single journey and still satisfy a membership check. A public-works
        # option filed as "outro" loses its confirmation page; a private option
        # filed as a B2G journey is the original defect.
        if nucleus.group(1) == "public_works_b2g":
            assert journey.group(1) in {"edital", "contrato", "operacao"}, option
        else:
            assert journey.group(1) == "outro", option
    assert seen_nuclei == canonical_nuclei, sorted(canonical_nuclei - seen_nuclei)

    # The sha256 freeze also pinned the form's transport. Those attributes decide
    # where a submission goes and whether it is acknowledged, so they are named
    # here rather than left to the removed hash.
    for attribute in (
        'action="/obrigado"',
        'method="POST"',
        'data-ajax="true"',
        'data-runtime-profile="shared_lead_form_v1"',
        'data-next-state-profile="general_triage"',
    ):
        assert attribute in body, attribute
    # The stage values lead-core.cjs keys its nucleus map on must not drift.
    for stage_value in (
        "problema urgente em contrato",
        "edital ou proposta em análise",
        "estruturando a operação no mercado público",
        "escolhendo oportunidades",
        "contrato em execução",
    ):
        assert f'value="{stage_value}"' in body, stage_value


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
