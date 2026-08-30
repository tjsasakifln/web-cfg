#!/usr/bin/env python3
"""Drive fingerprint_published_css against a real mini publish tree.

Fails if this build's HTML can still point at an unversioned stylesheet
(the URL CDN/browser may keep for hours).
"""

from __future__ import annotations

import json
import hashlib
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.fingerprint_css import (  # noqa: E402
    ASSET_DIR,
    MANIFEST_REL,
    duplicate_stylesheet_hrefs,
    fingerprint_published_css,
    html_uses_unversioned_styles,
    stylesheet_hrefs,
    validate_css_asset_manifest,
)


COMMERCIAL_ROUTES = (
    "diretoria-b2g",
    "diagnostico-b2g-expansao",
    "bid-room-licitacoes-obras",
    "acompanhamento-contratos-obras",
    "defesa-margem-contratos-publicos",
    "defesa-tecnica-contratos-publicos",
    "atrasos-prorrogacao-obras-publicas",
)

OFFER_ROUTES = (
    "diretoria-b2g",
    "diagnostico-b2g-expansao",
    "bid-room-licitacoes-obras",
    "defesa-margem-contratos-publicos",
)


def test_fingerprint_rewrites_html_to_hashed_css():
    marker = ".offer-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}"
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        (dest / "styles-tokens.css").write_text(":root{--ink:#071a31}\n", encoding="utf-8")
        (dest / "styles.css").write_text(
            '@import url("/styles-tokens.css");\n' + marker + "\n",
            encoding="utf-8",
        )
        (dest / "styles-tools.css").write_text(
            '@import url("/styles-tokens.css");\n.tool{color:red}\n',
            encoding="utf-8",
        )
        (dest / "styles-offers.css").write_text(
            '@import url("/styles-tokens.css");\n.offer-detail-disclosure{color:blue}\n',
            encoding="utf-8",
        )
        (dest / "entregas").mkdir()
        (dest / "entregas" / "styles.css").write_text(
            ".offer-decision-nav{display:grid}\n", encoding="utf-8"
        )
        (dest / "assets").mkdir()
        (dest / "assets" / "home-10x.css").write_text(
            ".home-proof{display:block}\n", encoding="utf-8"
        )
        (dest / "casos" / "modelo").mkdir(parents=True)
        (dest / "casos" / "modelo" / "styles.css").write_text(
            ".report{display:grid}\n", encoding="utf-8"
        )
        (dest / "_headers").write_text(
            "/*\n  Cache-Control: no-cache, max-age=0, must-revalidate\n",
            encoding="utf-8",
        )
        page = dest / "diretoria-b2g" / "index.html"
        page.parent.mkdir(parents=True)
        page.write_text(
            '<!DOCTYPE html><html><head><link href="/styles.css" rel="stylesheet"/>'
            '<link href="/styles-offers.css" rel="stylesheet"/>'
            "</head><body><dl class=\"offer-context\"></dl></body></html>\n",
            encoding="utf-8",
        )
        tools = dest / "ferramentas" / "index.html"
        tools.parent.mkdir(parents=True)
        tools.write_text(
            '<link rel="stylesheet" href="/styles.css"/>'
            '<link rel="stylesheet" href="/styles-tools.css"/>\n',
            encoding="utf-8",
        )
        deliverables = dest / "entregas" / "index.html"
        deliverables.write_text(
            '<link rel="stylesheet" href="/styles.css">'
            '<link rel="stylesheet" href="/entregas/styles.css?v=release-42#layout">\n',
            encoding="utf-8",
        )
        home = dest / "index.html"
        home.write_text(
            '<link rel="stylesheet" href="/assets/home-10x.css">'
            '<link rel="stylesheet" href="https://fonts.example.test/type.css">\n',
            encoding="utf-8",
        )
        model = dest / "casos" / "modelo" / "index.html"
        model.write_text('<link rel="stylesheet" href="styles.css">\n', encoding="utf-8")

        report = fingerprint_published_css(dest)

        html = page.read_text(encoding="utf-8")
        hrefs = stylesheet_hrefs(html)
        assert hrefs, "no stylesheet href after fingerprint"
        assert not html_uses_unversioned_styles(html), hrefs
        assert hrefs[0].startswith(f"/{ASSET_DIR}/styles."), hrefs
        assert hrefs[0] != "/styles.css"
        assert any(h.startswith(f"/{ASSET_DIR}/styles-offers.") for h in hrefs), hrefs

        hashed = dest / hrefs[0].lstrip("/")
        assert hashed.is_file(), hrefs[0]
        hashed_css = hashed.read_text(encoding="utf-8")
        assert marker in hashed_css
        assert ".offer-context{" in hashed_css
        assert "grid-template-columns:repeat(3,minmax(0,1fr))" in hashed_css
        assert "/assets/css/styles-tokens." in hashed_css

        tools_html = tools.read_text(encoding="utf-8")
        tool_hrefs = stylesheet_hrefs(tools_html)
        assert not html_uses_unversioned_styles(tools_html), tool_hrefs
        assert any(h.startswith(f"/{ASSET_DIR}/styles-tools.") for h in tool_hrefs), tool_hrefs

        deliverables_hrefs = stylesheet_hrefs(deliverables.read_text(encoding="utf-8"))
        assert any(h.startswith(f"/{ASSET_DIR}/entregas/styles.") for h in deliverables_hrefs), deliverables_hrefs
        assert not any("release-42" in h for h in deliverables_hrefs), deliverables_hrefs
        assert any(h.endswith("#layout") for h in deliverables_hrefs), deliverables_hrefs
        home_hrefs = stylesheet_hrefs(home.read_text(encoding="utf-8"))
        assert any(h.startswith(f"/{ASSET_DIR}/assets/home-10x.") for h in home_hrefs), home_hrefs
        assert "https://fonts.example.test/type.css" in home_hrefs
        model_hrefs = stylesheet_hrefs(model.read_text(encoding="utf-8"))
        assert len(model_hrefs) == 1 and model_hrefs[0].startswith(
            f"/{ASSET_DIR}/casos/modelo/styles."
        ), model_hrefs

        man_path = dest / MANIFEST_REL
        assert man_path.is_file()
        man = json.loads(man_path.read_text(encoding="utf-8"))
        assert man["files"]["styles.css"]["href"] == hrefs[0]
        assert man["files"]["styles-offers.css"]["href"] in hrefs
        assert "entregas/styles.css" in man["files"]
        assert "assets/home-10x.css" in man["files"]
        assert "casos/modelo/styles.css" in man["files"]
        assert man["html_rewritten"] >= 5
        assert report["files"]["styles.css"]["href"] == hrefs[0]

        # Running the finalizer twice must preserve every published byte/contract.
        manifest_bytes = man_path.read_bytes()
        headers_bytes = (dest / "_headers").read_bytes()
        deliverables_bytes = deliverables.read_bytes()
        second_report = fingerprint_published_css(dest)
        assert second_report == report
        assert man_path.read_bytes() == manifest_bytes
        assert (dest / "_headers").read_bytes() == headers_bytes
        assert deliverables.read_bytes() == deliverables_bytes
        assert stylesheet_hrefs(deliverables.read_text(encoding="utf-8")) == deliverables_hrefs

        # Unversioned fallback still exists for leftover clients.
        assert (dest / "styles.css").is_file()
        published_headers = (dest / "_headers").read_text(encoding="utf-8")
        assert hrefs[0] in published_headers
        assert "max-age=31536000, immutable" in published_headers
        assert "# BEGIN hashed-css-cache" in published_headers


def test_source_html_may_keep_unversioned_href_for_local_dev():
    """Repo source is not the publish tree; fingerprint only rewrites _site."""
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    assert "/styles.css" in html
    assert "/styles-offers.css" in html


def test_duplicate_stylesheet_hrefs_ignore_cache_tokens():
    html = (
        '<link rel="stylesheet" href="/styles-offers.css?v=one">'
        '<link href="/styles-offers.css?v=two" rel="stylesheet">'
        '<link rel="stylesheet" href="https://example.test/external.css">'
    )
    assert duplicate_stylesheet_hrefs(html) == ["/styles-offers.css"]
    assert html_uses_unversioned_styles(
        '<link rel="stylesheet" href="https://confenge.com.br/entregas/styles.css?v=old">'
    )
    assert html_uses_unversioned_styles(
        '<link rel="stylesheet" href="//confenge.com.br/entregas/styles.css">'
    )
    assert not html_uses_unversioned_styles(
        '<link rel="stylesheet" href="https://confenge.com.br:444/entregas/styles.css">'
    )


def test_semantic_link_parser_rewrites_valid_html_without_touching_data_href():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        (dest / "theme").write_text(".theme{color:green}\n", encoding="utf-8")
        (dest / "alternate").write_text(".alternate{color:navy}\n", encoding="utf-8")
        (dest / "styles.css").write_text(".encoded{display:block}\n", encoding="utf-8")
        page = dest / "index.html"
        page.write_text(
            '<script>const decoy = `<link rel="stylesheet" href="/script-decoy">`;</script>'
            '<!-- <link rel="stylesheet" href="/comment-decoy"> -->'
            '<link rel="preload stylesheet" data-href="/decoy.css" href=https://confenge.com.br/theme>'
            "<link href='/alternate' rel='alternate stylesheet'>"
            '<link rel=stylesheet href=/styles%2Ecss>'
            '<link rel="icon" href="/icon.css">\n',
            encoding="utf-8",
        )

        assert stylesheet_hrefs(page.read_text(encoding="utf-8")) == [
            "https://confenge.com.br/theme",
            "/alternate",
            "/styles%2Ecss",
        ]
        report = fingerprint_published_css(dest)
        rewritten = page.read_text(encoding="utf-8")
        hrefs = stylesheet_hrefs(rewritten)
        assert len(hrefs) == 3 and all(href.startswith(f"/{ASSET_DIR}/") for href in hrefs), hrefs
        assert all(href.endswith(".css") for href in hrefs), hrefs
        assert 'data-href="/decoy.css"' in rewritten
        assert 'href="/script-decoy"' in rewritten
        assert 'href="/comment-decoy"' in rewritten
        assert 'href="/icon.css"' in rewritten
        assert set(report["files"]) == {"theme", "alternate", "styles.css"}


def test_stylesheet_link_with_ambiguous_href_fails_closed():
    for html in (
        '<link rel="stylesheet" data-href="/decoy" href="/real" href="/other">',
        '<link rel=stylesheet>',
        '<link rel="stylesheet" href="">',
    ):
        try:
            stylesheet_hrefs(html)
        except ValueError as exc:
            assert "exactly one non-empty href" in str(exc)
        else:
            raise AssertionError(f"ambiguous stylesheet link was accepted: {html}")


def test_local_css_change_always_changes_the_published_href():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        css = dest / "entregas" / "styles.css"
        css.parent.mkdir(parents=True)
        css.write_text(".offer-decision-nav{grid-template-columns:1fr}\n", encoding="utf-8")
        page = dest / "entregas" / "index.html"
        page.write_text('<link rel="stylesheet" href="/entregas/styles.css">\n', encoding="utf-8")
        first = fingerprint_published_css(dest)["files"]["entregas/styles.css"]["href"]
        css.write_text(".offer-decision-nav{grid-template-columns:1fr 1fr}\n", encoding="utf-8")
        second = fingerprint_published_css(dest)["files"]["entregas/styles.css"]["href"]
        assert first != second, (first, second)
        assert stylesheet_hrefs(page.read_text(encoding="utf-8")) == [second]


def test_second_run_with_missing_source_fails_without_mutating_manifest():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        css = dest / "entregas" / "styles.css"
        css.parent.mkdir(parents=True)
        css.write_text(".offer-decision-nav{display:grid}\n", encoding="utf-8")
        page = dest / "entregas" / "index.html"
        page.write_text('<link rel="stylesheet" href="/entregas/styles.css">\n', encoding="utf-8")
        fingerprint_published_css(dest)
        manifest = dest / MANIFEST_REL
        before_manifest = manifest.read_bytes()
        before_html = page.read_bytes()
        css.unlink()

        try:
            fingerprint_published_css(dest)
        except FileNotFoundError as exc:
            assert "source" in str(exc)
        else:
            raise AssertionError("missing source was silently accepted on the second run")
        assert manifest.read_bytes() == before_manifest
        assert page.read_bytes() == before_html


def test_manifest_validator_binds_source_href_asset_and_hashes():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        css = dest / "theme"
        css.write_text(".theme{display:grid}\n", encoding="utf-8")
        page = dest / "index.html"
        page.write_text('<link rel=stylesheet href=/theme>\n', encoding="utf-8")
        report = fingerprint_published_css(dest)
        assert validate_css_asset_manifest(dest) == report

        manifest = dest / MANIFEST_REL
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        payload["files"]["theme"]["hash"] = "0" * 12
        manifest.write_text(json.dumps(payload), encoding="utf-8")
        try:
            validate_css_asset_manifest(dest)
        except ValueError as exc:
            assert "short hash" in str(exc)
        else:
            raise AssertionError("manifest short hash mismatch was accepted")


def test_manifest_validator_rejects_missing_or_empty_manifest():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        try:
            validate_css_asset_manifest(dest)
        except FileNotFoundError:
            pass
        else:
            raise AssertionError("missing manifest was accepted")
        manifest = dest / MANIFEST_REL
        manifest.parent.mkdir(parents=True)
        manifest.write_text('{"files":{}}\n', encoding="utf-8")
        try:
            validate_css_asset_manifest(dest)
        except ValueError as exc:
            assert "at least one file" in str(exc)
        else:
            raise AssertionError("empty manifest was accepted")


def test_relative_css_asset_url_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        css = dest / "entregas" / "styles.css"
        css.parent.mkdir(parents=True)
        css.write_text(".hero{background:url(hero.webp)}\n", encoding="utf-8")
        (dest / "index.html").write_text(
            '<link rel="stylesheet" href="/entregas/styles.css">\n', encoding="utf-8"
        )
        try:
            fingerprint_published_css(dest)
        except ValueError as exc:
            assert "relative CSS url()" in str(exc)
        else:
            raise AssertionError("relative CSS url() was silently relocated")


def test_unknown_fingerprinted_href_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        (dest / "index.html").write_text(
            '<link rel="stylesheet" href="/assets/css/orphan.0123456789ab.css">\n',
            encoding="utf-8",
        )
        try:
            fingerprint_published_css(dest)
        except ValueError as exc:
            assert "absent from manifest" in str(exc)
        else:
            raise AssertionError("unmanifested fingerprinted CSS was accepted")


def test_bare_relative_css_import_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td)
        (dest / "styles.css").write_text('@import "theme.css";\n', encoding="utf-8")
        (dest / "index.html").write_text(
            '<link rel="stylesheet" href="/styles.css">\n', encoding="utf-8"
        )
        try:
            fingerprint_published_css(dest)
        except ValueError as exc:
            assert "imported local CSS" in str(exc)
        else:
            raise AssertionError("relative @import was silently relocated")


def test_extensionless_and_orphan_hashed_css_imports_fail_closed():
    for imported in (
        '@import "/theme";\n',
        '@import url("/assets/css/missing.0123456789ab.css");\n',
    ):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td)
            (dest / "styles.css").write_text(imported, encoding="utf-8")
            (dest / "index.html").write_text(
                '<link rel="stylesheet" href="/styles.css">\n', encoding="utf-8"
            )
            try:
                fingerprint_published_css(dest)
            except ValueError as exc:
                assert "imported local CSS" in str(exc)
                assert "validated build dependency" in str(exc)
            else:
                raise AssertionError(f"unsafe @import was silently accepted: {imported.strip()}")


def test_source_html_has_no_duplicate_stylesheets():
    duplicates = []
    for path in ROOT.rglob("*.html"):
        if "_site" in path.parts or "node_modules" in path.parts:
            continue
        repeated = duplicate_stylesheet_hrefs(path.read_text(encoding="utf-8"))
        if repeated:
            duplicates.append((path.relative_to(ROOT).as_posix(), repeated))
    assert not duplicates, duplicates


def test_site_artifact_html_cannot_load_unversioned_or_duplicate_css():
    site = ROOT / "_site"
    man_path = site / MANIFEST_REL
    # test:design runs before build:site in CI; the unit test above is the
    # always-on gate. After assemble, audit_public_artifact also checks this.
    if not site.is_dir() or not man_path.is_file():
        return
    assert man_path.is_file(), "publish tree missing css-assets.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    href = man["files"]["styles.css"]["href"]
    assert href.startswith(f"/{ASSET_DIR}/styles.")
    hashed = site / href.lstrip("/")
    assert hashed.is_file(), href
    css = hashed.read_text(encoding="utf-8")
    assert ".offer-context{" in css
    assert "grid-template-columns:repeat(3,minmax(0,1fr))" in css
    for path in site.rglob("*.html"):
        html = path.read_text(encoding="utf-8")
        hrefs = stylesheet_hrefs(html)
        rel = path.relative_to(site).as_posix()
        assert not html_uses_unversioned_styles(html), (rel, hrefs)
        assert not duplicate_stylesheet_hrefs(html), (rel, duplicate_stylesheet_hrefs(html))
        for css_href in hrefs:
            if not css_href.startswith(f"/{ASSET_DIR}/"):
                continue
            clean_href = css_href.split("#", 1)[0]
            entry = next((info for info in man["files"].values() if info["href"] == clean_href), None)
            assert entry is not None, (rel, clean_href)
            asset = site / clean_href.lstrip("/")
            assert asset.is_file(), (rel, clean_href)
            assert hashlib.sha256(asset.read_bytes()).hexdigest() == entry["sha256"], clean_href
    for slug in COMMERCIAL_ROUTES:
        path = site / slug / "index.html"
        if not path.is_file():
            continue
        hrefs = stylesheet_hrefs(path.read_text(encoding="utf-8"))
        assert href in hrefs, (slug, hrefs)
        if slug in OFFER_ROUTES:
            offer_href = man["files"]["styles-offers.css"]["href"]
            assert offer_href in hrefs, (slug, hrefs)


def run_all() -> int:
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_all())
