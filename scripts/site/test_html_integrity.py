#!/usr/bin/env python3
"""Adversarial tests for the sitewide HTML/FAQ integrity gate."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.html_integrity import audit_html, audit_surface, source_html_files  # noqa: E402
from scripts.site.svg_sprite import ensure_sprite  # noqa: E402


def document(body: str, *, schema: dict | None = None) -> str:
    jsonld = (
        '<script type="application/ld+json">'
        + json.dumps(schema, ensure_ascii=False)
        + "</script>"
        if schema
        else ""
    )
    return f'<!doctype html><html lang="pt-BR"><head>{jsonld}</head><body><main>{body}</main></body></html>'


def faq_schema() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f"Pergunta {index}?",
                "acceptedAnswer": {"@type": "Answer", "text": f"Resposta {index}."},
            }
            for index in range(1, 4)
        ],
    }


def codes(path: Path) -> set[str]:
    findings, _, _ = audit_html(path)
    return {finding.code for finding in findings}


def test_truncated_document_fails_closed(tmp: Path) -> None:
    path = tmp / "truncated.html"
    path.write_text('<!doctype html><html><body><main><p>cortado</p>', encoding="utf-8")
    observed = codes(path)
    assert "html_not_closed_once" in observed, observed
    assert "body_not_closed_once" in observed, observed
    assert "main_unbalanced" in observed, observed


def test_partial_disclosure_fails_schema_dom_parity(tmp: Path) -> None:
    path = tmp / "partial.html"
    path.write_text(
        document(
            "<details><summary>Pergunta 1?</summary><p>Resposta 1.</p></details>",
            schema=faq_schema(),
        ),
        encoding="utf-8",
    )
    observed = codes(path)
    assert "faq_question_not_in_details" in observed, observed


def test_empty_disclosure_answer_fails(tmp: Path) -> None:
    path = tmp / "empty-answer.html"
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [faq_schema()["mainEntity"][0]],
    }
    path.write_text(
        document("<details><summary>Pergunta 1?</summary><p></p></details>", schema=schema),
        encoding="utf-8",
    )
    assert "faq_answer_missing_from_details" in codes(path)


def test_disclosure_answer_must_match_jsonld(tmp: Path) -> None:
    path = tmp / "mismatched-answer.html"
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [faq_schema()["mainEntity"][0]],
    }
    path.write_text(
        document(
            "<details><summary>Pergunta 1?</summary><p>Resposta diferente.</p></details>",
            schema=schema,
        ),
        encoding="utf-8",
    )
    assert "faq_answer_not_in_details" in codes(path)


def test_noindex_disclosure_debt_does_not_block_publication(tmp: Path) -> None:
    path = tmp / "noindex-mismatched-answer.html"
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [faq_schema()["mainEntity"][0]],
    }
    html = document(
        "<details><summary>Pergunta 1?</summary><p>Resposta diferente.</p></details>",
        schema=schema,
    ).replace("<head>", '<head><meta content="noindex,follow" name="robots">')
    path.write_text(html, encoding="utf-8")
    assert codes(path) == set()


def test_direct_answer_dom_is_supported(tmp: Path) -> None:
    path = tmp / "direct.html"
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": "Qual é a resposta?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Primeiro fato. Segundo limite.",
                },
            }
        ],
    }
    path.write_text(
        document(
            "<h1>Qual é a resposta?</h1><p>Primeiro fato.</p><p>Apoio.</p><p>Segundo limite.</p>",
            schema=schema,
        ),
        encoding="utf-8",
    )
    assert codes(path) == set()


def test_source_census_is_derived(tmp: Path) -> None:
    page = tmp / "conteudos" / "familia-nova" / "index.html"
    page.parent.mkdir(parents=True)
    page.write_text(document("<h1>Família nova</h1>"), encoding="utf-8")
    assert source_html_files(tmp) == [page]
    report = audit_surface(tmp, surface="source")
    assert report["ok"], report
    assert report["html_files"] == 1


MENU_BUTTON = (
    '<button aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menu" '
    'class="menu-toggle" type="button">'
    '<svg class="icon menu-open"><use href="#i-menu"></use></svg>'
    '<svg class="icon menu-close"><use href="#i-close"></use></svg>'
    "</button>"
)


def test_use_without_symbol_fails_closed(tmp: Path) -> None:
    """An icon referenced but never defined renders empty and reports nothing.

    Counter-case for the 14 pages that shipped an invisible hamburger button.
    """
    path = tmp / "icon-without-symbol.html"
    path.write_text(document(MENU_BUTTON), encoding="utf-8")
    observed = codes(path)
    assert "svg_symbol_undefined" in observed, observed
    findings, _, _ = audit_html(path)
    assert {finding.detail for finding in findings if finding.code == "svg_symbol_undefined"} == {
        "#i-menu",
        "#i-close",
    }, findings


def test_symbol_defined_in_the_same_document_passes(tmp: Path) -> None:
    path = tmp / "icon-with-symbol.html"
    path.write_text(ensure_sprite(document(MENU_BUTTON)), encoding="utf-8")
    assert "svg_symbol_undefined" not in codes(path)


def test_sprite_writer_is_idempotent_and_adds_only_what_is_used(tmp: Path) -> None:
    once = ensure_sprite(document(MENU_BUTTON))
    assert once.count('id="i-menu"') == 1, once
    assert once.count('id="i-close"') == 1, once
    # A page that never draws the arrow must not carry the arrow symbol.
    assert 'id="i-arrow"' not in once, once
    assert ensure_sprite(once) == once


def test_sprite_writer_refuses_an_unknown_reference(tmp: Path) -> None:
    """A typo in <use> is a defect to report, never a glyph to invent."""
    try:
        ensure_sprite(document('<svg class="icon"><use href="#i-nao-existe"></use></svg>'))
    except KeyError as exc:
        assert "i-nao-existe" in str(exc), exc
    else:
        raise AssertionError("ensure_sprite accepted an unknown symbol id")



def main() -> int:
    with tempfile.TemporaryDirectory(prefix="confenge-html-integrity-") as directory:
        tmp = Path(directory)
        test_truncated_document_fails_closed(tmp)
        test_partial_disclosure_fails_schema_dom_parity(tmp)
        test_empty_disclosure_answer_fails(tmp)
        test_disclosure_answer_must_match_jsonld(tmp)
        test_noindex_disclosure_debt_does_not_block_publication(tmp)
        test_direct_answer_dom_is_supported(tmp)
        test_source_census_is_derived(tmp)
        test_use_without_symbol_fails_closed(tmp)
        test_symbol_defined_in_the_same_document_passes(tmp)
        test_sprite_writer_is_idempotent_and_adds_only_what_is_used(tmp)
        test_sprite_writer_refuses_an_unknown_reference(tmp)
    print("HTML_INTEGRITY_TESTS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
