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
    load_registry,
    mark_indexable,
    material_hash,
    revoke_auto_approvals,
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
    )
    mark_indexable(reg, "tmp3")
    assert reg["pages"][0]["status"] == "INDEXABLE"


def test_revoke_operator_stamps():
    reg = {
        "schema_version": "1.0.0",
        "pages": [
            {
                "page_id": "x",
                "url": "/x/",
                "status": "INDEXABLE",
                "material_hash": "abc",
                "approval": {"reviewer": "editorial-wave1-operator", "material_hash": "abc"},
                "history": [],
            }
        ],
    }
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


# --- P0 legal regressions + claim–source layer (shipped validators) ---

from scripts.editorial.sources import (  # noqa: E402
    page_claims_ok,
    page_text_forbidden_legal_errors,
    validate_claim,
    claim_supported_by_excerpt,
)


def _page_by_id(page_id: str) -> dict:
    path = PAGES_DIR / f"{page_id}.json"
    assert path.exists(), page_id
    return json.loads(path.read_text(encoding="utf-8"))


def test_art124_has_no_vinculo_societario_falsehood():
    """Art. 124 page must not assert vínculo societário as inciso II hypothesis."""
    page = _page_by_id("lei-art124-alteracao-obra")
    issues = page_text_forbidden_legal_errors(page)
    assert not any("vinculo_societario" in i or "vínculo" in i for i in issues), issues
    blob = " ".join(
        [
            page.get("direct_answer") or "",
            page.get("body_markdown") or "",
            page.get("meta_description") or "",
        ]
    ).lower()
    # Affirmative falsehood patterns must be absent (denials are ok)
    assert "por acordo entre as partes (garantia, regime de execução, forma de pagamento, atualização de vínculo societário" not in blob
    # Must list the real II axes
    body = page["body_markdown"].lower()
    assert "substituição da garantia" in body or "substituicao da garantia" in body
    assert "regime de execução" in body or "regime de execucao" in body
    assert "forma de pagamento" in body
    assert "equilíbrio econômico-financeiro" in body or "equilibrio economico-financeiro" in body


def test_art124_regression_fails_if_societario_returns():
    """Shipped detector must fail when incorrect art.124+societário claim is injected."""
    page = _page_by_id("lei-art124-alteracao-obra")
    poisoned = {
        **page,
        "direct_answer": (
            page["direct_answer"]
            + " O art. 124, inciso II, inclui atualização de vínculo societário do contratado."
        ),
    }
    issues = page_text_forbidden_legal_errors(poisoned)
    assert any("art124_false_vinculo_societario" in i for i in issues), issues


def test_reequilibrio_page_requires_art135_for_repactuacao():
    page = _page_by_id("lei-reequilibrio-reajuste")
    blob = (
        (page.get("direct_answer") or "")
        + " "
        + (page.get("body_markdown") or "")
    ).lower()
    assert "repactua" in blob
    assert re.search(r"art\.?\s*135", blob)
    # Must not treat repactuação as ordinary for any obra
    assert "não é o mecanismo ordinário" in blob or "nao e o mecanismo ordinario" in blob or "não é o mecanismo ordinario" in blob
    assert "dedicação exclusiva" in blob or "dedicacao exclusiva" in blob
    assert "predominância de mão de obra" in blob or "predominancia de mao de obra" in blob or "predominância de mao" in blob
    issues = page_text_forbidden_legal_errors(page)
    assert "repactuacao_without_art135" not in issues, issues
    # legal devices include art.135
    devices = " ".join(page.get("legal_devices") or []).lower()
    assert "135" in devices


def test_repactuacao_without_art135_fails_shipped_gate():
    page = {
        "page_id": "tmp-repact",
        "url": "/tmp-repact/",
        "direct_answer": "A repactuação resolve aumento de mão de obra em qualquer obra pública.",
        "body_markdown": "Peça repactuação do contrato de obra sem citar dispositivo.",
        "claims": [],
    }
    issues = page_text_forbidden_legal_errors(page)
    assert "repactuacao_without_art135" in issues


def test_claim_source_validation_rejects_unsupported_excerpt():
    man = load_manifest()
    bad = {
        "claim_id": "art124-inciso-ii-hipoteses-bad",
        "claim": "O art. 124, II, autoriza atualização de vínculo societário do contratado.",
        "claim_type": "statutory_text",
        "source_ids": ["lei-14133-art124"],
        "source_locator": "art. 124, II",
        "support_level": "direct",
        "official_excerpt": "II - por acordo entre as partes: a) quando conveniente a substituição da garantia de execução",
        "interpretation": "errado",
        "limitations": "teste",
        "verified_at": "2026-08-02",
        "verified_by": None,
    }
    issues = validate_claim(bad, manifest=man, page_source_ids=["lei-14133-art124"])
    # excerpt does not support vínculo societário claim
    assert any(
        "excerpt_does_not_support_claim" in i
        or "forbidden_association" in i
        or "excerpt_contradicts_claim" in i
        for i in issues
    ), issues


def test_claim_contradiction_art125_unlimited_fails_even_with_token_overlap():
    """Honest contradiction: shares tokens with art.125 but asserts unlimited acréscimo."""
    from scripts.editorial.sources import claim_contradicts_excerpt, claim_supported_by_excerpt

    man = load_manifest()
    excerpt = (
        "Nas alterações unilaterais a que se refere o inciso I do caput do art. 124 desta Lei, "
        "o contratado será obrigado a aceitar, nas mesmas condições contratuais, acréscimos ou "
        "supressões de até 25% (vinte e cinco por cento) do valor inicial atualizado do contrato "
        "que se fizerem nas obras, nos serviços ou nas compras, e, no caso de reforma de edifício "
        "ou de equipamento, o limite para os acréscimos será de 50% (cinquenta por cento)."
    )
    claim = "O art. 125 permite acréscimo ilimitado de obras sem teto percentual."
    # Must detect contradiction (not only fail via FORBIDDEN_CLAIM_ASSOCIATIONS)
    assert claim_contradicts_excerpt(claim, excerpt)
    assert claim_supported_by_excerpt(claim, excerpt) is False
    issues = validate_claim(
        {
            "claim_id": "bad-art125-unlimited",
            "claim": claim,
            "claim_type": "statutory_text",
            "source_ids": ["lei-14133-art125"],
            "source_locator": "art. 125",
            "support_level": "direct",
            "official_excerpt": excerpt,
            "interpretation": "proposição falsa para teste de gate",
            "limitations": "teste",
            "verified_at": "2026-08-02",
            "verified_by": None,
        },
        manifest=man,
        page_source_ids=["lei-14133-art125"],
    )
    assert any("excerpt_contradicts_claim" in i for i in issues), issues
    assert any("excerpt_does_not_support_claim" in i for i in issues), issues


def test_claim_contradiction_art135_any_obra_fails():
    """Repactuação for any obra contradicts art.135 continuous-labor scope despite shared tokens."""
    from scripts.editorial.sources import claim_contradicts_excerpt, claim_supported_by_excerpt

    man = load_manifest()
    excerpt = (
        "Os preços dos contratos para serviços contínuos com regime de dedicação exclusiva de mão "
        "de obra ou com predominância de mão de obra serão repactuados para manutenção do equilíbrio "
        "econômico-financeiro, mediante demonstração analítica da variação dos custos contratuais"
    )
    claim = "A repactuação do art. 135 aplica-se a qualquer contrato de obra pública."
    assert claim_contradicts_excerpt(claim, excerpt)
    assert claim_supported_by_excerpt(claim, excerpt) is False
    issues = validate_claim(
        {
            "claim_id": "bad-art135-any-obra",
            "claim": claim,
            "claim_type": "statutory_text",
            "source_ids": ["lei-14133-art135"],
            "source_locator": "art. 135",
            "support_level": "direct",
            "official_excerpt": excerpt,
            "interpretation": "proposição falsa para teste de gate",
            "limitations": "teste",
            "verified_at": "2026-08-02",
            "verified_by": None,
        },
        manifest=man,
        page_source_ids=["lei-14133-art135"],
    )
    assert any("excerpt_contradicts_claim" in i for i in issues), issues
    assert any("repactuacao_broadened" in i or "excerpt_does_not_support" in i for i in issues)


def test_claim_correct_repactuacao_denial_passes():
    """Correct denial of broad repactuação scope must PASS (not false-positive on 'qualquer')."""
    from scripts.editorial.sources import claim_contradicts_excerpt, claim_supported_by_excerpt

    man = load_manifest()
    excerpt = (
        "Os preços dos contratos para serviços contínuos com regime de dedicação exclusiva de mão "
        "de obra ou com predominância de mão de obra serão repactuados para manutenção do equilíbrio "
        "econômico-financeiro, mediante demonstração analítica da variação dos custos contratuais"
    )
    # Real page-style denial: uses "qualquer" only inside a negative scope statement
    claim = (
        "A repactuação do art. 135 não se aplica a qualquer contrato de obra; "
        "aplica-se a serviços contínuos com dedicação exclusiva ou predominância de mão de obra, "
        "mediante demonstração analítica da variação dos custos contratuais."
    )
    assert claim_contradicts_excerpt(claim, excerpt) == [], claim_contradicts_excerpt(claim, excerpt)
    assert claim_supported_by_excerpt(claim, excerpt) is True
    issues = validate_claim(
        {
            "claim_id": "good-art135-denial-scope",
            "claim": claim,
            "claim_type": "statutory_text",
            "source_ids": ["lei-14133-art135"],
            "source_locator": "art. 135, caput",
            "support_level": "direct",
            "official_excerpt": excerpt,
            "interpretation": "Escopo legal restrito; não é mecanismo ordinário de obra por escopo.",
            "limitations": "Exige previsão edital/contrato e datas vinculadas.",
            "verified_at": "2026-08-02",
            "verified_by": None,
        },
        manifest=man,
        page_source_ids=["lei-14133-art135"],
    )
    assert not any("excerpt_contradicts_claim" in i for i in issues), issues
    assert not any("excerpt_does_not_support_claim" in i for i in issues), issues


def test_claim_supported_by_excerpt_positive():
    claim = "substituição da garantia de execução nas alterações por acordo"
    excerpt = (
        "II - por acordo entre as partes: a) quando conveniente a substituição da garantia de execução; "
        "b) quando necessária a modificação do regime de execução"
    )
    assert claim_supported_by_excerpt(claim, excerpt)


def test_lei_pages_have_device_coverage_in_claims():
    """Each lei page legal_device must appear in claim bank (proposition coverage)."""
    man = load_manifest()
    for page in _load_pages():
        if page.get("archetype") != "lei_14133":
            continue
        issues = page_claims_ok(page, manifest=man, require_claims=True)
        assert not issues, (page["page_id"], issues)
        assert len(page.get("claims") or []) >= 2, page["page_id"]


def test_all_wave1_lei_pages_have_valid_claims():
    man = load_manifest()
    for page in _load_pages():
        if page.get("archetype") != "lei_14133":
            continue
        issues = page_claims_ok(page, manifest=man, require_claims=True)
        assert not issues, (page["page_id"], issues)


def test_evaluate_page_includes_claim_layer():
    """evaluate_page must surface claim failures (not only domain sources)."""
    man = load_manifest()
    page = _page_by_id("lei-art124-alteracao-obra")
    page = {**page, "status": "EDITORIAL_REVIEWED", "material_hash": material_hash(page)}
    # strip claims to force failure
    broken = {**page, "claims": []}
    html = render_page(broken)
    gate = evaluate_page(broken, html, manifest=man)
    assert not gate["ok"]
    assert any("missing_claims" in i for i in gate["issues"])


import re  # noqa: E402
