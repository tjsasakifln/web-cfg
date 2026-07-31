#!/usr/bin/env python3
"""Build static pSEO pages from data/pseo snapshot. Fail-closed on bad data.

Indexation policy (no artificial page cap):
  if mandatory_fail -> reject
  elif human_review not in APPROVED|APPROVED_WITH_NOTES -> noindex
  elif quality_gates_passed (score/status eligible) -> publish
  else -> noindex | reject | consolidated
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.render import render_candidate, render_hub  # noqa: E402
from scripts.pseo.schema import SnapshotError, validate_snapshot  # noqa: E402
from scripts.pseo.score import (  # noqa: E402
    APPROVED_REVIEWS,
    Candidate,
    apply_human_review_gate,
    build_candidates,
    resolve_related_urls,
)
from scripts.pseo.similarity import find_similar_pairs  # noqa: E402

SITE = "https://confenge.com.br"
SIM_THRESHOLD = 0.88


def url_to_path(url: str) -> Path:
    rel = url.strip("/")
    return ROOT / rel / "index.html"


def load_existing_reviews(registry_path: Path) -> dict[str, dict[str, Any]]:
    if not registry_path.exists():
        return {}
    try:
        reg = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for p in reg.get("pages") or []:
        pid = p.get("page_id")
        if pid:
            out[pid] = {
                "human_review": p.get("human_review") or "PENDING",
                "reviewer": p.get("reviewer"),
                "review_date": p.get("review_date"),
                "review_notes": p.get("review_notes"),
                "review_dataset_hash": p.get("review_dataset_hash") or p.get("dataset_hash"),
                "evidences_checked": p.get("evidences_checked"),
            }
    return out


def apply_similarity_gate(cands: list[Candidate]) -> list[Candidate]:
    """Consolidate near-duplicates (similarity only — no numeric publish cap)."""
    by_id = {c.page_id: c for c in cands}
    publishable = [c for c in cands if c.status in {"publish", "noindex", "eligible"}]
    pairs = find_similar_pairs(
        [(c.page_id, c.body_text + " " + c.h1) for c in publishable],
        threshold=SIM_THRESHOLD,
    )
    for a, b, s in pairs:
        ca, cb = by_id[a], by_id[b]
        if ca.page_type != cb.page_type:
            continue
        loser = ca if (ca.observation_count, ca.score) < (cb.observation_count, cb.score) else cb
        winner = cb if loser is ca else ca
        if loser.status == "reject":
            continue
        loser.status = "reject"
        loser.mandatory_fail.append(f"similar_to:{winner.page_id}:{s}")
        loser.reasons.append(f"consolidated_similar_to={winner.page_id}")
    return cands


def write_registry(
    cands: list[Candidate],
    manifest: dict[str, Any],
    out: Path,
    existing_reviews: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    material_date = date.today().isoformat()
    existing_reviews = existing_reviews or {}
    dataset_hash = manifest.get("dataset_hash")
    rows = []
    for c in cands:
        prev = existing_reviews.get(c.page_id) or {}
        human = prev.get("human_review") or "PENDING"
        # Invalidate approval if dataset changed materially
        if (
            human in APPROVED_REVIEWS
            and prev.get("review_dataset_hash")
            and dataset_hash
            and prev.get("review_dataset_hash") != dataset_hash
        ):
            human = "PENDING"
            c.reasons.append("approval_invalidated_dataset_changed")
        rows.append(
            {
                **c.as_dict(),
                "dataset_hash": dataset_hash,
                "source_run_id": manifest.get("source_run_id"),
                "last_material_change": material_date,
                "canonical_related": (c.related_urls or [None])[0],
                "human_review": human,
                "reviewer": prev.get("reviewer"),
                "review_date": prev.get("review_date"),
                "review_notes": prev.get("review_notes"),
                "review_dataset_hash": prev.get("review_dataset_hash"),
                "evidences_checked": prev.get("evidences_checked"),
                "publication_decision_reason": "; ".join(c.reasons),
            }
        )
    registry = {
        "generated_at": material_date,
        "dataset_hash": dataset_hash,
        "source_run_id": manifest.get("source_run_id"),
        "counts": dict(Counter(c.status for c in cands)),
        "by_type": dict(Counter(c.page_type for c in cands)),
        "human_review_policy": {
            "indexable_states": sorted(APPROVED_REVIEWS),
            "note": "Only APPROVED and APPROVED_WITH_NOTES may be published/indexed.",
        },
        "pages": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    out.write_text(text, encoding="utf-8")
    return registry


def _sitemap_lastmod(manifest: dict[str, Any]) -> str:
    """W3C date for sitemap lastmod — never in the future (GSC hard-rejects that).

    Prefer data_as_of (export verification date). Do NOT use data_period_end:
    open-bid end dates often sit months ahead of as_of and poison lastmod.
    """
    today = date.today()
    candidates: list[date] = []
    for raw in (
        manifest.get("data_as_of"),
        (manifest.get("freshness") or {}).get("data_as_of"),
        (manifest.get("freshness") or {}).get("generated_at"),
        manifest.get("generated_at"),
    ):
        if not raw:
            continue
        s = str(raw)[:10]
        try:
            d = date.fromisoformat(s)
        except ValueError:
            continue
        if d <= today:
            candidates.append(d)
    if candidates:
        return max(candidates).isoformat()
    return today.isoformat()


def write_sitemap(cands: list[Candidate], lastmod: str) -> Path:
    """Sitemap only for publish (human-approved + quality gates)."""
    pubs = [c for c in cands if c.status == "publish"]
    urls = [
        f"  <url>\n    <loc>{SITE}{c.url}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>"
        for c in sorted(pubs, key=lambda x: x.url)
    ]
    hubs = [
        "/inteligencia/",
        "/inteligencia/mercados/",
        "/inteligencia/orgaos/",
        "/inteligencia/precos/",
        "/inteligencia/concorrencia/",
        "/inteligencia/cenarios/",
        "/radar/",
    ]
    for h in hubs:
        urls.insert(0, f"  <url>\n    <loc>{SITE}{h}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>")
    seen = set()
    final = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        final.append(u)
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(final) + "\n</urlset>\n"
    path = ROOT / "sitemap-inteligencia.xml"
    path.write_text(xml, encoding="utf-8")
    return path


def write_sitemap_index(lastmod: str) -> Path:
    """Single entry point for GSC: index of main + inteligência urlsets."""
    # Use sitemapindex so one submit covers both files (recommended by Google)
    parts = [
        f"  <sitemap>\n    <loc>{SITE}/sitemap.xml</loc>\n    <lastmod>{lastmod}</lastmod>\n  </sitemap>",
        f"  <sitemap>\n    <loc>{SITE}/sitemap-inteligencia.xml</loc>\n    <lastmod>{lastmod}</lastmod>\n  </sitemap>",
    ]
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(parts)
        + "\n</sitemapindex>\n"
    )
    path = ROOT / "sitemap-index.xml"
    path.write_text(xml, encoding="utf-8")
    return path


def patch_main_sitemap_index() -> None:
    robots = ROOT / "robots.txt"
    text = robots.read_text(encoding="utf-8")
    lines_needed = [
        "Sitemap: https://confenge.com.br/sitemap-index.xml",
        "Sitemap: https://confenge.com.br/sitemap.xml",
        "Sitemap: https://confenge.com.br/sitemap-inteligencia.xml",
    ]
    changed = False
    if not text.endswith("\n"):
        text += "\n"
        changed = True
    for line in lines_needed:
        if line not in text:
            text += line + "\n"
            changed = True
    if changed:
        robots.write_text(text, encoding="utf-8")


def render_hubs(cands: list[Candidate]) -> list[str]:
    pubs = [c for c in cands if c.status in {"publish", "noindex"}]

    def items_for(ptype: str) -> list[tuple]:
        out = []
        for c in sorted(pubs, key=lambda x: -x.score):
            if c.page_type != ptype:
                continue
            badge = "indexável" if c.status == "publish" else "preview (revisão)"
            meta = f"{c.page_type} · {badge}"
            out.append((c.url, c.page_type, c.h1[:90], meta))
        return out

    written = []
    hubs = [
        (
            "/inteligencia/",
            "Inteligência de mercado e contratação pública | CONFENGE",
            "Inteligência decisória para obras e contratos públicos",
            "Mercados, órgãos, preços, concorrência e radar — evidência pública, sem ranking proprietário.",
            "Hub de páginas de inteligência orientadas a decisão comercial e técnica. "
            "Páginas-filha só entram no índice após gates de qualidade, evidência e revisão humana.",
            [
                ("/inteligencia/mercados/", "hub", "Mercados", "Demanda e órgãos"),
                ("/inteligencia/orgaos/", "hub", "Órgãos compradores", "Dossiês"),
                ("/inteligencia/precos/", "hub", "Benchmarks de preços", "Medianas e quartis"),
                ("/inteligencia/concorrencia/", "hub", "Concorrência observada", "Frequência neutra"),
                ("/radar/", "hub", "Radar de oportunidades", "Evergreen"),
                ("/inteligencia/cenarios/", "hub", "Cenários problema→serviço", "Clusters técnicos"),
            ],
            [("Início", "/"), ("Inteligência", None)],
        ),
        (
            "/inteligencia/mercados/",
            "Mercados públicos de engenharia | CONFENGE",
            "Mercados por segmento e região",
            "Contratos, órgãos e evolução — para priorizar onde atuar.",
            "Lista de mercados",
            items_for("market"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Mercados", None)],
        ),
        (
            "/inteligencia/orgaos/",
            "Órgãos compradores de engenharia | CONFENGE",
            "Dossiês de órgãos compradores",
            "Histórico de contratação em engenharia com massa crítica.",
            "Lista de órgãos",
            items_for("agency"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Órgãos", None)],
        ),
        (
            "/inteligencia/precos/",
            "Benchmarks de valores contratados | CONFENGE",
            "Preços e dispersão contratual",
            "Medianas e quartis com critérios de inclusão — sem média cega.",
            "Lista de benchmarks",
            items_for("price"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Preços", None)],
        ),
        (
            "/inteligencia/concorrencia/",
            "Concorrência observada em obras públicas | CONFENGE",
            "Concorrência observada",
            "Fornecedores e concentração no recorte público.",
            "Lista",
            items_for("competition"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Concorrência", None)],
        ),
        (
            "/inteligencia/cenarios/",
            "Cenários: dados, problema e serviço | CONFENGE",
            "Do padrão público ao serviço CONFENGE",
            "Páginas que ligam evidência a clusters técnicos existentes.",
            "Lista de cenários",
            items_for("problem_service"),
            [("Início", "/"), ("Inteligência", "/inteligencia/"), ("Cenários", None)],
        ),
        (
            "/radar/",
            "Radar de oportunidades de engenharia | CONFENGE",
            "Radar evergreen de oportunidades",
            "Listas rolantes por segmento e região — não uma URL por edital.",
            "Lista radar",
            items_for("radar"),
            [("Início", "/"), ("Radar", None)],
        ),
    ]
    for path, title, h1, desc, intro, items, crumbs in hubs:
        html = render_hub(
            title=title,
            h1=h1,
            description=desc,
            path=path,
            intro=intro,
            items=items,
            crumbs=crumbs,
        )
        out = url_to_path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        written.append(str(out.relative_to(ROOT)))
    return written


def build(data_dir: Path | None = None, dry_run: bool = False) -> dict[str, Any]:
    data_dir = data_dir or (ROOT / "data" / "pseo")
    try:
        snap = validate_snapshot(data_dir)
    except SnapshotError as exc:
        print(f"FAIL-CLOSED: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc

    manifest = snap["manifest"]
    data = snap["data"]
    registry_path = data_dir / "registry.json"
    existing_reviews = load_existing_reviews(registry_path)

    cands = build_candidates(data, manifest)
    cands = apply_similarity_gate(cands)
    # Human review is a hard gate — never publish PENDING
    cands = apply_human_review_gate(cands, existing_reviews, dataset_hash=manifest.get("dataset_hash"))
    cands = resolve_related_urls(cands, site_root=ROOT)

    if not dry_run:
        write_registry(cands, manifest, registry_path, existing_reviews)

    written_pages = []
    if not dry_run:
        for base in (ROOT / "inteligencia", ROOT / "radar"):
            if not base.exists():
                continue
            for index in base.rglob("index.html"):
                rel = index.relative_to(ROOT).as_posix()
                if rel in {
                    "inteligencia/index.html",
                    "inteligencia/mercados/index.html",
                    "inteligencia/orgaos/index.html",
                    "inteligencia/precos/index.html",
                    "inteligencia/concorrencia/index.html",
                    "inteligencia/cenarios/index.html",
                    "radar/index.html",
                }:
                    continue
                try:
                    index.unlink()
                except OSError:
                    pass
    for c in cands:
        if c.status == "reject":
            continue
        html = render_candidate(c, manifest)
        path = url_to_path(c.url)
        if not dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(html, encoding="utf-8")
        written_pages.append(
            {
                "url": c.url,
                "status": c.status,
                "score": c.score,
                "path": str(path.relative_to(ROOT)),
            }
        )

    hubs = [] if dry_run else render_hubs(cands)
    # lastmod = when the snapshot was verified — never use bid data_period_end
    # (open-bid end dates can be months in the future and GSC rejects future lastmod).
    lastmod = _sitemap_lastmod(manifest)
    sm = None if dry_run else write_sitemap(cands, lastmod)
    if not dry_run:
        patch_main_sitemap_index()
        write_sitemap_index(lastmod)

    summary = {
        "ok": True,
        "dataset_hash": manifest.get("dataset_hash"),
        "source_run_id": manifest.get("source_run_id"),
        "counts": dict(Counter(c.status for c in cands)),
        "publishable": [c.url for c in cands if c.status == "publish"],
        "noindex": [c.url for c in cands if c.status == "noindex"],
        "rejected": [
            {"url": c.url, "reasons": c.reasons, "score": c.score}
            for c in cands
            if c.status == "reject"
        ],
        "pages_written": len(written_pages),
        "hubs": hubs,
        "sitemap": str(sm.relative_to(ROOT)) if sm else None,
        "registry": str(registry_path.relative_to(ROOT)),
        "policy": {
            "max_publish_pages": None,
            "human_review_required": True,
            "indexable_reviews": sorted(APPROVED_REVIEWS),
        },
    }
    report_path = ROOT / "seo" / "pseo-build-report.json"
    if not dry_run:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build CONFENGE pSEO static pages")
    p.add_argument("--data", type=Path, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)
    build(args.data, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
