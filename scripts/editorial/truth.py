#!/usr/bin/env python3
"""Derive editorial truth from page material and valid human approvals.

Editorial reports may carry commit_sha for traceability, but commit identity is
never an approval gate. The approval identity is (schema_version, page_id,
material_hash, state, reviewer, timestamp).
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SITE = "https://confenge.com.br"

# The rest of the editorial queue remains noindex until a later, explicit cohort.
FIRST_COHORT_IDS = (
    "lei-limite-25-50",
    "guia-checklist-aditivo",
    "lei-item-novo-desconto",
)
FIRST_COHORT_SET = frozenset(FIRST_COHORT_IDS)
WAVE1_IDS = frozenset(
    {
        "guia-checklist-aditivo",
        "guia-docs-reequilibrio",
        "guia-glosa",
        "guia-notificacao-atraso",
        "lei-art124-alteracao-obra",
        "lei-atraso-administracao",
        "lei-item-novo-desconto",
        "lei-limite-25-50",
        "lei-parcela-incontroversa",
        "lei-reequilibrio-reajuste",
        "lei-servico-sem-aditivo",
    }
)
REJECTED_IDS = frozenset({"jur-sumula-260-art"})
TERMINAL_ALLOWED = frozenset(
    {
        "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE",
        "BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS",
        "READY_FOR_NAMED_HUMAN_APPROVAL",
        "READY_FOR_RELEASE",
    }
)

FIRST_COHORT_CONTEXT: dict[str, dict[str, str]] = {
    "lei-limite-25-50": {
        "search_intent": "Limite de 25% e 50% no art. 125 em aditivo de obra",
        "demand_evidence": "Peer /conteudos/limite-aditivo-25-50-obra-publica/ teve 24 impressões, 0 cliques e posição 17 no export GSC de 2026-07-30; a query relacionada 'aditivos obra pública' teve 5 impressões.",
        "objective": "Explicar o teto do art. 125 sem tratá-lo como crédito automático e levar a uma validação do saldo contratual.",
        "internal_competitor": "/conteudos/limite-aditivo-25-50-obra-publica/",
        "cannibalization_risk": "alto: definir uma única canônica antes de indexar; 301 ou noindex do peer somente após decisão humana.",
    },
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
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _git_sha() -> str:
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:  # noqa: BLE001
        return "unknown"


def robots_of(html: str) -> str:
    match = re.search(
        r'name=["\']robots["\']\s+content=["\']([^"\']+)', html, re.I
    ) or re.search(
        r'content=["\']([^"\']+)["\']\s+name=["\']robots["\']', html, re.I
    )
    return (match.group(1) if match else "index,follow").lower()


def is_noindex(robots: str) -> bool:
    return "noindex" in robots.lower()


def load_registry(path: Path | None = None) -> dict[str, Any]:
    path = path or (ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json")
    if not path.exists():
        return {"schema_version": "unknown", "pages": [], "counts": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def sitemap_locs(path: Path) -> list[str]:
    if not path.exists():
        return []
    return re.findall(r"<loc>([^<]+)</loc>", path.read_text(encoding="utf-8", errors="replace"))


def count_indexable_conteudos() -> int:
    count = 0
    for path in (ROOT / "conteudos").glob("*/index.html"):
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


def _cohort_summary(pages: list[dict[str, Any]], valid_indexable_ids: set[str]) -> dict[str, Any]:
    from scripts.editorial.registry import approval_is_current

    return {
        "total": len(pages),
        "editorial_reviewed": sum(1 for p in pages if p.get("status") == "EDITORIAL_REVIEWED"),
        "human_approved": sum(
            1
            for p in pages
            if p.get("status") in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"}
            and approval_is_current(p)
        ),
        "indexable": sum(1 for p in pages if p.get("page_id") in valid_indexable_ids),
        "page_ids": [p.get("page_id") for p in pages],
    }


def compute_terminal_status(
    *,
    contradictions: list[str],
    cohort_editorial_reviewed: int,
    cohort_indexable: int,
    rejected_count: int,
) -> str:
    if contradictions:
        return "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
    if (
        cohort_indexable == 0
        and cohort_editorial_reviewed == len(FIRST_COHORT_IDS)
        and rejected_count >= 1
    ):
        return "READY_FOR_NAMED_HUMAN_APPROVAL"
    if 0 < cohort_indexable <= len(FIRST_COHORT_IDS):
        return "READY_FOR_RELEASE"
    return "BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS"


def derive_editorial_truth(reg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Derive truth from the registry and generated public surfaces."""
    from scripts.editorial.registry import approval_is_current, indexable_pages

    reg = reg if reg is not None else load_registry()
    pages = list(reg.get("pages") or [])
    page_by_id = {p.get("page_id"): p for p in pages if p.get("page_id")}
    cohort = [page_by_id[page_id] for page_id in FIRST_COHORT_IDS if page_id in page_by_id]
    queue = [
        p
        for p in pages
        if p.get("page_id") in WAVE1_IDS
        and p.get("page_id") not in FIRST_COHORT_SET
    ]
    rejected = [p for p in pages if p.get("page_id") in REJECTED_IDS or p.get("status") == "REJECTED"]
    valid_indexable = indexable_pages(reg)
    valid_indexable_ids = {p.get("page_id") for p in valid_indexable}
    valid_indexable_urls = {p.get("url") for p in valid_indexable}

    contradictions: list[str] = []
    if set(p.get("page_id") for p in cohort) != FIRST_COHORT_SET:
        contradictions.append("first_cohort_registry_missing_page")
    for p in pages:
        status = p.get("status")
        if status in {"HUMAN_APPROVED", "INDEXABLE", "PUBLISHED"} and not approval_is_current(p):
            contradictions.append(f"invalid_approval_identity:{p.get('page_id')}")
        if p.get("page_id") not in FIRST_COHORT_SET and p.get("page_id") in valid_indexable_ids:
            contradictions.append(f"outside_first_cohort_indexable:{p.get('page_id')}")

    wave_html: list[dict[str, Any]] = []
    for p in queue:
        url = (p.get("url") or "").strip("/")
        page_path = ROOT / url / "index.html" if url else None
        robots = "missing"
        if page_path and page_path.exists():
            robots = robots_of(page_path.read_text(encoding="utf-8", errors="replace"))
        valid = p.get("page_id") in valid_indexable_ids
        if valid and robots != "missing" and is_noindex(robots):
            contradictions.append(f"indexable_but_noindex_html:{p.get('page_id')}")
        if not valid and robots != "missing" and not is_noindex(robots):
            contradictions.append(f"unapproved_but_index_html:{p.get('page_id')}")
        wave_html.append(
            {
                "page_id": p.get("page_id"),
                "url": p.get("url"),
                "registry_status": p.get("status"),
                "robots": robots,
                "noindex": is_noindex(robots) if robots != "missing" else True,
            }
        )

    editorial_sitemap = sitemap_locs(ROOT / "sitemap-editorial.xml")
    editorial_paths = [re.sub(r"^https?://[^/]+", "", loc) for loc in editorial_sitemap]
    for path in editorial_paths:
        if path not in valid_indexable_urls and path.rstrip("/") not in {
            "/lei-14133-obras",
            "/guias-contratos-obras",
            "/jurisprudencia-contratos-obras",
        }:
            contradictions.append(f"sitemap_without_valid_approval:{path}")

    for p in queue:
        if p.get("page_id") not in valid_indexable_ids and p.get("url") in editorial_paths:
            contradictions.append(f"unapproved_in_editorial_sitemap:{p.get('page_id')}")

    conteudos_indexable = count_indexable_conteudos()
    hub_count = hub_claimed_guide_count()
    if hub_count is not None and hub_count != conteudos_indexable:
        contradictions.append(f"hub_count_mismatch:hub={hub_count},indexable_conteudos={conteudos_indexable}")
    if hub_count == 120:
        contradictions.append("hub_claims_false_120_guides")

    first = _cohort_summary(cohort, valid_indexable_ids)
    backlog = _cohort_summary(queue, valid_indexable_ids)
    terminal = compute_terminal_status(
        contradictions=contradictions,
        cohort_editorial_reviewed=first["editorial_reviewed"],
        cohort_indexable=first["indexable"],
        rejected_count=len(rejected),
    )
    return {
        "schema_version": "2.0.0",
        "derived_at": _now(),
        "commit_sha": _git_sha(),
        "commit_sha_role": "informational_only",
        "terminal_status": terminal,
        "registry_counts": dict(Counter((p.get("status") or "DRAFT") for p in pages)),
        "first_cohort": first,
        # Compatibility alias: no caller may interpret Wave 1 as a multi-page release.
        "wave1": first,
        "editorial_backlog": backlog,
        "rejected": {"count": len(rejected), "page_ids": [p.get("page_id") for p in rejected]},
        "public_inventory": {
            "conteudos_indexable": conteudos_indexable,
            "hub_claimed_guides": hub_count,
            "legacy_indexable_public_surface": conteudos_indexable,
            "first_cohort_awaiting_approval": first["editorial_reviewed"],
            "first_cohort_published": first["indexable"],
            "editorial_backlog_awaiting_approval": backlog["editorial_reviewed"],
            "note": "Only FIRST_COHORT_IDS may become indexable in this release.",
        },
        "sitemaps": {
            "editorial_locs": len(editorial_sitemap),
            "jurisprudencia_locs": len(sitemap_locs(ROOT / "sitemap-jurisprudencia.xml")),
            "editorial_urls": editorial_paths,
        },
        "wave1_pages": wave_html,
        "contradictions": contradictions,
        "ok": not contradictions,
        "will_not_impersonate_named_human": True,
        "max_terminal_without_external_human": "READY_FOR_NAMED_HUMAN_APPROVAL",
    }


def _packet_page(page: dict[str, Any]) -> dict[str, Any]:
    context = FIRST_COHORT_CONTEXT[page["page_id"]]
    approval = page.get("approval") or {}
    return {
        "page_id": page["page_id"],
        "url": page["url"],
        "preview": f"{SITE}{page['url']}",
        "title": page.get("title"),
        "search_intent": context["search_intent"],
        "demand_evidence": context["demand_evidence"],
        "objective": context["objective"],
        "conclusion_summary": page.get("direct_answer"),
        "legal_sources": list(page.get("sources") or []),
        "legal_risk": (
            "Dispositivos: "
            + ", ".join(page.get("legal_devices") or [])
            + ". Conteúdo técnico-informativo; não substitui assessoria jurídica no caso concreto."
        ),
        "cannibalization": {
            "internal_competitor": context["internal_competitor"],
            "risk": context["cannibalization_risk"],
        },
        "cta": {
            "offer": page.get("cta_offer"),
            "whatsapp": page.get("cta_whatsapp"),
            "email_subject": page.get("cta_email_subject"),
        },
        "material_hash": page.get("material_hash"),
        "registry_status": page.get("status"),
        "approval_identity": (
            {
                "schema_version": approval.get("schema_version"),
                "page_id": approval.get("page_id"),
                "material_hash": approval.get("material_hash"),
                "state": approval.get("state"),
                "reviewer": approval.get("reviewer"),
                "reviewed_at": approval.get("at"),
            }
            if approval
            else None
        ),
        "decision_reason": (
            "Aprovar somente se as fontes, o conteúdo material e a decisão de canibalização "
            "forem conferidos por humano nomeado; o hash deve coincidir com o registro."
        ),
    }


def review_packet(reg: dict[str, Any], truth: dict[str, Any]) -> dict[str, Any]:
    page_by_id = {p.get("page_id"): p for p in reg.get("pages") or []}
    missing = [page_id for page_id in FIRST_COHORT_IDS if page_id not in page_by_id]
    pages = [_packet_page(page_by_id[page_id]) for page_id in FIRST_COHORT_IDS if page_id in page_by_id]
    return {
        "schema_version": "2.0.0",
        "decision_schema_version": "2.0.0",
        "title": "Primeira coorte editorial: revisão humana individual",
        "commit_sha": truth.get("commit_sha"),
        "commit_sha_role": "informational_only",
        "derived_at": truth.get("derived_at"),
        "terminal_status": truth.get("terminal_status"),
        "summary": {
            "first_cohort_total": len(FIRST_COHORT_IDS),
            "awaiting_human": truth["first_cohort"]["editorial_reviewed"],
            "human_approved": truth["first_cohort"]["human_approved"],
            "indexable": truth["first_cohort"]["indexable"],
            "editorial_backlog_awaiting_approval": truth["editorial_backlog"]["editorial_reviewed"],
            "rejected": truth["rejected"]["count"],
        },
        "rules": [
            "Uma página por aprovação; nunca lote.",
            "Somente humano nomeado fora de CI/automação.",
            "material_hash deve coincidir com o registro atual.",
            "Apenas as três páginas desta primeira coorte podem receber --indexable.",
            "Páginas fora da coorte e jur-sumula-260-art permanecem noindex.",
        ],
        "missing_page_ids": missing,
        "pages": pages,
    }


def write_terminal_result(truth: dict[str, Any] | None = None) -> Path:
    reg = load_registry()
    truth = truth or derive_editorial_truth(reg)
    first = truth["first_cohort"]
    out = {
        "schema_version": "2.0.0",
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
        "public_indexable_conteudos": truth["public_inventory"]["conteudos_indexable"],
        "hub_claimed_guides": truth["public_inventory"]["hub_claimed_guides"],
        "editorial_sitemap_locs": truth["sitemaps"]["editorial_locs"],
        "contradictions": truth["contradictions"],
        "will_not_impersonate_named_human": True,
        "why_not_complete": (
            "A aprovação continua sendo ato humano individual ligado ao material_hash; "
            "commit_sha é somente rastreabilidade e não exige repin."
        ),
        "external_actions_doc": "docs/editorial/HUMAN-ACTION-NOW.md",
        "wave1_packet": "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json",
        "inventory": "docs/editorial/EDITORIAL-INVENTORY.json",
        "ok": truth["ok"] and truth["terminal_status"] in TERMINAL_ALLOWED,
    }
    docs_dir = ROOT / "docs" / "editorial"
    docs_dir.mkdir(parents=True, exist_ok=True)
    path = docs_dir / "TERMINAL-RESULT.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    inventory = dict(truth)
    inventory["derived_at"] = out["derived_at"]
    inventory["terminal_status"] = out["terminal_status"]
    (docs_dir / "EDITORIAL-INVENTORY.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (docs_dir / "WAVE1-HUMAN-REVIEW-PACKET.json").write_text(
        json.dumps(review_packet(reg, truth), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def verify_packaged_matches_live(truth: dict[str, Any] | None = None) -> list[str]:
    """Verify material fields, not arbitrary repository HEAD identity."""
    truth = truth or derive_editorial_truth()
    failures: list[str] = []
    docs_dir = ROOT / "docs" / "editorial"
    term_path = docs_dir / "TERMINAL-RESULT.json"
    if not term_path.exists():
        return ["missing:docs/editorial/TERMINAL-RESULT.json"]
    term = json.loads(term_path.read_text(encoding="utf-8"))
    for field, expected in (
        ("terminal_status", truth["terminal_status"]),
        ("indexable_count", truth["first_cohort"]["indexable"]),
        ("human_approved_count", truth["first_cohort"]["human_approved"]),
        ("awaiting_human", truth["first_cohort"]["editorial_reviewed"]),
        ("editorial_backlog_awaiting_approval", truth["editorial_backlog"]["editorial_reviewed"]),
    ):
        if term.get(field) != expected:
            failures.append(f"terminal_{field}:{term.get(field)}!={expected}")
    if term.get("commit_sha_role") != "informational_only":
        failures.append("terminal_commit_sha_must_be_informational_only")

    inv_path = docs_dir / "EDITORIAL-INVENTORY.json"
    if inv_path.exists():
        inventory = json.loads(inv_path.read_text(encoding="utf-8"))
        if inventory.get("terminal_status") != truth["terminal_status"]:
            failures.append("inventory_terminal_status_mismatch")

    packet_path = docs_dir / "WAVE1-HUMAN-REVIEW-PACKET.json"
    if not packet_path.exists():
        return failures + ["missing:docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json"]
    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    if packet.get("commit_sha_role") != "informational_only":
        failures.append("packet_commit_sha_must_be_informational_only")
    rows = packet.get("pages") or []
    if [row.get("page_id") for row in rows] != list(FIRST_COHORT_IDS):
        failures.append("packet_first_cohort_ids_mismatch")
    page_by_id = {p.get("page_id"): p for p in load_registry().get("pages") or []}
    for row in rows:
        page = page_by_id.get(row.get("page_id"))
        if not page:
            failures.append(f"packet_unknown_page:{row.get('page_id')}")
            continue
        for field in ("material_hash", "url"):
            if row.get(field) != page.get(field):
                failures.append(f"packet_{field}_mismatch:{row.get('page_id')}")
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
    parser.add_argument(
        "--require-packaged-live",
        action="store_true",
        help="Fail if the committed packet no longer matches current page material",
    )
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
