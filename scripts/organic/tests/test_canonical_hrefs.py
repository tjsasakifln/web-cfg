"""Canonical internal hrefs: attribution off the URL, on data-*."""

from __future__ import annotations

from pathlib import Path

from scripts.organic.canonical_hrefs import (
    FROZEN_HTML_REL,
    HASH_PINNED_HTML_REL,
    canonicalize_href,
    is_functional_query_href,
    parameterized_internal_hrefs,
    rewrite_html,
    rewrite_public_html,
    scan_public_parameterized_hrefs,
)


def test_canonicalize_strips_attribution_query_and_hash_query():
    clean, attrs = canonicalize_href(
        "/?tema=SINAPI&origem=/conteudos/sinapi/#contato"
    )
    assert clean == "/#contato"
    assert attrs["data-tema"] == "SINAPI"
    assert attrs["data-origem"] == "/conteudos/sinapi/"

    clean2, attrs2 = canonicalize_href("/#contato?jornada=contrato")
    assert clean2 == "/#contato"
    assert attrs2["data-journey"] == "contrato"

    clean3, attrs3 = canonicalize_href(
        "/diagnostico-pre-licitacao/?origem=/conteudos/empreitada-preco-global-preco-unitario"
    )
    assert clean3 == "/diagnostico-pre-licitacao/"
    assert attrs3["data-origem"] == "/conteudos/empreitada-preco-global-preco-unitario"

    clean4, attrs4 = canonicalize_href("/correcoes/?asset=sinapi")
    assert clean4 == "/correcoes/"
    assert attrs4["data-asset-id"] == "sinapi"


def test_market_answer_stratum_is_documented_functional_exception():
    href = "/inteligencia/valor-tipico-contratos-pavimentacao/?stratum=sc-municipal"
    assert is_functional_query_href(href) is True
    assert is_functional_query_href("/piloto/ofertas/contratar/?plano=CFG-DIAG-EXP-v1") is True
    assert is_functional_query_href("/conteudos/x/?origem=/y/") is False
    assert is_functional_query_href("/inteligencia/valor-tipico-contratos-pavimentacao/?stratum=sc-municipal&origem=/x/") is False
    assert is_functional_query_href("/conteudos/x/?plano=CFG-DIAG-EXP-v1") is False

    functional = f'<a href="{href}">filtrar</a>'
    assert rewrite_html(functional) == functional


def test_unknown_query_is_flagged_but_not_destructively_rewritten():
    html = '<a href="/ferramentas/?estado=aberto">filtrar</a>'
    assert rewrite_html(html) == html
    assert parameterized_internal_hrefs(html) == ["/ferramentas/?estado=aberto"]


def test_external_wa_and_mailto_are_untouched():
    wa = "https://wa.me/5548988344559?text=Ola"
    clean, attrs = canonicalize_href(wa)
    assert clean == wa
    assert attrs == {}
    mail = "mailto:tiago.sasaki@confenge.com.br?subject=Contato"
    assert canonicalize_href(mail) == (mail, {})


def test_rewrite_html_moves_query_to_data_attrs():
    html = (
        '<a class="button" href="/?tema=Aditivo&amp;origem=/conteudos/x/#contato">'
        "Formulário</a>"
    )
    out = rewrite_html(html)
    assert 'href="/#contato"' in out
    assert "data-tema=" in out
    assert "data-origem=" in out
    assert "?" not in parameterized_internal_hrefs(out)


def test_rewrite_does_not_duplicate_existing_data_attr():
    html = '<a data-origem="/already/" href="/svc/?origem=/conteudos/x/">x</a>'
    out = rewrite_html(html)
    assert out.count("data-origem=") == 1
    assert 'href="/svc/"' in out


def test_scan_flags_internal_query_but_exempts_frozen_html(tmp_path: Path):
    page = tmp_path / "conteudos" / "x" / "index.html"
    page.parent.mkdir(parents=True)
    page.write_text(
        '<a href="/?tema=x&origem=/conteudos/x/#contato">go</a>',
        encoding="utf-8",
    )
    frozen = tmp_path / "diagnostico-b2g-360" / "index.html"
    frozen.parent.mkdir(parents=True)
    frozen.write_text(
        '<a href="/#contato?jornada=operacao">go</a>',
        encoding="utf-8",
    )
    hits = scan_public_parameterized_hrefs(tmp_path)
    by_path = {h["path"]: h for h in hits}
    assert by_path["conteudos/x/index.html"]["exception"] is None
    assert by_path["diagnostico-b2g-360/index.html"]["exception"] == "frozen_html"
    assert FROZEN_HTML_REL


def test_frozen_and_hash_bound_exceptions_are_key_scoped(tmp_path: Path):
    frozen = tmp_path / "diagnostico-b2g-360" / "index.html"
    frozen.parent.mkdir(parents=True)
    frozen.write_text('<a href="/#contato?debug=1">go</a>', encoding="utf-8")
    hash_bound = tmp_path / "analises-contratos-publicos" / "x" / "index.html"
    hash_bound.parent.mkdir(parents=True)
    hash_bound.write_text(
        '<a href="/ferramentas/?analysis_id=x&debug=1">go</a>',
        encoding="utf-8",
    )
    hits = scan_public_parameterized_hrefs(tmp_path)
    assert len(hits) == 2
    assert all(hit["exception"] is None for hit in hits)


def test_issue_389_hash_pin_is_exact_and_key_scoped(tmp_path: Path):
    rel = "conteudos/glosa-de-medicao-obra-publica/index.html"
    pinned = tmp_path / rel
    pinned.parent.mkdir(parents=True)
    pinned.write_text(
        '<a href="/?tema=glosa&origem=/conteudos/glosa/#contato">go</a>',
        encoding="utf-8",
    )
    hit = scan_public_parameterized_hrefs(tmp_path)[0]
    assert rel in HASH_PINNED_HTML_REL
    assert hit["exception"] == "hash_pinned_html"

    pinned.write_text('<a href="/?tema=glosa&debug=1#contato">go</a>', encoding="utf-8")
    hit = scan_public_parameterized_hrefs(tmp_path)[0]
    assert hit["exception"] is None


def test_rewrite_public_html_skips_frozen_pillars(tmp_path: Path):
    frozen_rel = "diagnostico-b2g-360/index.html"
    frozen = tmp_path / frozen_rel
    frozen.parent.mkdir(parents=True)
    original = '<a href="/#contato?jornada=operacao">go</a>'
    frozen.write_text(original, encoding="utf-8")
    other = tmp_path / "conteudos" / "y" / "index.html"
    other.parent.mkdir(parents=True)
    other.write_text('<a href="/svc/?origem=/conteudos/y/">go</a>', encoding="utf-8")
    report = rewrite_public_html(tmp_path)
    assert frozen_rel in report["skipped_frozen"]
    assert frozen.read_text(encoding="utf-8") == original
    rewritten = other.read_text(encoding="utf-8")
    assert 'href="/svc/"' in rewritten
    assert "data-origem=" in rewritten
