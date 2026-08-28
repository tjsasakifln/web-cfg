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
    load_registry,
)
from scripts.site.layout_truth import evaluate_layout_html  # noqa: E402
from scripts.site.public_copy_scope import (  # noqa: E402
    published_gate_census,
    visitor_facing_html_files,
    visitor_facing_routes,
)
from scripts.site.seo_molds import editorial_mold_findings  # noqa: E402
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
    assert report["compared_unit"] == "gzip"
    assert report["css_budget_unit"] == "gzip"
    assert report["js_budget_unit"] == "gzip"
    assert report["multiplier_fudge"] is False
    assert "* 3" not in source
    assert report["ok"] is True
    assert report["css_gzip_kb"] <= report["css_budget_kb"]
    assert report["js_gzip_kb"] <= report["js_budget_kb"]


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
