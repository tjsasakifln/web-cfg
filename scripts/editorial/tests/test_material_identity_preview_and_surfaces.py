"""Regression tests for complete material identity, preview evidence and surfaces."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.cohort import FIRST_COHORT_IDS  # noqa: E402
from scripts.editorial.governance import EDITORIAL_CHECKLIST_KEYS  # noqa: E402
from scripts.editorial.registry import (  # noqa: E402
    approval_is_current,
    approve_human,
    canonical_material_payload,
    indexable_pages,
    mark_indexable,
    material_hash,
    source_verification_errors,
    upsert_page,
)
from scripts.editorial import truth  # noqa: E402
from scripts.editorial.preview import reconfirm_approval_preview  # noqa: E402


def _manifest() -> dict:
    return {
        "schema_version": "1.0.0",
        "sources": [
            {
                "source_id": "source-a",
                "title": "Fonte oficial A",
                "url": "https://www.gov.br/fonte-a",
                "version": "2026.1",
                "digest": "aaa",
                "type": "statute",
                "accessed_at": "2026-08-01",
            },
            {
                "source_id": "source-b",
                "title": "Fonte oficial B",
                "url": "https://www.gov.br/fonte-b",
                "version": "2026.1",
                "digest": "bbb",
                "type": "statute",
                "accessed_at": "2026-08-01",
            },
            {
                "source_id": "unused",
                "title": "Fonte não usada",
                "url": "https://www.gov.br/unused",
                "version": "1",
                "type": "statute",
                "accessed_at": "2026-08-01",
            },
        ],
    }


def _page(page_id: str = "lei-item-novo-desconto") -> dict:
    return {
        "page_id": page_id,
        "url": "/lei-14133-obras/teste-identidade/",
        "title": "Título público",
        "meta_description": "Descrição pública",
        "direct_answer": "Resposta pública suficientemente longa para a página.",
        "body_markdown": "## Corpo\n\nTexto técnico com contexto público.",
        "lead": "Lead revisado pelo humano.",
        "theme": "tema público",
        "journey": "execucao",
        "primary_keyword": "termo público",
        "legal_devices": ["art.125"],
        "sources": ["source-a"],
        "cta_whatsapp": "Mensagem WhatsApp contextual.",
        "cta_email_subject": "Assunto público",
        "cta_email_body": "Corpo de e-mail público.",
        "cta_offer": "Oferta contextual",
        "cta_blurb": "Explicação da oferta.",
        "cta_wa_label": "Falar sobre o caso",
        "cta_email_label": "Enviar e-mail",
        "contact_email": "contato@confenge.com.br",
        "aside_title": "Título lateral",
        "aside_blurb": "Texto lateral",
        "related": [{"url": "/relacionada/", "title": "Relacionada", "cluster": "A", "kind": "Guia"}],
        "faq": [{"q": "Pergunta?", "a": "Resposta."}],
        "interaction_type": "checklist",
        "checklist_categories": ["Documentos"],
        "checklist_items": [{"category": "Documentos", "label": "Contrato", "required": True}],
        "date_published": "2026-08-02",
        "date_modified": "2026-08-02",
        "author_public": "Biblioteca técnica CONFENGE",
        "author_is_tiago": False,
        "archetype": "lei_14133",
        "status": "EDITORIAL_REVIEWED",
    }


def _checklist() -> dict[str, bool]:
    return {key: True for key in EDITORIAL_CHECKLIST_KEYS}


def _preview(page: dict, manifest: dict) -> dict:
    current = material_hash(page, manifest)
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


def _approved(manifest: dict | None = None, page: dict | None = None) -> tuple[dict, dict, dict]:
    manifest = manifest or _manifest()
    page = copy.deepcopy(page or _page())
    registry = {"schema_version": "1.0.0", "pages": []}
    upsert_page(registry, page, source_manifest=manifest)
    stored = registry["pages"][0]
    approve_human(
        registry,
        stored["page_id"],
        reviewer="Maria Silva",
        notes="Fontes, conteúdo, CTAs e riscos conferidos individualmente no preview.",
        sources_verified=["source-a"],
        checklist=_checklist(),
        preview_evidence=_preview(stored, manifest),
        source_manifest=manifest,
    )
    mark_indexable(registry, stored["page_id"], source_manifest=manifest)
    return registry, copy.deepcopy(page), manifest


@pytest.mark.parametrize(
    "name,mutate",
    [
        ("lead", lambda page: page.__setitem__("lead", "Lead alterado")),
        ("faq", lambda page: page["faq"].append({"q": "Nova?", "a": "Nova resposta"})),
        ("related", lambda page: page["related"].append({"url": "/nova/", "title": "Nova"})),
        ("cta_offer", lambda page: page.__setitem__("cta_offer", "Outra oferta")),
        ("cta_blurb", lambda page: page.__setitem__("cta_blurb", "Outro texto")),
        ("cta_labels", lambda page: page.__setitem__("cta_wa_label", "Outro rótulo")),
        ("aside", lambda page: page.__setitem__("aside_title", "Outro título lateral")),
        ("interaction", lambda page: page.__setitem__("interaction_type", "article")),
        ("checklist_category", lambda page: page.__setitem__("checklist_categories", ["Outro grupo"])),
        ("checklist_label", lambda page: page["checklist_items"][0].__setitem__("label", "Outro documento")),
        ("checklist_add", lambda page: page["checklist_items"].append({"category": "Documentos", "label": "Planilha"})),
        ("checklist_delete", lambda page: page.__setitem__("checklist_items", [])),
        ("checklist_order", lambda page: page.__setitem__("checklist_items", [{"category": "Documentos", "label": "Segundo"}, {"category": "Documentos", "label": "Contrato"}])),
        ("author", lambda page: page.__setitem__("author_public", "Outra autoria")),
        ("public_date", lambda page: page.__setitem__("date_published", "2026-08-03")),
        ("used_source", lambda page: page.__setitem__("sources", ["source-b"])),
    ],
)
def test_every_public_mutation_invalidates_approval(name, mutate):
    registry, page, manifest = _approved()
    old_hash = registry["pages"][0]["material_hash"]
    changed = copy.deepcopy(page)
    mutate(changed)
    upsert_page(registry, changed, source_manifest=manifest)
    stored = registry["pages"][0]
    assert stored["material_hash"] != old_hash, name
    assert stored["status"] == "REVIEW_REQUIRED", name
    assert "approval" not in stored, name
    assert not indexable_pages(registry, source_manifest=manifest), name


def test_used_source_manifest_url_invalidates_but_unused_source_does_not():
    registry, page, manifest = _approved()
    changed_manifest = copy.deepcopy(manifest)
    changed_manifest["sources"][0]["url"] = "https://www.gov.br/fonte-a-nova"
    upsert_page(registry, copy.deepcopy(page), source_manifest=changed_manifest)
    assert registry["pages"][0]["status"] == "REVIEW_REQUIRED"
    assert "approval" not in registry["pages"][0]

    registry, page, manifest = _approved()
    changed_manifest = copy.deepcopy(manifest)
    changed_manifest["sources"][2]["url"] = "https://www.gov.br/unused-nova"
    upsert_page(registry, copy.deepcopy(page), source_manifest=changed_manifest)
    assert registry["pages"][0]["status"] == "INDEXABLE"
    assert approval_is_current(registry["pages"][0], changed_manifest)


@pytest.mark.parametrize("field,value", [
    ("commit_sha", "b" * 40),
    ("derived_at", "2026-08-04T01:00:00Z"),
    ("report_document", "docs/editorial/report.json"),
    ("history", [{"event": "ci"}]),
    ("ci_data", {"job": "green"}),
])
def test_operational_changes_do_not_invalidate(field, value):
    registry, page, manifest = _approved()
    before = registry["pages"][0]["material_hash"]
    changed = copy.deepcopy(page)
    changed[field] = value
    upsert_page(registry, changed, source_manifest=manifest)
    assert registry["pages"][0]["material_hash"] == before
    assert registry["pages"][0]["status"] == "INDEXABLE"
    assert approval_is_current(registry["pages"][0], manifest)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda approval: approval.pop("notes"),
        lambda approval: approval.pop("checklist"),
        lambda approval: approval.__setitem__("sources_verified", []),
        lambda approval: approval.__setitem__("sources_verified", ["unknown"]),
        lambda approval: approval.__setitem__("page_id", "other-page"),
        lambda approval: approval.__setitem__("at", "not-a-timestamp"),
        lambda approval: approval.__setitem__("material_hash", "0" * 64),
        lambda approval: approval["preview"].__setitem__("preview_build_sha", "b" * 40),
    ],
)
def test_manual_approval_tampering_is_not_current(mutate):
    registry, _page_def, manifest = _approved()
    mutate(registry["pages"][0]["approval"])
    assert not approval_is_current(registry["pages"][0], manifest)


def test_source_verification_requires_exact_set_and_canonical_order():
    page = _page()
    page["sources"] = ["source-b", "source-a"]
    manifest = _manifest()
    assert source_verification_errors(page, [], manifest) == [
        "sources_verified_required",
        "source_verified_missing:source-a",
        "source_verified_missing:source-b",
    ]
    errors = source_verification_errors(page, ["source-a", "source-a"], manifest)
    assert "sources_verified_duplicate" in errors
    assert "source_verified_missing:source-b" in errors
    errors = source_verification_errors(page, ["source-a", "unused"], manifest)
    assert "source_verified_not_on_page:unused" in errors
    errors = source_verification_errors(page, ["source-a", "source-b", "ghost"], manifest)
    assert "source_verified_unknown:ghost" in errors


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _surface_fixture(tmp_path: Path, monkeypatch, *, page_id: str = "lei-item-novo-desconto", approved: bool = True):
    monkeypatch.setattr(truth, "ROOT", tmp_path)
    manifest = _manifest()
    page = _page(page_id)
    registry = {"pages": []}
    upsert_page(registry, page, source_manifest=manifest)
    stored = registry["pages"][0]
    if approved:
        approve_human(
            registry,
            page_id,
            reviewer="Maria Silva",
            notes="Fontes, conteúdo, CTAs e riscos conferidos individualmente no preview.",
            sources_verified=["source-a"],
            checklist=_checklist(),
            preview_evidence=_preview(stored, manifest),
            source_manifest=manifest,
        )
        mark_indexable(registry, page_id, source_manifest=manifest)
    canonical = f"{truth.SITE}{page['url']}"
    robots = "index,follow" if approved else "noindex,follow"
    html = f'<html><head><meta name="robots" content="{robots}"/><link rel="canonical" href="{canonical}"/></head><body>texto público</body></html>'
    _write(tmp_path / page["url"].strip("/") / "index.html", html)
    hub_url = "/lei-14133-obras/"
    _write(tmp_path / hub_url.strip("/") / "index.html", f'<a href="{page["url"]}">página</a>')
    sitemap = [f"{truth.SITE}{page['url']}", f"{truth.SITE}{hub_url}"] if approved else []
    _write(tmp_path / "sitemap-editorial.xml", "".join(f"<loc>{url}</loc>" for url in sitemap))
    _write(tmp_path / "sitemap-jurisprudencia.xml", "")
    _write(tmp_path / "sitemap-inteligencia.xml", "")
    _write(tmp_path / "sitemap.xml", "")
    return registry, manifest, page


@pytest.mark.parametrize(
    "case,expected",
    [
        ("missing_sitemap", "approved_missing_or_duplicate_correct_sitemap"),
        ("noindex", "approved_noindex"),
        ("wrong_canonical", "approved_wrong_canonical"),
        ("missing_html", "approved_missing_html"),
        ("unapproved_sitemap", "unapproved_in_sitemap"),
        ("backlog_indexable", "backlog_status_incoherent"),
        ("rejected_indexable", "rejected_status_incoherent"),
        ("duplicate_sitemap", "sitemap_duplicate_url"),
        ("unknown_sitemap", "sitemap_url_without_registry"),
        ("hub_unapproved", "hub_lists_unapproved"),
    ],
)
def test_surface_audit_detects_required_matrix(tmp_path, monkeypatch, case, expected):
    page_id = {
        "backlog_indexable": "lei-art124-alteracao-obra",
        "rejected_indexable": "jur-sumula-260-art",
    }.get(case, "lei-item-novo-desconto")
    approved = case not in {"unapproved_sitemap", "hub_unapproved"}
    registry, manifest, page = _surface_fixture(tmp_path, monkeypatch, page_id=page_id, approved=approved)
    sitemap = tmp_path / "sitemap-editorial.xml"
    html_path = tmp_path / page["url"].strip("/") / "index.html"
    if case == "missing_sitemap":
        _write(sitemap, f"<loc>{truth.SITE}/lei-14133-obras/</loc>")
    elif case == "noindex":
        _write(html_path, html_path.read_text().replace("index,follow", "noindex,follow"))
    elif case == "wrong_canonical":
        _write(html_path, html_path.read_text().replace(f"{truth.SITE}{page['url']}", f"{truth.SITE}/errada/"))
    elif case == "missing_html":
        html_path.unlink()
    elif case == "unapproved_sitemap":
        _write(sitemap, f"<loc>{truth.SITE}{page['url']}</loc>")
    elif case == "backlog_indexable":
        registry["pages"][0]["status"] = "INDEXABLE"
        registry["pages"][0].pop("approval", None)
    elif case == "rejected_indexable":
        registry["pages"][0]["status"] = "INDEXABLE"
        registry["pages"][0].pop("approval", None)
    elif case == "duplicate_sitemap":
        _write(sitemap, sitemap.read_text() + f"<loc>{truth.SITE}{page['url']}</loc>")
    elif case == "unknown_sitemap":
        _write(sitemap, sitemap.read_text() + f"<loc>{truth.SITE}/sem-registro/</loc>")
    elif case == "hub_unapproved":
        # The fixture's hub deliberately lists it while it remains noindex.
        pass
    contradictions, _rows, _sitemaps = truth.audit_governed_surfaces(
        registry, source_manifest=manifest
    )
    assert any(item.startswith(expected) for item in contradictions), contradictions


def test_canonical_payload_contains_used_source_identity_only():
    page = _page()
    manifest = _manifest()
    payload = canonical_material_payload(page, manifest)
    assert payload["resolved_sources"][0]["source_id"] == "source-a"
    assert payload["resolved_sources"][0]["url"] == "https://www.gov.br/fonte-a"
    assert "unused" not in json.dumps(payload, ensure_ascii=False)


def test_preview_reconfirmation_cannot_create_or_revive_approval():
    registry = {"pages": [_page()]}
    with pytest.raises(ValueError, match="approval_not_current_for_preview_reconfirmation"):
        reconfirm_approval_preview(
            registry,
            page_id="lei-item-novo-desconto",
            expected_head="a" * 40,
        )
    assert registry["pages"][0]["status"] == "EDITORIAL_REVIEWED"
    assert "approval" not in registry["pages"][0]
