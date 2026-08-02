"""Tests drive shipped editorial gates — no reimplementation of validators."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.gates import (  # noqa: E402
    evaluate_page,
    has_contextual_email,
    has_contextual_whatsapp,
    sitemap_membership_ok,
)
from scripts.editorial.naturalness import evaluate_body, find_internal_terms  # noqa: E402
from scripts.editorial.registry import (  # noqa: E402
    INDEXABLE_STATES,
    material_hash,
    approve_human,
    load_registry,
    mark_indexable,
    upsert_page,
)
from scripts.editorial.render import render_page  # noqa: E402
from scripts.editorial.sources import is_official_url, load_manifest, page_sources_ok  # noqa: E402

PAGES_DIR = ROOT / "data" / "editorial" / "pages"


def _load_pages() -> list[dict]:
    if not PAGES_DIR.exists():
        return []
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(PAGES_DIR.glob("*.json"))
    ]


def test_source_manifest_official_urls():
    man = load_manifest()
    assert man.get("sources"), "SOURCE-MANIFEST must have sources"
    for src in man["sources"]:
        assert is_official_url(src["url"]), src.get("source_id")


def test_wave1_pages_exist():
    pages = _load_pages()
    assert len(pages) >= 8, "Wave 1 should define multiple page bodies"


def test_each_page_sources_resolve():
    man = load_manifest()
    for page in _load_pages():
        issues = page_sources_ok(page.get("sources") or [], man)
        assert not issues, (page["page_id"], issues)


def test_naturalness_on_bodies():
    pages = _load_pages()
    bodies = [p.get("body_markdown") or "" for p in pages]
    for i, page in enumerate(pages):
        other = bodies[:i] + bodies[i + 1 :]
        result = evaluate_body(page["body_markdown"], keyword=page.get("primary_keyword"), max_similarity_bodies=other)
        assert result["ok"], (page["page_id"], result["issues"])


def test_render_has_contextual_ctas_and_no_internal_terms():
    for page in _load_pages():
        page = {**page, "status": "INDEXABLE", "material_hash": material_hash(page)}
        html = render_page(page)
        ok_wa, detail_wa = has_contextual_whatsapp(html, theme_token=page.get("theme"))
        ok_em, detail_em = has_contextual_email(html, theme_token=page.get("theme"))
        assert ok_wa, (page["page_id"], detail_wa)
        assert ok_em, (page["page_id"], detail_em)
        internal = find_internal_terms(html)
        assert not internal, (page["page_id"], internal)
        assert 'data-content-type="' in html
        assert "mailto:" in html and "subject=" in html.lower()
        assert "wa.me/" in html


def test_full_gate_on_rendered_indexable_candidate():
    man = load_manifest()
    pages = _load_pages()
    bodies = []
    for page in pages:
        page = {**page, "status": "HUMAN_APPROVED", "material_hash": material_hash(page)}
        page["approval"] = {
            "reviewer": "test-reviewer",
            "material_hash": page["material_hash"],
            "at": "2026-08-02T00:00:00Z",
        }
        html = render_page({**page, "status": "INDEXABLE"})
        gate = evaluate_page(
            {**page, "status": "INDEXABLE"},
            html,
            other_bodies=bodies,
            manifest=man,
        )
        bodies.append(page["body_markdown"])
        assert gate["ok"], (page["page_id"], gate["issues"])


def test_approval_hash_invalidation(tmp_path):
    reg = {"schema_version": "1.0.0", "pages": []}
    page = {
        "page_id": "tmp-page",
        "url": "/tmp/",
        "title": "T",
        "direct_answer": "x " * 60,
        "body_markdown": "documento diário art. 124 risco depende do caso " * 40,
        "sources": ["lei-14133-planalto"],
        "cta_whatsapp": "Olá sobre aditivo de obra " * 3,
        "cta_email_subject": "Análise aditivo obra",
        "cta_email_body": "corpo",
        "archetype": "lei_14133",
        "legal_devices": ["art.124"],
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    approve_human(
        reg,
        "tmp-page",
        reviewer="tester",
        notes="ok",
        sources_verified=["lei-14133-planalto"],
    )
    mark_indexable(reg, "tmp-page")
    assert reg["pages"][0]["status"] == "INDEXABLE"
    # change body → hash change on upsert should force REVIEW_REQUIRED
    page2 = {**page, "body_markdown": page["body_markdown"] + " alteração material extra"}
    page2["material_hash"] = material_hash(page2)
    upsert_page(reg, page2)
    assert reg["pages"][0]["status"] == "REVIEW_REQUIRED"


def test_sitemap_membership_rejects_non_indexable():
    issues = sitemap_membership_ok(
        ["/lei-14133-obras/foo/", "/draft/"],
        ["/lei-14133-obras/foo/"],
        reject_urls=["/draft/"],
    )
    assert any("sitemap_not_indexable" in i for i in issues)
