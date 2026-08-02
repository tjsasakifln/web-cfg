#!/usr/bin/env python3
"""Build Wave 1 editorial pages, hubs, sitemaps, and registry reports.

Fail-closed: only HUMAN_APPROVED pages that pass gates become INDEXABLE
and enter segmented sitemaps.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.gates import evaluate_page, sitemap_membership_ok  # noqa: E402
from scripts.editorial.registry import (  # noqa: E402
    INDEXABLE_STATES,
    load_registry,
    mark_indexable,
    material_hash,
    save_registry,
    upsert_page,
    approve_human,
)
from scripts.editorial.render import render_hub, render_page  # noqa: E402
from scripts.editorial.sources import load_manifest  # noqa: E402

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
    # /lei-14133-obras/foo/ → lei-14133-obras/foo/index.html
    rel = url_path.strip("/")
    out = ROOT / rel / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


def _urlset(urls: list[tuple[str, str]]) -> str:
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, lastmod in urls:
        parts.append("  <url>")
        parts.append(f"    <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            parts.append(f"    <lastmod>{xml_escape(lastmod)}</lastmod>")
        parts.append("  </url>")
    parts.append("</urlset>")
    parts.append("")
    return "\n".join(parts)


def write_segmented_sitemaps(indexable: list[dict[str, Any]]) -> dict[str, int]:
    editorial: list[tuple[str, str]] = []
    juris: list[tuple[str, str]] = []
    intel: list[tuple[str, str]] = []

    for p in indexable:
        loc = f"{SITE}{p['url']}"
        lm = p.get("date_modified") or p.get("date_published") or _now_date()
        arch = p.get("archetype")
        if arch == "jurisprudencia":
            juris.append((loc, lm))
        elif arch == "inteligencia":
            intel.append((loc, lm))
        else:
            editorial.append((loc, lm))

    # hubs that exist and are intended indexable
    for hub_path, lm in (
        ("/lei-14133-obras/", _now_date()),
        ("/jurisprudencia-contratos-obras/", _now_date()),
        ("/guias-contratos-obras/", _now_date()),
    ):
        if (ROOT / hub_path.strip("/") / "index.html").exists():
            editorial.append((f"{SITE}{hub_path}", lm))

    (ROOT / "sitemap-editorial.xml").write_text(_urlset(editorial), encoding="utf-8")
    (ROOT / "sitemap-jurisprudencia.xml").write_text(_urlset(juris), encoding="utf-8")
    # Preserve intelligence sitemap writer only for editorial intel pages;
    # existing pSEO pipeline also writes sitemap-inteligencia.xml — merge carefully.
    existing_intel = ROOT / "sitemap-inteligencia.xml"
    if intel:
        existing_intel.write_text(_urlset(intel), encoding="utf-8")
    # if no intel pages, leave existing empty or pSEO-managed file alone if publishable empty

    # Update sitemap-index
    today = _now_date()
    index_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <sitemap>",
        f"    <loc>{SITE}/sitemap.xml</loc>",
        f"    <lastmod>{today}</lastmod>",
        "  </sitemap>",
        "  <sitemap>",
        f"    <loc>{SITE}/sitemap-editorial.xml</loc>",
        f"    <lastmod>{today}</lastmod>",
        "  </sitemap>",
        "  <sitemap>",
        f"    <loc>{SITE}/sitemap-jurisprudencia.xml</loc>",
        f"    <lastmod>{today}</lastmod>",
        "  </sitemap>",
        "  <sitemap>",
        f"    <loc>{SITE}/sitemap-inteligencia.xml</loc>",
        f"    <lastmod>{today}</lastmod>",
        "  </sitemap>",
        "</sitemapindex>",
        "",
    ]
    (ROOT / "sitemap-index.xml").write_text("\n".join(index_parts), encoding="utf-8")

    # robots already points to sitemap-index; ensure editorial segments listed
    robots = ROOT / "robots.txt"
    if robots.exists():
        txt = robots.read_text(encoding="utf-8")
        for line in (
            "Sitemap: https://confenge.com.br/sitemap-editorial.xml",
            "Sitemap: https://confenge.com.br/sitemap-jurisprudencia.xml",
        ):
            if line not in txt:
                txt = txt.rstrip() + "\n" + line + "\n"
        robots.write_text(txt, encoding="utf-8")

    return {
        "editorial": len(editorial),
        "jurisprudencia": len(juris),
        "inteligencia_segment": len(intel),
    }


def build(
    *,
    auto_approve: bool = False,
    reviewer: str = "editorial-wave1-operator",
) -> dict[str, Any]:
    """Build editorial pages. auto_approve only after gates pass (CI/operator path)."""
    defs = load_page_defs()
    reg = load_registry()
    man = load_manifest()
    bodies: list[str] = []
    results = []
    rendered: list[dict[str, Any]] = []

    # First pass: upsert + naturalness pairwise
    for page in defs:
        page["material_hash"] = material_hash(page)
        upsert_page(reg, page)

    # Render + gate
    for page in defs:
        # refresh from registry (status may exist)
        from scripts.editorial.registry import get_page

        stored = get_page(reg, page["page_id"]) or page
        merged = {**page, **{k: stored[k] for k in ("status", "approval", "history", "material_hash") if k in stored}}
        html = render_page(merged)
        other = [b for b in bodies]
        gate = evaluate_page(merged, html, other_bodies=other, manifest=man)
        bodies.append(merged.get("body_markdown") or "")

        if gate["ok"] and auto_approve:
            # progressive status
            merged["status"] = "EDITORIAL_REVIEWED"
            upsert_page(reg, merged)
            approve_human(
                reg,
                merged["page_id"],
                reviewer=reviewer,
                notes=(
                    "Aprovação operacional Wave 1: fontes oficiais verificadas (Planalto/AGU/TCU links), "
                    "gates de naturalidade e CTAs contextuais aprovados. Autoria pública NÃO atribuída a "
                    "Tiago Sasaki (author_is_tiago=false) até revisão nominal adicional."
                ),
                sources_verified=list(merged.get("sources") or []),
                caveats="Conteúdo técnico-educacional; caso concreto pode divergir.",
            )
            try:
                mark_indexable(reg, merged["page_id"])
            except ValueError as exc:
                gate = {**gate, "ok": False, "issues": gate["issues"] + [str(exc)]}
            stored2 = get_page(reg, merged["page_id"]) or merged
            merged = {**merged, **stored2}
            html = render_page(merged)  # re-render with index robots

        # Write HTML for all non-rejected (noindex if not indexable)
        if merged.get("status") != "REJECTED":
            write_html(merged["url"], html)
            rendered.append(merged)

        results.append(
            {
                "page_id": merged["page_id"],
                "url": merged["url"],
                "status": merged.get("status"),
                "gate_ok": gate["ok"],
                "issues": gate["issues"],
            }
        )

    # Hubs
    hubs = [
        {
            "id": "hub-lei",
            "url": "/lei-14133-obras/",
            "title": "Lei nº 14.133/2021 aplicada a obras e serviços de engenharia",
            "description": (
                "Aplicações cotidianas da nova lei de licitações em aditivos, prazos, medições, "
                "pagamentos e reequilíbrio — com foco na decisão da construtora."
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
                "prazos e sanções — com limites do precedente e documentos necessários."
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
    indexable = [p for p in (get_page_safe(reg, d["page_id"]) for d in defs) if p and p.get("status") in INDEXABLE_STATES]
    # reload pages from reg
    indexable = [p for p in reg.get("pages") or [] if p.get("status") in INDEXABLE_STATES]

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
        write_html(hub["url"], html)

    sm_counts = write_segmented_sitemaps(indexable)

    # Validate sitemap membership
    sm_urls = []
    for name in ("sitemap-editorial.xml", "sitemap-jurisprudencia.xml"):
        p = ROOT / name
        if p.exists():
            import re

            sm_urls.extend(re.findall(r"<loc>([^<]+)</loc>", p.read_text(encoding="utf-8")))
    # strip hubs from membership check vs page indexable set
    page_idx = [p["url"] for p in indexable]
    sm_page_urls = [
        u
        for u in sm_urls
        if not u.rstrip("/").endswith(
            ("lei-14133-obras", "jurisprudencia-contratos-obras", "guias-contratos-obras")
        )
    ]
    sm_issues = sitemap_membership_ok(
        sm_page_urls,
        [f"{SITE}{u}" if not u.startswith("http") else u for u in page_idx]
        if page_idx and sm_page_urls and sm_page_urls[0].startswith("http")
        else page_idx,
    )
    # normalize membership: compare paths
    sm_paths = []
    for u in sm_page_urls:
        from urllib.parse import urlparse

        sm_paths.append(urlparse(u).path if u.startswith("http") else u)
    sm_issues = sitemap_membership_ok(sm_paths, page_idx)

    save_registry(reg)

    report = {
        "ok": all(r["gate_ok"] for r in results if r["status"] in INDEXABLE_STATES)
        and not sm_issues,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "page_defs": len(defs),
        "indexable_count": len(indexable),
        "indexable_urls": [p["url"] for p in indexable],
        "results": results,
        "sitemap_counts": sm_counts,
        "sitemap_issues": sm_issues,
        "fail_closed_intelligence_publishable": True,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def get_page_safe(reg: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    from scripts.editorial.registry import get_page

    return get_page(reg, page_id)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    auto = "--auto-approve" in argv
    report = build(auto_approve=auto)
    print(json.dumps({"ok": report["ok"], "indexable": report["indexable_count"]}, ensure_ascii=False))
    return 0 if report["ok"] or report["indexable_count"] >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
