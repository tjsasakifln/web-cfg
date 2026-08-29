#!/usr/bin/env python3
"""Derive editorial truth from public material, approvals and generated surfaces.

Commit SHAs in documents are informational.  Review approval is valid only
when the canonical material, exact sources and PR deploy-preview evidence all
match.  This module audits every governed page, not only the backlog.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.reproducible import build_timestamp  # noqa: E402
SITE = "https://confenge.com.br"

from scripts.editorial.cohort import (  # noqa: E402
    FIRST_COHORT_IDS,
    FIRST_COHORT_SET,
    MIGRATED_IDS,
    REJECTED_IDS,
    WAVE1_IDS,
)
from scripts.editorial.registry import (  # noqa: E402
    REVIEW_PREVIEW_BASE_URL,
    approval_is_current,
    indexable_pages,
    material_hash,
    resolve_page_sources,
)
from scripts.editorial.sources import load_manifest  # noqa: E402

TERMINAL_ALLOWED = frozenset(
    {
        "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE",
        "BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS",
        "READY_FOR_NAMED_HUMAN_APPROVAL",
        "READY_FOR_PARTIAL_RELEASE",
        "READY_FOR_RELEASE",
    }
)

HUBS = {
    "lei_14133": "/lei-14133-obras/",
    "guia": "/guias-contratos-obras/",
    "jurisprudencia": "/jurisprudencia-contratos-obras/",
}
SEGMENT_FOR_ARCHETYPE = {
    "lei_14133": "sitemap-editorial.xml",
    "guia": "sitemap-editorial.xml",
    "jurisprudencia": "sitemap-jurisprudencia.xml",
    "inteligencia": "sitemap-inteligencia.xml",
}
SEGMENT_FILES = (
    "sitemap.xml",
    "sitemap-editorial.xml",
    "sitemap-jurisprudencia.xml",
    "sitemap-inteligencia.xml",
)

FIRST_COHORT_CONTEXT: dict[str, dict[str, str]] = {
    "guia-checklist-aditivo": {
        "search_intent": "Checklist operacional para protocolar pedido de aditivo de obra",
        "demand_evidence": "A query 'aditivos obra pública' teve 5 impressões; o peer /conteudos/erro-de-projeto-gera-aditivo-obra-publica/ teve 3 impressões e posição 2,33 no export GSC de 2026-07-30.",
        "objective": "Organizar o dossiê e seus bloqueadores antes do protocolo, sem vender um checklist como substituto de análise jurídica.",
        "internal_competitor": "/conteudos/erro-de-projeto-gera-aditivo-obra-publica/",
        "cannibalization_risk": "parcial: diferenciar intenção (erro de projeto versus checklist transversal) e manter linkagem contextual.",
    },
    "lei-item-novo-desconto": {
        "search_intent": "Preço de item novo em aditivo e preservação do desconto da proposta",
        "demand_evidence": "Peer /conteudos/desconto-da-proposta-em-item-novo-aditivo/ teve 4 impressões, 1 clique e posição 7 no export GSC de 2026-07-30.",
        "objective": "Explicar a formação defensável de preço do item novo e captar pedidos de revisão de composição e documentos.",
        "internal_competitor": "/conteudos/desconto-da-proposta-em-item-novo-aditivo/",
        "cannibalization_risk": "alto: escolher canônica e impedir dual-index antes da publicação.",
    },
}


def _now() -> str:
    return build_timestamp()


def _git_sha() -> str:
    for key in ("COMMIT_REF", "CACHED_COMMIT_REF", "GITHUB_SHA"):
        value = (os.environ.get(key) or "").strip().lower()
        if re.fullmatch(r"[0-9a-f]{40}", value):
            return value
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def robots_of(html: str) -> str:
    match = re.search(r'name=["\']robots["\']\s+content=["\']([^"\']+)', html, re.I) or re.search(
        r'content=["\']([^"\']+)["\']\s+name=["\']robots["\']', html, re.I
    )
    return (match.group(1) if match else "index,follow").lower()


def canonical_of(html: str) -> str | None:
    patterns = (
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
    )
    for pattern in patterns:
        match = re.search(pattern, html, re.I)
        if match:
            return match.group(1)
    return None


def is_noindex(robots: str) -> bool:
    return "noindex" in robots.lower()


def _is_noindex_follow(robots: str) -> bool:
    tokens = {token.strip() for token in robots.lower().split(",")}
    return "noindex" in tokens and "follow" in tokens


def load_registry(path: Path | None = None) -> dict[str, Any]:
    chosen = path or (ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json")
    if not chosen.exists():
        return {"schema_version": "unknown", "pages": [], "counts": {}}
    return json.loads(chosen.read_text(encoding="utf-8"))


def sitemap_locs(path: Path) -> list[str]:
    if not path.exists():
        return []
    return re.findall(r"<loc>([^<]+)</loc>", path.read_text(encoding="utf-8", errors="replace"))


def _path_from_loc(loc: str) -> str:
    parsed = urlparse(loc)
    path = parsed.path if parsed.scheme else loc
    if not path.startswith("/"):
        path = "/" + path
    return path


def _html_path(page_url: str) -> Path:
    return ROOT / page_url.strip("/") / "index.html"


def count_indexable_conteudos() -> int:
    count = 0
    folder = ROOT / "conteudos"
    if not folder.exists():
        return 0
    for path in folder.glob("*/index.html"):
        if not is_noindex(robots_of(path.read_text(encoding="utf-8", errors="replace"))):
            count += 1
    return count


def hub_claimed_guide_count() -> int | None:
    hub = ROOT / "conteudos" / "index.html"
    if not hub.exists():
        return None
    text = hub.read_text(encoding="utf-8", errors="replace")
    match = re.search(r'"numberOfItems"\s*:\s*(\d+)', text)
    if match:
        return int(match.group(1))
    match = re.search(r"\b(\d{1,3})\s+guias?\s+indexáveis", text, re.I)
    return int(match.group(1)) if match else None


def _cohort_summary(
    pages: list[dict[str, Any]], valid_indexable_ids: set[str], manifest: dict[str, Any]
) -> dict[str, Any]:
    return {
        "total": len(pages),
        "editorial_reviewed": sum(1 for page in pages if page.get("status") == "EDITORIAL_REVIEWED"),
        "human_approved": sum(
            1
            for page in pages
            if page.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}
            and approval_is_current(page, manifest)
        ),
        "indexable": sum(1 for page in pages if page.get("page_id") in valid_indexable_ids),
        "page_ids": [page.get("page_id") for page in pages],
    }


def _sitemap_inventory() -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    locs = {name: sitemap_locs(ROOT / name) for name in SEGMENT_FILES}
    paths = {name: [_path_from_loc(loc) for loc in values] for name, values in locs.items()}
    return locs, paths


def _hub_url_for(page: dict[str, Any]) -> str | None:
    return HUBS.get(str(page.get("archetype") or ""))


def audit_governed_surfaces(
    registry: dict[str, Any], *, source_manifest: dict[str, Any] | None = None
) -> tuple[list[str], list[dict[str, Any]], dict[str, Any]]:
    """Audit all three policy groups against HTML, hubs and every sitemap.

    The function is intentionally public and deterministic so regression tests
    can inject individual broken HTML/sitemap surfaces without reimplementing
    governance rules.
    """
    manifest = source_manifest or load_manifest()
    pages = list(registry.get("pages") or [])
    by_id = {page.get("page_id"): page for page in pages if page.get("page_id")}
    governed_ids = (
        set(FIRST_COHORT_IDS) | set(WAVE1_IDS) | set(MIGRATED_IDS) | set(REJECTED_IDS)
    )
    governed = [by_id[page_id] for page_id in sorted(governed_ids) if page_id in by_id]
    valid = indexable_pages(
        registry, allowed_page_ids=FIRST_COHORT_SET, source_manifest=manifest
    )
    valid_ids = {page.get("page_id") for page in valid}
    valid_urls = {str(page.get("url")) for page in valid if page.get("url")}
    contradictions: list[str] = []
    rows: list[dict[str, Any]] = []
    locs, paths_by_sitemap = _sitemap_inventory()
    path_occurrences: dict[str, list[str]] = defaultdict(list)
    for sitemap_name, paths in paths_by_sitemap.items():
        for path in paths:
            path_occurrences[path].append(sitemap_name)

    # Expected sitemap set: validated cohort pages plus only hubs with an
    # indexable child.  Hubs are intentionally in sitemap-editorial.xml.
    expected_hubs = {
        hub_url
        for archetype, hub_url in HUBS.items()
        if any(page.get("archetype") == archetype for page in valid)
    }
    expected_urls = valid_urls | expected_hubs
    known_governed_urls = {
        str(page.get("url")) for page in governed if page.get("url")
    }

    for page in governed:
        page_id = str(page.get("page_id"))
        page_url = str(page.get("url") or "")
        html_path = _html_path(page_url) if page_url else None
        exists = bool(html_path and html_path.exists())
        html = html_path.read_text(encoding="utf-8", errors="replace") if exists else ""
        robots = robots_of(html) if exists else "missing"
        canonical = canonical_of(html) if exists else None
        approved_indexable = page_id in valid_ids
        sitemap_names = path_occurrences.get(page_url, [])
        hub_url = _hub_url_for(page)
        hub_html_path = _html_path(hub_url) if hub_url else None
        hub_html = (
            hub_html_path.read_text(encoding="utf-8", errors="replace")
            if hub_html_path and hub_html_path.exists()
            else ""
        )
        hub_listed = bool(page_url and re.search(r'href=["\']' + re.escape(page_url) + r'["\']', hub_html, re.I))
        row = {
            "page_id": page_id,
            "url": page_url,
            "registry_status": page.get("status"),
            "valid_indexable": approved_indexable,
            "html_exists": exists,
            "robots": robots,
            "canonical": canonical,
            "sitemaps": sitemap_names,
            "hub": hub_url,
            "hub_listed": hub_listed,
        }
        rows.append(row)

        if approved_indexable:
            expected_canonical = f"{SITE}{page_url}"
            if not exists:
                contradictions.append(f"approved_missing_html:{page_id}")
            else:
                if is_noindex(robots):
                    contradictions.append(f"approved_noindex:{page_id}")
                if canonical != expected_canonical:
                    contradictions.append(f"approved_wrong_canonical:{page_id}")
                if re.search(r"deploy-preview|review_target_sha|dataset_hash|page_material_hash|\bpipeline\b", html, re.I):
                    contradictions.append(f"approved_internal_or_preview_language:{page_id}")
            expected_segment = SEGMENT_FOR_ARCHETYPE.get(str(page.get("archetype") or ""), "sitemap-editorial.xml")
            if sitemap_names.count(expected_segment) != 1:
                contradictions.append(f"approved_missing_or_duplicate_correct_sitemap:{page_id}")
            if len(sitemap_names) != 1:
                contradictions.append(f"approved_in_incompatible_sitemap:{page_id}")
            if hub_url and not hub_listed:
                contradictions.append(f"approved_missing_from_hub:{page_id}")
        else:
            if exists and not _is_noindex_follow(robots):
                contradictions.append(f"unapproved_not_noindex_follow:{page_id}")
            if sitemap_names:
                contradictions.append(f"unapproved_in_sitemap:{page_id}")
            if hub_listed:
                contradictions.append(f"hub_lists_unapproved:{page_id}")
            if page_id in REJECTED_IDS and page.get("status") != "REJECTED":
                contradictions.append(f"rejected_status_incoherent:{page_id}")
            if page_id in MIGRATED_IDS:
                if page.get("status") != "MIGRATED":
                    contradictions.append(f"migrated_status_incoherent:{page_id}")
                declared_canonical = str(page.get("canonical_path") or "")
                if not declared_canonical or canonical != f"{SITE}{declared_canonical}":
                    contradictions.append(f"migrated_wrong_canonical:{page_id}")
            if page_id in (WAVE1_IDS - FIRST_COHORT_SET) and page.get("status") != "EDITORIAL_REVIEWED":
                contradictions.append(f"backlog_status_incoherent:{page_id}")

    # Each approved page must have exactly one entry across all public sitemap
    # surfaces; a duplicate in main sitemap is a duplicate too.
    for page_url in valid_urls:
        if len(path_occurrences.get(page_url, [])) != 1:
            page_id = next(
                (page.get("page_id") for page in valid if page.get("url") == page_url), page_url
            )
            contradictions.append(f"approved_sitemap_occurrence_not_exactly_one:{page_id}")

    # Editorial/jurisprudence sitemap files are governed exclusively by this
    # editorial release.  Any URL there must be a valid page or allowed hub.
    actual_governed_segment_urls: set[str] = set()
    for sitemap_name in ("sitemap-editorial.xml", "sitemap-jurisprudencia.xml"):
        for path in paths_by_sitemap.get(sitemap_name, []):
            actual_governed_segment_urls.add(path)
            if path in known_governed_urls and path not in valid_urls:
                contradictions.append(f"sitemap_without_valid_approval:{path}")
            elif path not in known_governed_urls and path not in expected_hubs:
                contradictions.append(f"sitemap_url_without_registry:{path}")
            if len(path_occurrences.get(path, [])) > 1:
                contradictions.append(f"sitemap_duplicate_url:{path}")
    if actual_governed_segment_urls != expected_urls:
        missing = sorted(expected_urls - actual_governed_segment_urls)
        unexpected = sorted(actual_governed_segment_urls - expected_urls)
        if missing:
            contradictions.append("sitemap_expected_urls_missing:" + ",".join(missing))
        if unexpected:
            contradictions.append("sitemap_unexpected_urls:" + ",".join(unexpected))

    return contradictions, rows, {
        "locs": locs,
        "paths": paths_by_sitemap,
        "expected_urls": sorted(expected_urls),
        "valid_urls": sorted(valid_urls),
        "expected_hubs": sorted(expected_hubs),
    }


def compute_terminal_status(
    *, contradictions: list[str], cohort_editorial_reviewed: int, cohort_indexable: int, rejected_count: int
) -> str:
    if contradictions:
        return "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
    if cohort_indexable == 0 and cohort_editorial_reviewed == len(FIRST_COHORT_IDS) and rejected_count >= 1:
        return "READY_FOR_NAMED_HUMAN_APPROVAL"
    if 0 < cohort_indexable < len(FIRST_COHORT_IDS):
        return "READY_FOR_PARTIAL_RELEASE"
    if cohort_indexable == len(FIRST_COHORT_IDS):
        return "READY_FOR_RELEASE"
    return "BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS"


def derive_editorial_truth(reg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Derive release truth and surface contradictions from the registry."""
    registry = reg if reg is not None else load_registry()
    manifest = load_manifest()
    pages = list(registry.get("pages") or [])
    by_id = {page.get("page_id"): page for page in pages if page.get("page_id")}
    cohort = [by_id[page_id] for page_id in FIRST_COHORT_IDS if page_id in by_id]
    backlog = [
        page
        for page in pages
        if page.get("page_id") in WAVE1_IDS and page.get("page_id") not in FIRST_COHORT_SET
    ]
    rejected = [
        page for page in pages if page.get("page_id") in REJECTED_IDS or page.get("status") == "REJECTED"
    ]
    migrated = [
        page for page in pages if page.get("page_id") in MIGRATED_IDS or page.get("status") == "MIGRATED"
    ]
    valid_indexable = indexable_pages(
        registry, allowed_page_ids=FIRST_COHORT_SET, source_manifest=manifest
    )
    valid_ids = {page.get("page_id") for page in valid_indexable}
    contradictions: list[str] = []
    if set(page.get("page_id") for page in cohort) != FIRST_COHORT_SET:
        contradictions.append("first_cohort_registry_missing_page")
    for page in pages:
        state = page.get("status")
        if state in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"} and not approval_is_current(page, manifest):
            contradictions.append(f"invalid_approval_identity:{page.get('page_id')}")
        if page.get("page_id") not in FIRST_COHORT_SET and page.get("page_id") in valid_ids:
            contradictions.append(f"outside_first_cohort_indexable:{page.get('page_id')}")

    audit_contradictions, surface_rows, sitemap_audit = audit_governed_surfaces(
        registry, source_manifest=manifest
    )
    contradictions.extend(audit_contradictions)
    # Stable order makes generated reports and tests reviewable.
    contradictions = sorted(set(contradictions))

    conteudos_indexable = count_indexable_conteudos()
    hub_count = hub_claimed_guide_count()
    if hub_count is not None and hub_count != conteudos_indexable:
        contradictions.append(f"hub_count_mismatch:hub={hub_count},indexable_conteudos={conteudos_indexable}")
    if hub_count == 120:
        contradictions.append("hub_claims_false_120_guides")
    contradictions = sorted(set(contradictions))

    first = _cohort_summary(cohort, valid_ids, manifest)
    backlog_summary = _cohort_summary(backlog, valid_ids, manifest)
    terminal = compute_terminal_status(
        contradictions=contradictions,
        cohort_editorial_reviewed=first["editorial_reviewed"],
        cohort_indexable=first["indexable"],
        rejected_count=len(rejected),
    )
    released_ids = [page_id for page_id in FIRST_COHORT_IDS if page_id in valid_ids]
    awaiting_ids = [page_id for page_id in FIRST_COHORT_IDS if page_id not in valid_ids]
    return {
        "schema_version": "3.0.0",
        "derived_at": _now(),
        "commit_sha": _git_sha(),
        "commit_sha_role": "informational_only",
        "terminal_status": terminal,
        "registry_counts": dict(Counter((page.get("status") or "DRAFT") for page in pages)),
        "first_cohort": first,
        "wave1": first,
        "editorial_backlog": backlog_summary,
        "rejected": {"count": len(rejected), "page_ids": [page.get("page_id") for page in rejected]},
        "migrated": {"count": len(migrated), "page_ids": [page.get("page_id") for page in migrated]},
        "release": {
            "approved_count": first["human_approved"],
            "released_count": len(released_ids),
            "cohort_complete": len(released_ids) == len(FIRST_COHORT_IDS),
            "released_page_ids": released_ids,
            "awaiting_page_ids": awaiting_ids,
        },
        "public_inventory": {
            "conteudos_indexable": conteudos_indexable,
            "hub_claimed_guides": hub_count,
            "legacy_indexable_public_surface": conteudos_indexable,
            "first_cohort_awaiting_approval": first["editorial_reviewed"],
            "first_cohort_published": first["indexable"],
            "editorial_backlog_awaiting_approval": backlog_summary["editorial_reviewed"],
            "note": (
                "Only FIRST_COHORT_IDS may become indexable through this registry. "
                "A legacy /conteudos/ canary requires its own fail-closed approval gate."
            ),
        },
        "sitemaps": {
            "editorial_locs": len(sitemap_audit["locs"].get("sitemap-editorial.xml", [])),
            "jurisprudencia_locs": len(sitemap_audit["locs"].get("sitemap-jurisprudencia.xml", [])),
            "editorial_urls": sitemap_audit["paths"].get("sitemap-editorial.xml", []),
            "expected_urls": sitemap_audit["expected_urls"],
            "valid_page_urls": sitemap_audit["valid_urls"],
            "approved_hubs": sitemap_audit["expected_hubs"],
        },
        "surface_audit": surface_rows,
        "wave1_pages": surface_rows,
        "contradictions": contradictions,
        "ok": not contradictions,
        "will_not_impersonate_named_human": True,
        "max_terminal_without_external_human": "READY_FOR_NAMED_HUMAN_APPROVAL",
    }


def _packet_page(page: dict[str, Any], manifest: dict[str, Any], previous_hash: str | None = None) -> dict[str, Any]:
    context = FIRST_COHORT_CONTEXT[page["page_id"]]
    approval = page.get("approval") or {}
    current_hash = material_hash(page, manifest)
    return {
        "page_id": page["page_id"],
        "url": page["url"],
        "preview": f"{REVIEW_PREVIEW_BASE_URL}{page['url']}",
        "title": page.get("title"),
        "search_intent": context["search_intent"],
        "demand_evidence": context["demand_evidence"],
        "objective": context["objective"],
        "conclusion_summary": page.get("direct_answer"),
        "legal_sources": list(page.get("sources") or []),
        "resolved_sources": resolve_page_sources(page, manifest),
        "legal_risk": "Dispositivos: " + ", ".join(page.get("legal_devices") or []) + ". Conteúdo técnico-informativo; não substitui assessoria jurídica no caso concreto.",
        "cannibalization": {
            "internal_competitor": context["internal_competitor"],
            "risk": context["cannibalization_risk"],
        },
        "cta": {
            "offer": page.get("cta_offer"),
            "whatsapp": page.get("cta_whatsapp"),
            "email_subject": page.get("cta_email_subject"),
        },
        "material_hash": current_hash,
        "material_diff_since_last_packet": {
            "previous_material_hash": previous_hash,
            "current_material_hash": current_hash,
            "changed": previous_hash is not None and previous_hash != current_hash,
            "reason": "v3 now commits every public page field plus resolved used-source identity.",
        },
        "registry_status": page.get("status"),
        "approval_identity": (
            {
                "schema_version": approval.get("schema_version"),
                "page_id": approval.get("page_id"),
                "material_hash": approval.get("material_hash"),
                "state": approval.get("state"),
                "reviewer": approval.get("reviewer"),
                "reviewed_at": approval.get("at"),
                "preview": approval.get("preview"),
            }
            if approval
            else None
        ),
        "decision_reason": "Aprovar somente após conferir fontes, conteúdo material, canibalização e a identidade do deploy preview. O hash deve coincidir com o runtime packet.",
    }


def _previous_packet_hashes() -> dict[str, str]:
    path = ROOT / "docs" / "editorial" / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if not path.exists():
        return {}
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        str(row.get("page_id")): str(row.get("material_hash"))
        for row in old.get("pages") or []
        if row.get("page_id") and row.get("material_hash")
    }


def review_packet(
    reg: dict[str, Any], truth: dict[str, Any], *, previous_hashes: dict[str, str] | None = None
) -> dict[str, Any]:
    manifest = load_manifest()
    by_id = {page.get("page_id"): page for page in reg.get("pages") or []}
    missing = [page_id for page_id in FIRST_COHORT_IDS if page_id not in by_id]
    prior = previous_hashes or _previous_packet_hashes()
    pages = [
        _packet_page(by_id[page_id], manifest, prior.get(page_id))
        for page_id in FIRST_COHORT_IDS
        if page_id in by_id
    ]
    return {
        "schema_version": "3.0.0",
        "decision_schema_version": "3.0.0",
        "title": "Primeira coorte editorial: revisão humana individual no deploy preview",
        "commit_sha": truth.get("commit_sha"),
        "commit_sha_role": "informational_only",
        "derived_at": truth.get("derived_at"),
        "terminal_status": truth.get("terminal_status"),
        "review_target": {
            "preview_base_url": REVIEW_PREVIEW_BASE_URL,
            "runtime_evidence_url": f"{REVIEW_PREVIEW_BASE_URL}/.well-known/editorial-review-packet.json",
            "build_info_url": f"{REVIEW_PREVIEW_BASE_URL}/.well-known/build-info.json",
            "review_target_sha": "resolved_and_verified_at_runtime",
            "preview_build_sha": "resolved_and_verified_at_runtime",
            "preview_generated_at": "resolved_and_verified_at_runtime",
            "production_urls_allowed": False,
        },
        "summary": {
            "first_cohort_total": len(FIRST_COHORT_IDS),
            "awaiting_human": truth["first_cohort"]["editorial_reviewed"],
            "human_approved": truth["first_cohort"]["human_approved"],
            "indexable": truth["first_cohort"]["indexable"],
            "editorial_backlog_awaiting_approval": truth["editorial_backlog"]["editorial_reviewed"],
            "rejected": truth["rejected"]["count"],
            **truth["release"],
        },
        "rules": [
            "Uma página por aprovação; nunca lote.",
            "Somente humano nomeado fora de CI/automação.",
            "Todo campo público e toda fonte usada entram no material_hash canônico.",
            "O CLI verifica build-info, runtime packet e HTML do deploy preview, nunca a produção.",
            "Apenas as três páginas desta primeira coorte podem receber --indexable.",
            "Páginas fora da coorte e jur-sumula-260-art permanecem noindex.",
        ],
        "missing_page_ids": missing,
        "pages": pages,
    }


def write_human_action_now(packet: dict[str, Any]) -> Path:
    """Write the only human checkpoint, always pointing to deploy preview."""
    target = packet["review_target"]
    lines = [
        "# Ação humana obrigatória — primeira coorte editorial",
        "",
        "**Estado:** pronto apenas para revisão humana individual. Nenhum agente, CI ou bot aprova páginas, publica URLs ou faz merge.",
        "",
        "A aprovação vale para o conteúdo material canônico, as fontes exatas e o deploy preview, não para uma URL de produção nem para um SHA meramente informativo.",
        "",
        "## Antes de cada decisão",
        "",
        f"1. Atualize a branch do PR e execute `npm run editorial:preview -- --expected-head \"$(git rev-parse HEAD)\"`.",
        f"2. Confirme HTTP 200 e o mesmo SHA em [{target['build_info_url']}]({target['build_info_url']}) e no [runtime packet]({target['runtime_evidence_url']}).",
        "3. Revise a URL de preview, as fontes e a decisão de canibalização da página abaixo.",
        "4. Rode somente um comando de aprovação por vez, fora de CI. O CLI volta a verificar o preview antes de gravar qualquer decisão.",
        "",
    ]
    checklist = ",".join(
        [
            "sources_verified",
            "legal_devices_checked",
            "naturalness_ok",
            "cta_contextual",
            "no_fictitious_authorship",
            "cannibalization_resolved_or_blocked",
            "material_hash_confirmed",
            "no_indecent_promise",
        ]
    )
    for page in packet.get("pages") or []:
        cannibalization = page.get("cannibalization") or {}
        lines.extend(
            [
                f"## {page.get('title')}",
                "",
                f"- Preview: {page.get('preview')}",
                f"- Material hash v3: `{page.get('material_hash')}`",
                f"- Fontes a conferir: `{','.join(page.get('legal_sources') or [])}`",
                f"- Concorrente interno: `{cannibalization.get('internal_competitor')}`",
                f"- Risco de canibalização: {cannibalization.get('risk')}",
                "",
                "```bash",
                "ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \\",
                '  --reviewer "<nome humano real>" \\',
                f"  --page-id {page.get('page_id')} \\",
                '  --notes "<notas concretas da revisão humana, com ao menos 20 caracteres>" \\',
                f"  --sources {','.join(page.get('legal_sources') or [])} \\",
                f"  --checklist {checklist} \\",
                f"  --material-hash {page.get('material_hash')} \\",
                f"  --preview-base-url {REVIEW_PREVIEW_BASE_URL} \\",
                "  --confirm \\",
                "  --indexable",
                "```",
                "",
            ]
        )
    lines.extend(
        [
            "As outras 8 páginas seguem `EDITORIAL_REVIEWED` e noindex; `jur-sumula-260-art` segue `REJECTED`. Após um commit não material, confirme e registre o novo preview com `python3 scripts/editorial/preview.py --reconfirm-approval --page-id PAGE_ID --expected-head \"$(git rev-parse HEAD)\"`; esse comando não cria aprovação. Qualquer mudança material remove a aprovação e retorna a página para `REVIEW_REQUIRED`.",
            "",
        ]
    )
    path = ROOT / "docs" / "editorial" / "HUMAN-ACTION-NOW.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def write_terminal_result(truth: dict[str, Any] | None = None) -> Path:
    registry = load_registry()
    truth = truth or derive_editorial_truth(registry)
    first = truth["first_cohort"]
    prior = _previous_packet_hashes()
    out = {
        "schema_version": "3.0.0",
        "terminal_status": truth["terminal_status"],
        "commit_sha": truth["commit_sha"],
        "commit_sha_role": "informational_only",
        "derived_at": _now(),
        "first_cohort_total": first["total"],
        "indexable_count": first["indexable"],
        "human_approved_count": first["human_approved"],
        "awaiting_human": first["editorial_reviewed"],
        "editorial_backlog_awaiting_approval": truth["editorial_backlog"]["editorial_reviewed"],
        "rejected": truth["rejected"]["count"],
        **truth["release"],
        "public_indexable_conteudos": truth["public_inventory"]["conteudos_indexable"],
        "hub_claimed_guides": truth["public_inventory"]["hub_claimed_guides"],
        "editorial_sitemap_locs": truth["sitemaps"]["editorial_locs"],
        "contradictions": truth["contradictions"],
        "will_not_impersonate_named_human": True,
        "why_not_complete": "A aprovação é individual, ligada ao material_hash, fontes exatas e deploy preview. commit_sha é apenas rastreabilidade.",
        "external_actions_doc": "docs/editorial/HUMAN-ACTION-NOW.md",
        "wave1_packet": "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json",
        "runtime_preview_packet": f"{REVIEW_PREVIEW_BASE_URL}/.well-known/editorial-review-packet.json",
        "inventory": "docs/editorial/EDITORIAL-INVENTORY.json",
        "ok": truth["ok"] and truth["terminal_status"] in TERMINAL_ALLOWED,
    }
    docs = ROOT / "docs" / "editorial"
    docs.mkdir(parents=True, exist_ok=True)
    path = docs / "TERMINAL-RESULT.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inventory = dict(truth)
    inventory["derived_at"] = out["derived_at"]
    inventory["terminal_status"] = out["terminal_status"]
    (docs / "EDITORIAL-INVENTORY.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    packet = review_packet(registry, truth, previous_hashes=prior)
    (docs / "WAVE1-HUMAN-REVIEW-PACKET.json").write_text(
        json.dumps(packet, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_human_action_now(packet)
    return path


def verify_packaged_matches_live(truth: dict[str, Any] | None = None) -> list[str]:
    truth = truth or derive_editorial_truth()
    failures: list[str] = []
    docs = ROOT / "docs" / "editorial"
    term_path = docs / "TERMINAL-RESULT.json"
    if not term_path.exists():
        return ["missing:docs/editorial/TERMINAL-RESULT.json"]
    term = json.loads(term_path.read_text(encoding="utf-8"))
    for field, expected in (
        ("terminal_status", truth["terminal_status"]),
        ("indexable_count", truth["first_cohort"]["indexable"]),
        ("human_approved_count", truth["first_cohort"]["human_approved"]),
        ("awaiting_human", truth["first_cohort"]["editorial_reviewed"]),
        ("editorial_backlog_awaiting_approval", truth["editorial_backlog"]["editorial_reviewed"]),
        ("approved_count", truth["release"]["approved_count"]),
        ("released_count", truth["release"]["released_count"]),
    ):
        if term.get(field) != expected:
            failures.append(f"terminal_{field}:{term.get(field)}!={expected}")
    if term.get("commit_sha_role") != "informational_only":
        failures.append("terminal_commit_sha_must_be_informational_only")
    inv_path = docs / "EDITORIAL-INVENTORY.json"
    if inv_path.exists():
        inventory = json.loads(inv_path.read_text(encoding="utf-8"))
        if inventory.get("terminal_status") != truth["terminal_status"]:
            failures.append("inventory_terminal_status_mismatch")
    packet_path = docs / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if not packet_path.exists():
        return failures + ["missing:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json"]
    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    if packet.get("commit_sha_role") != "informational_only":
        failures.append("packet_commit_sha_must_be_informational_only")
    target = packet.get("review_target") or {}
    if target.get("preview_base_url") != REVIEW_PREVIEW_BASE_URL:
        failures.append("packet_preview_base_url_mismatch")
    if target.get("production_urls_allowed") is not False:
        failures.append("packet_must_not_allow_production_review")
    rows = packet.get("pages") or []
    if [row.get("page_id") for row in rows] != list(FIRST_COHORT_IDS):
        failures.append("packet_first_cohort_ids_mismatch")
    manifest = load_manifest()
    page_by_id = {page.get("page_id"): page for page in load_registry().get("pages") or []}
    for row in rows:
        page = page_by_id.get(row.get("page_id"))
        if not page:
            failures.append(f"packet_unknown_page:{row.get('page_id')}")
            continue
        if row.get("material_hash") != material_hash(page, manifest):
            failures.append(f"packet_material_hash_mismatch:{row.get('page_id')}")
        if row.get("url") != page.get("url"):
            failures.append(f"packet_url_mismatch:{row.get('page_id')}")
        if row.get("registry_status") != page.get("status"):
            failures.append(f"packet_registry_status_mismatch:{row.get('page_id')}")
        if row.get("legal_sources") != list(page.get("sources") or []):
            failures.append(f"packet_sources_mismatch:{row.get('page_id')}")
    return failures


def assert_truth_consistent(truth: dict[str, Any] | None = None) -> list[str]:
    truth = truth or derive_editorial_truth()
    return list(truth.get("contradictions") or []) + verify_packaged_matches_live(truth)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Derive editorial truth from material identity")
    parser.add_argument("--write", action="store_true", help="Write terminal, inventory and review packet")
    parser.add_argument("--fail-on-contradiction", action="store_true")
    parser.add_argument("--require-packaged-live", action="store_true")
    args = parser.parse_args(argv)
    truth = derive_editorial_truth()
    if args.write:
        write_terminal_result(truth)
        truth = derive_editorial_truth()
    print(json.dumps(truth, ensure_ascii=False, indent=2))
    rc = 0 if truth["ok"] else 1
    if args.fail_on_contradiction and truth["contradictions"]:
        rc = max(rc, 2)
    if args.require_packaged_live:
        failures = verify_packaged_matches_live(truth)
        if failures:
            print({"packaged_material_failures": failures}, file=sys.stderr)
            rc = max(rc, 3)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
