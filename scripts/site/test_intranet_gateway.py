#!/usr/bin/env python3
"""Drive shipped /intranet gateway gates: 302 redirects + non-indexability.

Imports seo/scripts/validate_seo.py and subprocess-runs
scripts/site/test_redirects.mjs — the real entry points. Does not reimplement
redirect parsing or SEO scanning.
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_validate_seo():
    spec = importlib.util.spec_from_file_location(
        "validate_seo_shipped", ROOT / "seo" / "scripts" / "validate_seo.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_shipped_redirects_harness_locks_intranet_302():
    proc = subprocess.run(
        ["node", str(ROOT / "scripts" / "site" / "test_redirects.mjs")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    combined = (proc.stdout or "") + (proc.stderr or "")
    assert proc.returncode == 0, combined[-4000:]
    assert "ALL redirect gates passed" in combined
    assert "source:_redirects:intranet_gateway" in combined
    assert "intranet_matcher_rejects_301" in combined
    assert "intranet_matcher_rejects_200" in combined
    assert "intranet_matcher_rejects_loop" in combined
    assert "intranet_matcher_accepts_splat_302" in combined


def test_real_repo_intranet_not_indexable():
    mod = _load_validate_seo()
    hits = mod.intranet_indexable_hits(ROOT)
    assert hits == [], hits


def test_detects_intranet_sitemap_loc(tmp_path: Path):
    mod = _load_validate_seo()
    (tmp_path / "sitemap-index.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        "<sitemap><loc>https://confenge.com.br/sitemap.xml</loc></sitemap>"
        "</sitemapindex>\n",
        encoding="utf-8",
    )
    (tmp_path / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        "<url><loc>https://confenge.com.br/intranet/</loc></url>"
        "</urlset>\n",
        encoding="utf-8",
    )
    (tmp_path / "index.html").write_text(
        "<html><head><title>ok</title></head><body><h1>ok</h1></body></html>",
        encoding="utf-8",
    )
    hits = mod.intranet_indexable_hits(tmp_path)
    assert any(h.startswith("sitemap_") for h in hits), hits


def test_detects_intranet_nav_jsonld_and_href(tmp_path: Path):
    mod = _load_validate_seo()
    (tmp_path / "index.html").write_text(
        "<html><head><title>ok</title>"
        '<script type="application/ld+json">'
        '{"@type":"WebSite","url":"https://confenge.com.br/intranet/"}'
        "</script></head><body>"
        '<nav aria-label="principal"><a href="/intranet/">Intranet</a></nav>'
        "</body></html>",
        encoding="utf-8",
    )
    hits = mod.intranet_indexable_hits(tmp_path)
    kinds = {h.split(":")[0] for h in hits}
    assert "nav" in kinds, hits
    assert "jsonld" in kinds, hits
    assert "html_href" in kinds, hits


def test_clean_fixture_has_no_intranet_hits(tmp_path: Path):
    mod = _load_validate_seo()
    (tmp_path / "index.html").write_text(
        "<html><head><title>ok</title>"
        '<script type="application/ld+json">'
        '{"@type":"WebSite","url":"https://confenge.com.br/"}'
        "</script></head><body>"
        '<nav aria-label="principal"><a href="/conteudos/">Conteúdos</a></nav>'
        "</body></html>",
        encoding="utf-8",
    )
    assert mod.intranet_indexable_hits(tmp_path) == []


def test_activation_gate_token_in_committed_docs():
    token = "ACTIVATION_GATE=OPS_HOST_AUTHENTICATED_AND_HEALTHY"
    doc = ROOT / "docs" / "ops" / "INTRANET-GATEWAY.md"
    text = doc.read_text(encoding="utf-8")
    assert token in text
    redirects = (ROOT / "_redirects").read_text(encoding="utf-8")
    assert token in redirects


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-q"]))
