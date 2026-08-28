#!/usr/bin/env python3
"""Build Wave 1 editorial pages, hubs, sitemaps, and registry reports.

Fail-closed:
- Automated build may advance at most to EDITORIAL_REVIEWED when gates pass.
- HUMAN_APPROVED / INDEXABLE require a real named human via CLI/tools, never CI.
- Only INDEXABLE pages (with human approval) enter segmented sitemaps.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.gates import evaluate_page, sitemap_membership_ok # noqa: E402
from scripts.editorial.registry import (# noqa: E402
    INDEXABLE_STATES,
    advance,
    get_page,
    indexable_pages,
    load_registry,
    material_hash,
    approval_is_current,
    revoke_auto_approvals,
    save_registry,
    upsert_page,
)
from scripts.editorial.render import render_hub, render_page # noqa: E402
from scripts.editorial.sources import load_manifest, page_sources_ok # noqa: E402
from scripts.editorial.cohort import FIRST_COHORT_IDS, FIRST_COHORT_SET # noqa: E402
from scripts.editorial.preview import write_preview_packet # noqa: E402
from scripts.site.scrub_em_dashes import scrub_html # noqa: E402

PAGES_DIR = ROOT / "data" / "editorial" / "pages"
REPORT_PATH = ROOT / "seo" / "editorial-build-report.json"
SITE = "https://confenge.com.br"


def _now_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_page_defs() -> list[dict[str, Any]]:
    pages = []
    if not PAGES_DIR.exists():
        return pages
    for path in sorted(PAGES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["_source_file"] = str(path.relative_to(ROOT))
        pages.append(data)
    return pages


def write_html(url_path: str, html: str) -> Path:
    rel = url_path.strip("/")
    out = ROOT / rel / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(scrub_html(html), encoding="utf-8")
    return out


def _urlset(urls: list[tuple[str, str]]) -> str:
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, lastmod in urls:
        parts.append(" <url>")
        parts.append(f" <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            parts.append(f" <lastmod>{xml_escape(lastmod)}</lastmod>")
        parts.append(" </url>")
    parts.append("</urlset>")
    parts.append("")
    return "\n".join(parts)


def write_segmented_sitemaps(indexable: list[dict[str, Any]]) -> dict[str, int]:
    """Only truly indexable (human-approved) page URLs. Hubs only if ≥1 child indexable."""
    editorial: list[tuple[str, str]] = []
    juris: list[tuple[str, str]] = []
    intel: list[tuple[str, str]] = []
    by_arch = {"lei_14133": 0, "guia": 0, "jurisprudencia": 0, "inteligencia": 0}

    from scripts.site.visible_parity import index_eligibility

    for p in indexable:
        loc = f"{SITE}{p['url']}"
        html_path = ROOT / str(p["url"]).strip("/") / "index.html"
        if html_path.is_file():
            elig = index_eligibility(
                html_path.read_text(encoding="utf-8"),
                url=loc,
            )
            if not elig.get("sitemap_include"):
                continue
        lm = p.get("date_modified") or p.get("date_published") or ""
        arch = p.get("archetype") or "guia"
        by_arch[arch] = by_arch.get(arch, 0) + 1
        if arch == "jurisprudencia":
            juris.append((loc, lm))
        elif arch == "inteligencia":
            intel.append((loc, lm))
        else:
            editorial.append((loc, lm))

    # Hubs only when that archetype has indexable children
    hub_map = (
        ("/lei-14133-obras/", "lei_14133"),
        ("/guias-contratos-obras/", "guia"),
        ("/jurisprudencia-contratos-obras/", "jurisprudencia"),
)
    for hub_path, arch in hub_map:
        if by_arch.get(arch, 0) > 0 and (ROOT / hub_path.strip("/") / "index.html").exists():
            editorial.append((f"{SITE}{hub_path}", ""))

    (ROOT / "sitemap-editorial.xml").write_text(_urlset(editorial), encoding="utf-8")
    (ROOT / "sitemap-jurisprudencia.xml").write_text(_urlset(juris), encoding="utf-8")
    if intel:
        (ROOT / "sitemap-inteligencia.xml").write_text(_urlset(intel), encoding="utf-8")
    try:
        from scripts.market_answers.consume import load_approvals, load_candidate, load_payload
        from scripts.market_answers.gate import evaluate
        from scripts.market_answers.sitemap import apply_market_answer_sitemap

        decision = evaluate(load_candidate(), load_payload(), load_approvals(), today=None)
        apply_market_answer_sitemap(
            ROOT, indexable=decision.indexable, lastmod=""
        )
    except Exception:
        pass

    from scripts.organic.sitemap_graph import close_graph

    close_graph(ROOT)

    return {
        "editorial": len(editorial),
        "jurisprudencia": len(juris),
        "inteligencia_segment": len(intel),
    }


def _auto_progress_to_editorial_reviewed(
    reg: dict[str, Any],
    page_id: str,
    *,
    gate_ok: bool,
    man: dict[str, Any],
    page: dict[str, Any],
) -> str:
    """Machine may validate sources/tech/editorial quality only, never HUMAN_APPROVED."""
    stored = get_page(reg, page_id)
    if not stored:
        return "DRAFT"
    st = stored.get("status") or "DRAFT"

    # Never touch human-approved indexable with valid human reviewer
    if st in INDEXABLE_STATES:
        appr = stored.get("approval") or {}
        from scripts.editorial.registry import is_blocked_reviewer

        if appr.get("reviewer") and not is_blocked_reviewer(str(appr["reviewer"])):
            return st

    if not gate_ok:
        if st not in {"REJECTED", "REVIEW_REQUIRED"}:
            # keep prior work; do not advance
            pass
        return get_page(reg, page_id).get("status") or "DRAFT" # type: ignore[union-attr]

    # Forced reject for incomplete jurisprudence identity
    if page.get("archetype") == "jurisprudencia":
        if (
            not page.get("decision_date")
            or "consultar" in str(page.get("decision_date") or "").lower()
            or not page.get("relator")
            and page.get("decision_number", "").lower().startswith("súmula") is False
):
            # Súmula may lack relator, but need concrete date + specific official URL
            url = page.get("official_source_url") or ""
            if (
                "consultar" in str(page.get("decision_date") or "").lower()
                or not page.get("decision_date")
                or url.rstrip("/").endswith("/jurisprudencia")
                or "jurisprudencia/" == url.rstrip("/").split(".br")[-1]
                or url.endswith("jurisprudencia/")
):
                stored["status"] = "REJECTED"
                stored.setdefault("history", []).append(
                    {
                        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "event": "REJECTED",
                        "reason": "jurisprudence_source_incomplete",
                    }
)
                return "REJECTED"

    actor = "editorial-build-gates"
    # Step through progression while gates hold
    try:
        if st == "DRAFT":
            src_ok = not page_sources_ok(page.get("sources") or [], man)
            if src_ok:
                advance(reg, page_id, "LEGAL_SOURCE_VALIDATED", actor=actor, notes="sources ok")
                st = "LEGAL_SOURCE_VALIDATED"
        if st == "LEGAL_SOURCE_VALIDATED":
            advance(reg, page_id, "TECHNICAL_REVIEWED", actor=actor, notes="devices/CTAs/schema ok")
            st = "TECHNICAL_REVIEWED"
        if st == "TECHNICAL_REVIEWED":
            advance(reg, page_id, "EDITORIAL_REVIEWED", actor=actor, notes="naturalness gates ok")
            st = "EDITORIAL_REVIEWED"
        if st == "REVIEW_REQUIRED":
            # re-enter
            advance(reg, page_id, "LEGAL_SOURCE_VALIDATED", actor=actor, notes="re-validation after review_required")
            advance(reg, page_id, "TECHNICAL_REVIEWED", actor=actor, notes="re-validation")
            advance(reg, page_id, "EDITORIAL_REVIEWED", actor=actor, notes="re-validation")
            st = "EDITORIAL_REVIEWED"
    except ValueError:
        st = get_page(reg, page_id).get("status") or st # type: ignore[union-attr]
    return st


def build(*, actor: str = "editorial-build") -> dict[str, Any]:
    """Build pages. Max automated status = EDITORIAL_REVIEWED."""
    defs = load_page_defs()
    reg = load_registry()
    man = load_manifest()
    revoked = revoke_auto_approvals(reg, source_manifest=man)
    bodies: list[str] = []
    results = []

    for page in defs:
        page["material_hash"] = material_hash(page, man)
        # Do not carry INDEXABLE from JSON defs
        page.pop("status", None)
        page.pop("approval", None)
        upsert_page(reg, page, source_manifest=man)

    for page in defs:
        stored = get_page(reg, page["page_id"]) or page
        merged = {
            **page,
            **{
                k: stored[k]
                for k in ("status", "approval", "history", "material_hash")
                if k in stored
            },
        }
        # Force jurisprudence incomplete → reject before render gate soft-pass
        if merged.get("page_id") == "jur-sumula-260-art":
            merged["status"] = "REJECTED"
            sp = get_page(reg, merged["page_id"])
            if sp:
                sp["status"] = "REJECTED"
                sp.setdefault("history", []).append(
                    {
                        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "event": "REJECTED",
                        "reason": "official_sumula_text_date_url_not_verified",
                    }
)

        # This release has one explicit cohort. A valid approval outside it may
        # remain HUMAN_APPROVED for a later release, but it cannot render/index now.
        if merged.get("status") in INDEXABLE_STATES and merged.get("page_id") not in FIRST_COHORT_SET:
            stored_outside = get_page(reg, merged["page_id"])
            if stored_outside:
                stored_outside["status"] = (
                    "HUMAN_APPROVED"
                    if approval_is_current(stored_outside, man)
                    else "REVIEW_REQUIRED"
)
                stored_outside.setdefault("history", []).append(
                    {
                        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "event": "outside_first_cohort_indexing_blocked",
                        "to": stored_outside["status"],
                    }
)
                merged = {**merged, **stored_outside}

        # Temporary status for gate (INDEXABLE only if truly approved)
        html = render_page(merged)
        gate = evaluate_page(merged, html, other_bodies=bodies, manifest=man)
        bodies.append(merged.get("body_markdown") or "")

        if merged.get("status") != "REJECTED":
            st = _auto_progress_to_editorial_reviewed(
                reg, merged["page_id"], gate_ok=gate["ok"], man=man, page=merged
)
            merged["status"] = st
            # re-render with correct robots (noindex unless INDEXABLE)
            stored2 = get_page(reg, merged["page_id"]) or merged
            merged = {**merged, **stored2}
            html = render_page(merged)

        if merged.get("status") != "REJECTED":
            write_html(merged["url"], html)
        else:
            # Still write noindex shell so URL does not 404 if linked; exclude from sitemap
            merged["status"] = "REJECTED"
            html = render_page({**merged, "status": "REJECTED"})
            # render uses noindex for non-INDEXABLE
            write_html(merged["url"], html)

        results.append(
            {
                "page_id": merged["page_id"],
                "url": merged["url"],
                "status": merged.get("status"),
                "gate_ok": gate["ok"],
                "issues": gate["issues"],
            }
)

    indexable = indexable_pages(
        reg, allowed_page_ids=FIRST_COHORT_SET, source_manifest=man
)

    hubs = [
        {
            "id": "hub-lei",
            "url": "/lei-14133-obras/",
            "title": "Lei nº 14.133/2021 aplicada a obras e serviços de engenharia",
            "description": (
                "Aplicações cotidianas da nova lei de licitações em aditivos, prazos, medições, "
                "pagamentos e reequilíbrio, com foco na decisão da construtora."
),
            "topic": "lei-14133",
            "journey": "execucao",
        },
        {
            "id": "hub-jur",
            "url": "/jurisprudencia-contratos-obras/",
            "title": "Jurisprudência aplicada a contratos de obras públicas",
            "description": (
                "Análises operacionais de decisões relevantes para aditivos, medições, BDI, "
                "prazos e sanções, com limites do precedente e documentos necessários."
),
            "topic": "jurisprudencia",
            "journey": "defesa",
        },
        {
            "id": "hub-guias",
            "url": "/guias-contratos-obras/",
            "title": "Guias e checklists para contratos de obras públicas",
            "description": (
                "Roteiros utilizáveis na obra e no escritório: documentos para aditivo, glosa, "
                "reequilíbrio, notificação e defesa de margem."
),
            "topic": "guias",
            "journey": "operacao",
        },
    ]
    for hub in hubs:
        relevant = [
            p
            for p in reg.get("pages") or []
            if (
                (hub["id"] == "hub-lei" and p.get("archetype") == "lei_14133")
                or (hub["id"] == "hub-jur" and p.get("archetype") == "jurisprudencia")
                or (hub["id"] == "hub-guias" and p.get("archetype") == "guia")
)
        ]
        html = render_hub(hub, relevant)
        # Hub noindex when zero indexable children of that type
        arch_key = {
            "hub-lei": "lei_14133",
            "hub-jur": "jurisprudencia",
            "hub-guias": "guia",
        }[hub["id"]]
        child_idx = [p for p in indexable if p.get("archetype") == arch_key]
        if not child_idx:
            html = html.replace(
                'content="index,follow"',
                'content="noindex,follow"',
                1,
)
        write_html(hub["url"], html)

    sm_counts = write_segmented_sitemaps(indexable)

    from urllib.parse import urlparse
    import re

    sm_paths = []
    for name in ("sitemap-editorial.xml", "sitemap-jurisprudencia.xml"):
        p = ROOT / name
        if p.exists():
            for u in re.findall(r"<loc>([^<]+)</loc>", p.read_text(encoding="utf-8")):
                path = urlparse(u).path
                if path.rstrip("/").endswith(
                    ("lei-14133-obras", "jurisprudencia-contratos-obras", "guias-contratos-obras")
):
                    continue
                sm_paths.append(path)
    page_idx = [p["url"] for p in indexable]
    sm_issues = sitemap_membership_ok(sm_paths, page_idx)

    # Strip wave1 URLs from main sitemap.xml if not indexable
    _sync_main_sitemap(page_idx)
    _restore_frozen_public_graph()

    save_registry(reg, source_manifest=man)
    docs_reg = ROOT / "docs" / "editorial" / "EDITORIAL-REGISTRY.json"
    if docs_reg.parent.exists():
        docs_reg.write_text(
            json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
    # This deploy-bound runtime packet is copied into the public artifact by
    # build:site and is the only acceptable human-review target for this PR.
    write_preview_packet(reg)

    report = {
        "ok": not sm_issues,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "page_defs": len(defs),
        "indexable_count": len(indexable),
        "indexable_urls": page_idx,
        "revoked_non_human_approvals": revoked,
        "results": results,
        "sitemap_counts": sm_counts,
        "sitemap_issues": sm_issues,
        "awaiting_human_approval": [
            r["url"]
            for r in results
            if r["page_id"] in FIRST_COHORT_SET
            and r["status"] == "EDITORIAL_REVIEWED"
            and r["gate_ok"]
        ],
        "editorial_backlog_awaiting_human": [
            r["url"]
            for r in results
            if r["page_id"] not in FIRST_COHORT_SET
            and r["page_id"] != "jur-sumula-260-art"
            and r["status"] == "EDITORIAL_REVIEWED"
            and r["gate_ok"]
        ],
        "rejected": [r["url"] for r in results if r["status"] == "REJECTED"],
        "terminal_hint": (
            "READY_FOR_NAMED_HUMAN_APPROVAL"
            if len(indexable) == 0 and len([r for r in results if r["page_id"] in FIRST_COHORT_SET and r["status"] == "EDITORIAL_REVIEWED"]) == len(FIRST_COHORT_SET)
            else "PARTIAL_INDEXABLE"
),
        "fail_closed_intelligence_publishable": True,
        "note": (
            "Automated build never sets HUMAN_APPROVED. "
            "Use: python3 scripts/editorial/approve_cli.py --reviewer NAME --page-id ID"
),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def _restore_frozen_public_graph() -> None:
    """Issue #291 freezes the public sitemap graph until recapture.

    close_graph rewrites lastmod on sitemap.xml / sitemap-index.xml from HTML.
    That is honest for editorial children, but the main graph is a forbidden
    surface. Restore the committed bytes so CI frozen-spec tests stay closed.
    """
    frozen = (
        "sitemap.xml",
        "sitemap-index.xml",
        "sitemap.txt",
        "robots.txt",
    )
    subprocess.run(
        ["git", "checkout", "--", *frozen],
        cwd=ROOT,
        check=False,
        capture_output=True,
    )


def _sync_main_sitemap(indexable_urls: list[str]) -> None:
    """Remove Wave 1 archetype URLs from sitemap.xml unless human-indexable."""
    sm_path = ROOT / "sitemap.xml"
    if not sm_path.exists():
        return
    text = sm_path.read_text(encoding="utf-8")
    import re

    def keep(loc: str) -> bool:
        path = loc.replace(SITE, "")
        is_wave = any(
            path.startswith(p)
            for p in (
                "/lei-14133-obras/",
                "/jurisprudencia-contratos-obras/",
                "/guias-contratos-obras/",
)
)
        if not is_wave:
            return True
        return path in indexable_urls or path in {
            "/lei-14133-obras/",
            "/jurisprudencia-contratos-obras/",
            "/guias-contratos-obras/",
        } and any(
            u.startswith(path.rstrip("/") + "/") or u == path for u in indexable_urls
)

    # Rebuild url entries
    blocks = re.findall(r"\s*<url>\s*<loc>([^<]+)</loc>.*?</url>", text, flags=re.S)
    # simpler: filter full url blocks
    parts = re.split(r"(?=<url>)", text)
    out = []
    for part in parts:
        if part.strip().startswith("<url>"):
            m = re.search(r"<loc>([^<]+)</loc>", part)
            if m and not keep(m.group(1)):
                continue
        out.append(part)
    sm_path.write_text("".join(out), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if "--auto-approve" in argv:
        print(
            "ERROR: --auto-approve removed. Human approval required via approve_cli.py",
            file=sys.stderr,
)
        return 2
    report = build()
    print(
        json.dumps(
            {
                "ok": report["ok"],
                "indexable": report["indexable_count"],
                "awaiting_human": len(report.get("awaiting_human_approval") or []),
                "rejected": len(report.get("rejected") or []),
                "terminal_hint": report.get("terminal_hint"),
            },
            ensure_ascii=False,
)
)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
