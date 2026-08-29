"""Regression contract for prose-safe wrapping of opaque identifiers."""

from scripts.site.responsive_text import (
    escape_prose_with_opaque_tokens,
    mark_opaque_tokens_in_html_text,
)


def test_opaque_tokens_opt_in_without_marking_normal_words():
    rendered = escape_prose_with_opaque_tokens(
        "Fonte https://pncp.gov.br/api/contratos/2026/69; "
        "publication_authorization=false e Superintendencia continuam legíveis."
    )

    assert '<span data-opaque-token>https://pncp.gov.br/api/contratos/2026/69</span>;' in rendered
    assert '<span data-opaque-token>publication_authorization=false</span>' in rendered
    assert '<span data-opaque-token>Superintendencia</span>' not in rendered


def test_hash_campaign_and_epistemic_flags_are_opaque_and_html_is_escaped():
    digest = "64a238e6094f4d093f1ee970820fd277bcd34a66457d776a59225219b8e77604"
    rendered = escape_prose_with_opaque_tokens(
        f"{digest}, CONFENGE-WEB-CONTRACT-ANALYSIS-V2-CURRENT-MAIN-01: "
        "FACT/CALCULATION/INFERENCE/UNKNOWN <script>"
    )

    assert f'<span data-opaque-token>{digest}</span>,' in rendered
    assert '<span data-opaque-token>CONFENGE-WEB-CONTRACT-ANALYSIS-V2-CURRENT-MAIN-01</span>:' in rendered
    assert '<span data-opaque-token>FACT/CALCULATION/INFERENCE/UNKNOWN</span>' in rendered
    assert "&lt;script&gt;" in rendered


def test_existing_entities_are_preserved_when_marking_built_html():
    rendered = mark_opaque_tokens_in_html_text(
        "R$&nbsp;2.900 e https://confenge.com.br/a/?x=1&amp;y=2"
    )

    assert "R$&nbsp;2.900" in rendered
    assert "&amp;y=2</span>" in rendered
    assert "&amp;amp;" not in rendered


def test_natural_slash_compounds_and_atomic_prices_are_not_opaque():
    rendered = mark_opaque_tokens_in_html_text(
        "engenharia/serviços e proposta/orçamento-base por R$&nbsp;120,00/m²"
    )

    assert "data-opaque-token" not in rendered
