#!/usr/bin/env python3
"""Drive fingerprint_published_css against a real mini publish tree.

Fails if this build's HTML can still point at an unversioned stylesheet
(the URL CDN/browser may keep for hours).
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.fingerprint_css import (  # noqa: E402
    ASSET_DIR,
    MANIFEST_REL,
    fingerprint_published_css,
    html_uses_unversioned_styles,
    stylesheet_hrefs,
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

        man_path = dest / MANIFEST_REL
        assert man_path.is_file()
        man = json.loads(man_path.read_text(encoding="utf-8"))
        assert man["files"]["styles.css"]["href"] == hrefs[0]
        assert man["files"]["styles-offers.css"]["href"] in hrefs
        assert man["html_rewritten"] >= 2
        assert report["files"]["styles.css"]["href"] == hrefs[0]

        # Unversioned fallback still exists for leftover clients.
        assert (dest / "styles.css").is_file()


def test_source_html_may_keep_unversioned_href_for_local_dev():
    """Repo source is not the publish tree; fingerprint only rewrites _site."""
    html = (ROOT / "diretoria-b2g" / "index.html").read_text(encoding="utf-8")
    assert "/styles.css" in html
    assert "/styles-offers.css" in html


def test_site_artifact_commercial_html_cannot_load_unversioned_css():
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
    for slug in COMMERCIAL_ROUTES:
        path = site / slug / "index.html"
        if not path.is_file():
            continue
        html = path.read_text(encoding="utf-8")
        hrefs = stylesheet_hrefs(html)
        assert not html_uses_unversioned_styles(html), (slug, hrefs)
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
