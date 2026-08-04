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
    advance,
    approve_human,
    is_blocked_reviewer,
    indexable_pages,
    load_registry,
    mark_indexable,
    material_hash,
    revoke_auto_approvals,
    upsert_page,
)
from scripts.editorial.render import render_page  # noqa: E402
from scripts.editorial.sources import is_official_url, load_manifest, page_sources_ok  # noqa: E402
from scripts.editorial.governance import EDITORIAL_CHECKLIST_KEYS  # noqa: E402

PAGES_DIR = ROOT / "data" / "editorial" / "pages"


def _complete_checklist() -> dict[str, bool]:
    return {key: True for key in EDITORIAL_CHECKLIST_KEYS}


def _preview_evidence(page: dict) -> dict:
    current = material_hash(page)
    return {
        "page_id": page["page_id"],
        "review_target_sha": "a" * 40,
        "preview_base_url": "https://deploy-preview-54--confenge.netlify.app",
        "preview_build_sha": "a" * 40,
        "preview_generated_at": "2026-08-04T00:00:00Z",
        "reviewed_url": "https://deploy-preview-54--confenge.netlify.app" + page["url"],
        "material_hash": current,
        "page_http_status": 200,
    }


def _load_pages() -> list[dict]:
    if not PAGES_DIR.exists():
        return []
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(PAGES_DIR.glob("*.json"))
        if p.stem != "jur-sumula-260-art"  # rejected until official sumula dossier complete
    ]


def test_source_manifest_official_urls():
    man = load_manifest()
    assert man.get("sources"), "SOURCE-MANIFEST must have sources"
    for src in man["sources"]:
        assert is_official_url(src["url"]), src.get("source_id")


def test_wave1_pages_exist():
    pages = _load_pages()
    assert len(pages) >= 8


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
        result = evaluate_body(
            page["body_markdown"],
            keyword=page.get("primary_keyword"),
            max_similarity_bodies=other,
        )
        assert result["ok"], (page["page_id"], result["issues"])


def test_render_has_contextual_ctas_and_no_internal_terms():
    for page in _load_pages():
        page = {**page, "status": "EDITORIAL_REVIEWED", "material_hash": material_hash(page)}
        html = render_page(page)
        ok_wa, detail_wa = has_contextual_whatsapp(html, theme_token=page.get("theme"))
        ok_em, detail_em = has_contextual_email(html, theme_token=page.get("theme"))
        assert ok_wa, (page["page_id"], detail_wa)
        assert ok_em, (page["page_id"], detail_em)
        assert not find_internal_terms(html), page["page_id"]
        assert 'data-content-type="' in html
        # unapproved must be noindex
        assert "noindex" in html.lower()


def test_full_gate_on_editorial_reviewed_candidate():
    man = load_manifest()
    pages = _load_pages()
    bodies = []
    for page in pages:
        page = {**page, "status": "EDITORIAL_REVIEWED", "material_hash": material_hash(page)}
        html = render_page(page)
        gate = evaluate_page(page, html, other_bodies=bodies, manifest=man)
        bodies.append(page["body_markdown"])
        assert gate["ok"], (page["page_id"], gate["issues"])


def test_blocked_reviewers():
    assert is_blocked_reviewer("editorial-wave1-operator")
    assert is_blocked_reviewer("ci-bot")
    assert is_blocked_reviewer("auto-approve")
    assert not is_blocked_reviewer("Tiago Sasaki")
    assert not is_blocked_reviewer("Maria Silva")


def test_cannot_human_approve_from_draft():
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
        "status": "DRAFT",
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    with pytest.raises(ValueError, match="requires_EDITORIAL_REVIEWED"):
        approve_human(
            reg,
            "tmp-page",
            reviewer="Tiago Sasaki",
            notes="Fontes e conteúdo conferidos com rigor adequado.",
            sources_verified=["lei-14133-planalto"],
        )


def test_cannot_approve_as_operator():
    reg = {"schema_version": "1.0.0", "pages": []}
    page = {
        "page_id": "tmp2",
        "url": "/tmp2/",
        "title": "T",
        "direct_answer": "x " * 60,
        "body_markdown": "documento diário art. 124 risco depende do caso " * 40,
        "sources": ["lei-14133-planalto"],
        "cta_whatsapp": "Olá sobre aditivo de obra " * 3,
        "cta_email_subject": "Análise aditivo obra",
        "cta_email_body": "corpo",
        "archetype": "lei_14133",
        "legal_devices": ["art.124"],
        "status": "EDITORIAL_REVIEWED",
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    with pytest.raises(ValueError, match="reviewer_not_human"):
        approve_human(
            reg,
            "tmp2",
            reviewer="editorial-wave1-operator",
            notes="Fontes e conteúdo conferidos com rigor adequado.",
            sources_verified=["lei-14133-planalto"],
        )


def test_human_path_to_indexable():
    reg = {"schema_version": "1.0.0", "pages": []}
    page = {
        "page_id": "tmp3",
        "url": "/tmp3/",
        "title": "T",
        "direct_answer": "x " * 60,
        "body_markdown": "documento diário art. 124 risco depende do caso " * 40,
        "sources": ["lei-14133-planalto"],
        "cta_whatsapp": "Olá sobre aditivo de obra " * 3,
        "cta_email_subject": "Análise aditivo obra",
        "cta_email_body": "corpo",
        "archetype": "lei_14133",
        "legal_devices": ["art.124"],
        "status": "EDITORIAL_REVIEWED",
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    approve_human(
        reg,
        "tmp3",
        reviewer="Tiago Sasaki",
        notes="Fontes Planalto e aplicação prática conferidas no caso-tipo.",
        sources_verified=["lei-14133-planalto"],
        checklist=_complete_checklist(),
        preview_evidence=_preview_evidence(page),
    )
    mark_indexable(reg, "tmp3")
    assert reg["pages"][0]["status"] == "INDEXABLE"


def test_revoke_operator_stamps():
    page = {
        "page_id": "x",
        "url": "/x/",
        "title": "Título",
        "direct_answer": "Resposta " * 30,
        "body_markdown": "Corpo técnico " * 80,
        "sources": ["lei-14133-planalto"],
        "cta_whatsapp": "Olá, Tiago. Preciso validar um contrato de obra pública.",
        "cta_email_subject": "Análise de contrato de obra",
        "cta_email_body": "Corpo",
        "archetype": "lei_14133",
        "legal_devices": ["art.124"],
        "status": "INDEXABLE",
        "history": [],
    }
    page["material_hash"] = material_hash(page)
    page["approval"] = {
        "schema_version": "2.0.0",
        "page_id": "x",
        "state": "HUMAN_APPROVED",
        "reviewer": "editorial-wave1-operator",
        "at": "2026-08-04T00:00:00Z",
        "material_hash": page["material_hash"],
    }
    reg = {"schema_version": "1.0.0", "pages": [page]}
    n = revoke_auto_approvals(reg)
    assert n == 1
    assert reg["pages"][0]["status"] == "EDITORIAL_REVIEWED"
    assert "approval" not in reg["pages"][0]


def test_approval_hash_invalidation():
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
        "status": "EDITORIAL_REVIEWED",
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    approve_human(
        reg,
        "tmp-page",
        reviewer="Tiago Sasaki",
        notes="Fontes e conteúdo conferidos com rigor adequado.",
        sources_verified=["lei-14133-planalto"],
        checklist=_complete_checklist(),
        preview_evidence=_preview_evidence(page),
    )
    mark_indexable(reg, "tmp-page")
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


def test_build_rejects_auto_approve_flag():
    from scripts.editorial.build import main

    assert main(["--auto-approve"]) == 2


def test_material_change_drops_old_approval_identity():
    reg = {"schema_version": "1.0.0", "pages": []}
    page = {
        "page_id": "material-change",
        "url": "/material-change/",
        "title": "Título",
        "direct_answer": "Resposta " * 30,
        "body_markdown": "Corpo técnico " * 80,
        "sources": ["lei-14133-planalto"],
        "cta_whatsapp": "Olá, Tiago. Preciso validar um contrato de obra pública.",
        "cta_email_subject": "Análise de contrato de obra",
        "cta_email_body": "Corpo",
        "archetype": "lei_14133",
        "legal_devices": ["art.124"],
        "status": "EDITORIAL_REVIEWED",
    }
    page["material_hash"] = material_hash(page)
    upsert_page(reg, page)
    approve_human(
        reg,
        "material-change",
        reviewer="Tiago Sasaki",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        sources_verified=["lei-14133-planalto"],
        checklist=_complete_checklist(),
        preview_evidence=_preview_evidence(page),
    )
    mark_indexable(reg, "material-change")
    # The caller carries the old stored hash. The registry must recompute it
    # from material fields and revoke the prior approval anyway.
    changed = {**page, "body_markdown": page["body_markdown"] + " mudança material"}
    upsert_page(reg, changed)
    assert reg["pages"][0]["status"] == "REVIEW_REQUIRED"
    assert "approval" not in reg["pages"][0]
    assert not indexable_pages(reg)


def test_indexable_pages_requires_current_approval_identity():
    reg = {
        "schema_version": "1.0.0",
        "pages": [
            {
                "page_id": "bad-identity",
                "url": "/bad-identity/",
                "material_hash": "current",
                "status": "INDEXABLE",
                "approval": {
                    "schema_version": "2.0.0",
                    "page_id": "bad-identity",
                    "state": "HUMAN_APPROVED",
                    "reviewer": "Tiago Sasaki",
                    "at": "2026-08-04T00:00:00Z",
                    "material_hash": "old",
                },
            }
        ],
    }
    assert indexable_pages(reg) == []
    with pytest.raises(ValueError, match="approval_hash_or_identity_mismatch"):
        mark_indexable(reg, "bad-identity")
    assert reg["pages"][0]["status"] == "REVIEW_REQUIRED"
