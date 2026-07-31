#!/usr/bin/env python3
"""Build static pSEO pages from data/pseo snapshot. Fail-closed on bad data."""

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
from scripts.pseo.score import Candidate, build_candidates, resolve_related_urls  # noqa: E402
from scripts.pseo.similarity import find_similar_pairs  # noqa: E402

SITE = "https://confenge.com.br"
MAX_PUBLISH = 24
SIM_THRESHOLD = 0.88


def url_to_path(url: str) -> Path:
    # /inteligencia/mercados/foo/ -> inteligencia/mercados/foo/index.html
    rel = url.strip("/")
    return ROOT / rel / "index.html"


def apply_similarity_gate(cands: list[Candidate]) -> list[Candidate]:
    """Downgrade near-duplicates and cap per archetype×type for diversity."""
    by_id = {c.page_id: c for c in cands}

    # Diversity: at most 2 publish-eligible pages per (page_type, archetype)
    # Prefer higher observation_count then score.
    groups: dict[tuple[str, str], list[Candidate]] = {}
    for c in cands:
        if c.status == "reject":
            continue
        key = (c.page_type, c.archetype or c.region or c.page_id)
        groups.setdefault(key, []).append(c)
    for key, group in groups.items():
        ranked = sorted(group, key=lambda x: (-x.observation_count, -x.score, x.page_id))
        # hubs of problem_service are intentionally distinct themes — allow all 5
        limit = 5 if key[0] == "problem_service" else 2
        if key[0] == "agency":
            limit = 3
        for loser in ranked[limit:]:
            if loser.status == "reject":
                continue
            # demote to noindex rather than hard reject if still useful preview
            if loser.status == "publish":
                loser.status = "noindex"
            loser.reasons.append(f"diversity_cap_{key[0]}_{limit}")

    publishable = [c for c in cands if c.status in {"publish", "noindex"}]
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


def cap_publish(cands: list[Candidate]) -> list[Candidate]:
    """Keep at most MAX_PUBLISH indexable pages by score; demote rest to noindex."""
    pubs = sorted(
        [c for c in cands if c.status == "publish"],
        key=lambda c: (-c.score, -c.observation_count, c.page_id),
    )
    if len(pubs) <= MAX_PUBLISH:
        return cands
    for c in pubs[MAX_PUBLISH:]:
        c.status = "noindex"
        c.reasons.append(f"demoted_over_cap_{MAX_PUBLISH}")
    return cands


def write_registry(cands: list[Candidate], manifest: dict[str, Any], out: Path) -> dict[str, Any]:
    material_date = date.today().isoformat()
    rows = []
    for c in cands:
        rows.append(
            {
                **c.as_dict(),
                "dataset_hash": manifest.get("dataset_hash"),
                "source_run_id": manifest.get("source_run_id"),
                "last_material_change": material_date,
                "canonical_related": (c.related_urls or [None])[0],
                "human_review": "PENDING",
                "publication_decision_reason": "; ".join(c.reasons),
            }
        )
    registry = {
        "generated_at": material_date,
        "dataset_hash": manifest.get("dataset_hash"),
        "source_run_id": manifest.get("source_run_id"),
        "counts": dict(Counter(c.status for c in cands)),
        "by_type": dict(Counter(c.page_type for c in cands)),
        "pages": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(registry, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    out.write_text(text, encoding="utf-8")
    return registry


def write_sitemap(cands: list[Candidate], lastmod: str) -> Path:
    pubs = [c for c in cands if c.status == "publish"]
    urls = [f"  <url>\n    <loc>{SITE}{c.url}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>" for c in sorted(pubs, key=lambda x: x.url)]
    # hubs
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
    # dedupe preserving order
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


def patch_main_sitemap_index() -> None:
    """Ensure robots.txt references intelligence sitemap; keep main sitemap untouched for pre-existing URLs."""
    robots = ROOT / "robots.txt"
    text = robots.read_text(encoding="utf-8")
    line = "Sitemap: https://confenge.com.br/sitemap-inteligencia.xml"
    if line not in text:
        if not text.endswith("\n"):
            text += "\n"
        text += line + "\n"
        robots.write_text(text, encoding="utf-8")


def render_hubs(cands: list[Candidate]) -> list[str]:
    pubs = [c for c in cands if c.status in {"publish", "noindex"}]
    # main hub: only publish listed as primary; previews marked
    def items_for(ptype: str) -> list[tuple]:
        out = []
        for c in sorted(pubs, key=lambda x: -x.score):
            if c.page_type != ptype:
                continue
            # Never expose internal indexability_score in public hub UI
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
            "Hub de páginas de inteligência orientadas a decisão comercial e técnica.",
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
    cands = build_candidates(data, manifest)
    cands = apply_similarity_gate(cands)
    cands = cap_publish(cands)
    # Filter related mesh to URLs that exist or will be written (no dead sibling links)
    cands = resolve_related_urls(cands, site_root=ROOT)

    registry_path = data_dir / "registry.json"
    if not dry_run:
        write_registry(cands, manifest, registry_path)

    written_pages = []
    if not dry_run:
        # Remove previously generated leaf pages so rejects/demotions don't linger
        for base in (ROOT / "inteligencia", ROOT / "radar"):
            if not base.exists():
                continue
            for index in base.rglob("index.html"):
                # keep hub index files rewritten later; delete deep leaves first
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
        written_pages.append({"url": c.url, "status": c.status, "score": c.score, "path": str(path.relative_to(ROOT))})

    hubs = [] if dry_run else render_hubs(cands)
    lastmod = (manifest.get("freshness") or {}).get("data_period_end") or date.today().isoformat()
    if isinstance(lastmod, str) and len(lastmod) > 10:
        lastmod = lastmod[:10]
    sm = None if dry_run else write_sitemap(cands, str(lastmod))
    if not dry_run:
        patch_main_sitemap_index()

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
