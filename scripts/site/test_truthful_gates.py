#!/usr/bin/env python3
"""Adversarial fixtures for copy, SEO mold, 8↔54, layout and census scope.

Drives the shipped functions. A passing run here with a broken scanner is a
test defect; the fixtures must go red when the leak is reintroduced.
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.audit_performance import evaluate_performance  # noqa: E402
from scripts.site.commercial_surface_truth import (  # noqa: E402
    evaluate_commercial_html,
    evaluate_commercial_site,
    load_registry,
)
from scripts.site.layout_truth import evaluate_layout_html  # noqa: E402
from scripts.site.public_copy_scope import (  # noqa: E402
    published_gate_census,
    visible_text,
    visitor_facing_html_files,
    visitor_facing_routes,
)
from scripts.site.seo_molds import (  # noqa: E402
    editorial_corpus_findings,
    editorial_mold_findings,
)
from scripts.site.test_copy_gates import evaluate_copy_html  # noqa: E402

FIXTURES = ROOT / "scripts" / "site" / "fixtures" / "truthful_gates"


def _read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_forbidden_phrase_fixture_fails_shipped_copy_scanner():
    html = _read("forbidden-phrase.html")
    hits = evaluate_copy_html(html, "scripts/site/fixtures/truthful_gates/forbidden-phrase.html")
    assert hits, hits
    assert any("Conversão com utilidade real" in hit for hit in hits)


def test_copy_gates_have_no_skip_xfail_or_broad_allowlist():
    source = (ROOT / "scripts" / "site" / "test_copy_gates.py").read_text(encoding="utf-8")
    assert "pytest.skip(" not in source
    assert "pytest.xfail(" not in source
    assert "@pytest.mark.skip" not in source
    assert "@pytest.mark.xfail" not in source
    exceptions = json.loads((ROOT / "data" / "site" / "copy-exceptions.json").read_text(encoding="utf-8"))
    for row in exceptions.get("exceptions") or []:
        path = str(row.get("path") or "")
        assert "*" not in path and "?" not in path, path
        assert not path.endswith("/"), path


def test_count_8_vs_54_fixture_fails():
    html = _read("count-8-vs-54.html")
    findings = evaluate_commercial_html(html, load_registry())
    assert findings, findings
    assert any("8↔54" in row for row in findings), findings


def test_commercial_truth_scans_every_indexable_public_page():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        registry_path = root / "data" / "commercial" / "deliverables-registry.v1.json"
        registry_path.parent.mkdir(parents=True)
        registry_path.write_text(
            (ROOT / "data" / "commercial" / "deliverables-registry.v1.json").read_text(
                encoding="utf-8"
            ),
            encoding="utf-8",
        )
        route = root / "nova-oferta"
        route.mkdir()
        (route / "index.html").write_text(
            '<html><head><title>54 entregas da CONFENGE</title>'
            '<meta name="robots" content="index,follow"></head>'
            '<body><h1>Uma oferta nova</h1></body></html>',
            encoding="utf-8",
        )

        findings = evaluate_commercial_site(root)

        assert any("nova-oferta/index.html" in row and "8↔54" in row for row in findings), findings


def test_commercial_truth_rejects_impossible_visible_catalog_count():
    html = (
        "<html><head><title>Catálogo</title></head><body>"
        "<h1>Escolha a decisão</h1><p>Temos 999 entregáveis no catálogo.</p>"
        "</body></html>"
    )

    findings = evaluate_commercial_html(html, load_registry())

    assert any("visible: catalog count 999" in row for row in findings), findings


def test_commercial_truth_ignores_non_perceptible_claims():
    html = (
        "<html><head><title>Catálogo</title></head><body>"
        "<template><p>Temos 999 entregáveis no catálogo.</p></template>"
        "<section hidden><p>Temos 999 entregáveis no catálogo.</p></section>"
        "<p>Consulte o catálogo vigente.</p>"
        "</body></html>"
    )

    findings = evaluate_commercial_html(html, load_registry())

    assert not any("visible:" in row for row in findings), findings


def test_catalog_item_state_status_and_price_match_deliverable_registry():
    html = """
    <html><head><title>Catálogo</title></head><body>
      <article class="catalog-item" data-deliverable-id="CFG-D02"
        data-public-state="VALIDATE">
        <span class="catalog-item__state">Indisponível</span>
        <h5>Base de Mercado para Expansão</h5>
        <dl class="catalog-item__facts"><div><dt>Preço</dt><dd>R$ 999</dd></div></dl>
      </article>
    </body></html>
    """

    findings = evaluate_commercial_html(html, load_registry())

    assert any("CFG-D02: public_state VALIDATE != registry PUBLISHED" in row for row in findings), findings
    assert any("CFG-D02: status 'Indisponível' != registry 'Publicada'" in row for row in findings), findings
    assert any("CFG-D02: price R$ 999 != registry R$ 690" in row for row in findings), findings


def test_integral_catalog_has_each_registry_deliverable_exactly_once():
    item = (
        '<article class="catalog-item catalog-item--published" '
        'data-deliverable-id="{id}" data-public-state="PUBLISHED">'
        '<span class="catalog-item__state">Publicada</span>'
        "</article>"
    )
    html = (
        "<html><head><title>Catálogo</title></head><body>"
        '<section class="deliverables-catalog">'
        f"{item.format(id='CFG-D02')}{item.format(id='CFG-D02')}"
        "</section></body></html>"
    )

    findings = evaluate_commercial_html(html, load_registry())

    assert any("CFG-D01: missing from integral catalog" in row for row in findings), findings
    assert any("CFG-D02: duplicated in integral catalog" in row for row in findings), findings


def test_public_entregas_is_eight_offer_vitrine_not_integral_catalog():
    html = (ROOT / "entregas" / "index.html").read_text(encoding="utf-8")
    cards = re.findall(
        r"<article\b[^>]*class=[\"'][^\"']*\bvitrine-item\b[^\"']*[\"'][^>]*>",
        html,
        flags=re.I,
    )
    ids = re.findall(r"<article\b[^>]*data-deliverable-id=[\"']([^\"']+)[\"']", html, flags=re.I)
    states = re.findall(r"<article\b[^>]*data-public-state=[\"']([^\"']+)[\"']", html, flags=re.I)
    assert "deliverables-catalog" not in html
    assert "catalog-item catalog-item--published" not in html
    assert "Em validação" not in html
    assert len(cards) == 8, len(cards)
    assert ids == [f"CFG-D0{i}" for i in range(1, 9)], ids
    assert states == ["PUBLISHED"] * 8, states
    findings = evaluate_commercial_html(html, load_registry())
    assert not any("missing from integral catalog" in row for row in findings), findings
    assert not any("8↔54" in row for row in findings), findings


def test_commercial_registry_keeps_canonical_54_catalog_and_8_published():
    registry = load_registry()
    registry["catalog_count"] = 55
    registry["deliverables"][0]["public_state"] = "VALIDATE"
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "data" / "commercial" / "deliverables-registry.v1.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(registry), encoding="utf-8")

        findings = evaluate_commercial_site(root)

        assert any("catalog_count 55 != canonical 54" in row for row in findings), findings
        assert any("published count 7 != canonical 8" in row for row in findings), findings


def test_deliverable_container_membership_and_count_match_registry_contract():
    registry = load_registry()
    registry["container_count"] = 3
    d02 = next(row for row in registry["deliverables"] if row["deliverable_id"] == "CFG-D02")
    d02["offer_container"] = "diretoria_fracionada"
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "data" / "commercial" / "deliverables-registry.v1.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(registry), encoding="utf-8")

        findings = evaluate_commercial_site(root)

        assert any("container_count 3 != container rows 2" in row for row in findings), findings
        assert any(
            "CFG-D02: offer_container diretoria_fracionada != composed by expansion_package" in row
            for row in findings
        ), findings


def test_visible_container_count_matches_registry():
    html = (
        "<html><head><title>Catálogo</title></head><body>"
        "<h1>Escolha a decisão</h1><p>São 3 contêineres comerciais.</p>"
        "</body></html>"
    )

    findings = evaluate_commercial_html(html, load_registry())

    assert any("visible: container count 3 != registry 2" in row for row in findings), findings


def test_unrelated_schema_item_list_is_not_treated_as_deliverable_count():
    html = (ROOT / "servicos-obras-publicas" / "index.html").read_text(encoding="utf-8")

    findings = evaluate_commercial_html(html, load_registry())

    assert not any("numberOfItems" in row for row in findings), findings


def test_price_band_is_checked_when_surface_mentions_catalog_and_published_sets():
    html = (
        "<html><head>"
        "<title>54 entregáveis e oito entregas publicadas de R$ 999 a R$ 3.750</title>"
        "</head><body><h1>Catálogo</h1></body></html>"
    )

    findings = evaluate_commercial_html(html, load_registry())

    assert any(
        "title: price band R$ 999 a R$ 3.750 != registry (599, 3750)" in row
        for row in findings
    ), findings


def test_indexable_boilerplate_fixture_fails():
    html = _read("indexable-boilerplate.html")
    result = editorial_mold_findings(html, "pedido-aditivo-fixture")
    assert result["indexable"] is True
    assert result["errors"], result
    assert any("boilerplate residual" in row for row in result["errors"])
    assert any("slug-stuffed answer mold" in row for row in result["errors"])


def test_noindex_boilerplate_is_not_an_indexable_pass():
    html = _read("noindex-boilerplate.html")
    result = editorial_mold_findings(html, "rascunho-noindex")
    assert result["indexable"] is False
    assert result["errors"] == []
    assert result["noindex_with_mold"] is True


def test_editorial_mold_ignores_non_public_metadata():
    html = (
        '<html><head><meta name="robots" content="index,follow">'
        '<meta name="keywords" content="A resposta não é automática">'
        '<script type="application/ld+json">'
        '{"internalNote":"Para conduzir pedido aditivo fixture, separe obrigação contratual"}'
        '</script></head><body><h1>Decisão verificável</h1></body></html>'
    )

    result = editorial_mold_findings(html, "pagina-segura")

    assert result["indexable"] is True
    assert result["errors"] == []


def test_semantically_rephrased_editorial_mold_fails_at_three_pages():
    def page(heading: str, body: str) -> str:
        return (
            '<html><head><meta name="robots" content="index,follow"></head><body>'
            f'<div class="criterion-card"><h3>{heading}</h3><p>{body}</p></div>'
            '</body></html>'
        )

    pages = [
        (
            "exequibilidade",
            page(
                "Fornecedores",
                "Converta fornecedores em número conferível com a planilha contratual. "
                "Sem memória de cálculo, a comprovação de exequibilidade vira recusa de "
                "medição ou impasse de faturamento.",
            ),
        ),
        (
            "matriz-riscos",
            page(
                "Alocação",
                "Converta alocação em número conferível com a planilha contratual. Sem "
                "memória de cálculo, a matriz de riscos no reequilíbrio vira recusa de "
                "medição ou impasse de faturamento.",
            ),
        ),
        (
            "prorrogacao",
            page(
                "Impacto no cronograma",
                "Transforme impacto no cronograma em número batido com a planilha. Sem "
                "memória, a prorrogação de prazo vira recusa de medição ou impasse de "
                "faturamento.",
            ),
        ),
    ]

    findings = editorial_corpus_findings(pages)

    assert len(findings) == 1, findings
    assert "x3 pages" in findings[0], findings


def test_distinct_editorial_decisions_do_not_form_a_mold_cluster():
    pages = [
        (
            "exequibilidade",
            '<html><body><div class="criterion-card"><h3>Composição</h3><p>'
            'Reconcilie quantidade, BDI e data-base até a soma reproduzir o preço ofertado.'
            '</p></div></body></html>',
        ),
        (
            "matriz-riscos",
            '<html><body><div class="criterion-card"><h3>Alocação</h3><p>'
            'Compare responsável, exclusões e franquias antes de separar o impacto residual.'
            '</p></div></body></html>',
        ),
        (
            "prorrogacao",
            '<html><body><div class="criterion-card"><h3>Caminho crítico</h3><p>'
            'Insira o evento como fragnet e derive os dias do deslocamento dos marcos críticos.'
            '</p></div></body></html>',
        ),
    ]

    assert editorial_corpus_findings(pages) == []


def test_editorial_mold_cluster_requires_pairwise_similarity():
    def page(body: str) -> str:
        return (
            '<html><body><div class="criterion-card"><h3>Critério</h3><p>'
            f'{body}</p></div></body></html>'
        )

    common = (
        "Delimite evento período causa responsabilidade documento cronologia contrato "
        "impacto quantidade prazo custo produtividade registro comunicação resposta pedido "
        "anexo cálculo decisão"
    )
    pages = [
        ("pagina-a", page(common + " compare cenário original margem proposta")),
        ("pagina-b", page(common + " protocole versão assinada fiscalização competente")),
        (
            "pagina-c",
            page(
                " ".join(common.split()[:14])
                + " protocole versão assinada fiscalização competente"
            ),
        ),
    ]

    # A≈B and B≈C, but A is materially different from C. A transitive connected
    # component must not turn those three pages into one near-duplicate cluster.
    assert editorial_corpus_findings(pages) == []


def test_editorial_corpus_includes_indexable_pages_outside_conteudos():
    from seo.scripts.validate_seo import editorial_corpus_from_indexable

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        guide = root / "guias" / "decisao" / "index.html"
        guide.parent.mkdir(parents=True)
        guide.write_text("<html><body><h1>Guia</h1></body></html>", encoding="utf-8")
        draft = root / "rascunhos" / "interno" / "index.html"
        draft.parent.mkdir(parents=True)
        draft.write_text(
            '<html><head><meta name="robots" content="noindex"></head><body>Rascunho</body></html>',
            encoding="utf-8",
        )
        paths_info = {"/guias/decisao/": guide, "/rascunhos/interno/": draft}

        corpus = editorial_corpus_from_indexable(paths_info, {"/guias/decisao/"})

    assert corpus == [("guias/decisao", "<html><body><h1>Guia</h1></body></html>")]


def test_rewritten_articles_publish_current_review_metadata_and_faithful_word_count():
    relpaths = (
        "conteudos/atraso-obra-culpa-administracao/index.html",
        "conteudos/comprovacao-exequibilidade-proposta-obra/index.html",
        "conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/index.html",
        "conteudos/prorrogacao-prazo-obra-publica-documentos/index.html",
        "conteudos/resposta-notificacao-atraso-obra-publica/index.html",
    )
    for relpath in relpaths:
        html = (ROOT / relpath).read_text(encoding="utf-8")
        article_html = re.search(r"<article\b.*?</article>", html, re.I | re.S)
        assert article_html, relpath
        actual_words = len(visible_text(article_html.group(0)).split())
        jsonld = re.search(
            r'<script type="application/ld\+json">(.*?)</script>',
            html,
            re.S,
        )
        assert jsonld, relpath
        graph = json.loads(jsonld.group(1))["@graph"]
        article = next(node for node in graph if node.get("@type") == "Article")

        assert 'content="2026-08-28" property="article:modified_time"' in html
        assert 'Revisado em <time datetime="2026-08-28">28 de agosto de 2026</time>' in html
        assert article["dateModified"] == "2026-08-28"
        assert article["wordCount"] == actual_words, (relpath, article["wordCount"], actual_words)


def test_layout_fixtures_fail_and_pass():
    offscreen = evaluate_layout_html(_read("focus-offscreen.html"))
    assert any("focus_offscreen" in row for row in offscreen), offscreen
    narrow = evaluate_layout_html(_read("text-42px.html"))
    assert any("text_width_42px" in row for row in narrow), narrow
    anchor = evaluate_layout_html(_read("useless-anchor.html"))
    assert any("useless_anchor" in row for row in anchor), anchor
    sticky = evaluate_layout_html(_read("missing-sticky-cta.html"))
    assert any("missing_sticky_cta" in row for row in sticky), sticky
    form = evaluate_layout_html(_read("broken-form.html"))
    assert any("broken_form" in row for row in form), form
    passed = evaluate_layout_html(_read("pass-layout.html"))
    assert passed == [], passed


def test_new_indexable_url_enters_every_gate_census_without_a_list_edit():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "familia-nova-cfg10x-16").mkdir()
        (root / "familia-nova-cfg10x-16" / "index.html").write_text(
            '<html lang="pt-BR"><head><title>Nova</title>'
            '<meta name="robots" content="index,follow"/></head>'
            "<body><main id='conteudo'><h1>Nova família</h1></main></body></html>",
            encoding="utf-8",
        )
        (root / "scripts").mkdir()
        (root / "scripts" / "ignored.html").write_text("<html></html>", encoding="utf-8")
        census = published_gate_census(root)
        route = "/familia-nova-cfg10x-16/"
        for gate in ("copy", "seo", "accessibility", "conversion"):
            assert route in census[gate], (gate, sorted(census[gate]))
        assert "/scripts/ignored.html" not in census["copy"]
        files = [p.relative_to(root).as_posix() for p in visitor_facing_html_files(root)]
        assert files == ["familia-nova-cfg10x-16/index.html"], files


def test_performance_budget_compares_gzip_without_multiplier():
    report = evaluate_performance(ROOT)
    source = (ROOT / "scripts" / "site" / "audit_performance.py").read_text(encoding="utf-8")
    assert "multiplier_fudge" in source
    assert report["compared_unit"] == "gzip+raw"
    assert report["css_budget_unit"] == "gzip"
    assert report["js_budget_unit"] == "gzip"
    assert report["multiplier_fudge"] is False
    assert "* 3" not in source
    assert report["ok"] is True
    assert report["css_gzip_kb"] <= report["css_budget_kb"]
    assert report["js_gzip_kb"] <= report["js_budget_kb"]
    assert report["css_raw_kb"] <= report["css_raw_budget_kb"]
    assert report["js_raw_kb"] <= report["js_raw_budget_kb"]


def test_home_keeps_sticky_cta_and_capture_form():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    findings = evaluate_layout_html(html, require_sticky_cta=True, require_form=True)
    assert not any("missing_sticky_cta" in row or "missing_form" in row or "broken_form" in row for row in findings), findings


def test_copy_seo_a11y_conversion_share_one_census():
    from scripts.site.audit_accessibility import (
        NON_VISITOR_PUBLISHED_PREFIXES,
        accessibility_pages,
    )
    from scripts.site.public_copy_scope import relpath, route_for

    census = published_gate_census(ROOT)
    routes = set(visitor_facing_routes(ROOT))
    assert len(routes) >= 200, len(routes)
    assert census["copy"] == census["seo"] == census["conversion"] == routes
    a11y = {route_for(relpath(path)) for path in accessibility_pages(ROOT)}
    excluded = {
        route
        for route, rel in (
            (route_for(relpath(path)), relpath(path))
            for path in visitor_facing_html_files(ROOT)
        )
        if any(rel.startswith(prefix) for prefix in NON_VISITOR_PUBLISHED_PREFIXES)
    }
    assert a11y == routes - excluded
    assert excluded, "piloto / data-desk exclusions must stay named, not silent"


def test_gate_sources_have_no_skip_xfail_or_raised_threshold():
    files = [
        ROOT / "scripts" / "site" / "test_copy_gates.py",
        ROOT / "scripts" / "site" / "seo_molds.py",
        ROOT / "scripts" / "site" / "commercial_surface_truth.py",
        ROOT / "scripts" / "site" / "layout_truth.py",
        ROOT / "scripts" / "site" / "audit_performance.py",
        ROOT / "seo" / "scripts" / "validate_seo.py",
    ]
    for path in files:
        text = path.read_text(encoding="utf-8")
        assert "pytest.skip(" not in text, path
        assert "pytest.xfail(" not in text, path
        assert "@pytest.mark.skip" not in text, path
        assert "@pytest.mark.xfail" not in text, path
    perf = (ROOT / "scripts" / "site" / "audit_performance.py").read_text(encoding="utf-8")
    assert re.search(r"\*\s*3", perf) is None


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    raise SystemExit(1 if failed else 0)
