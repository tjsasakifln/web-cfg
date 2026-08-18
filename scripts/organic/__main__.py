#!/usr/bin/env python3
"""CLI: python -m scripts.organic [run|diagnose|cohort|growth|bridges|sitemap-audit|demand-engine]

Default: run engine against data/pseo + seo/gsc export → data/organic/SEO_OPPORTUNITIES.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PSEO = ROOT / "data" / "pseo"
ORGANIC = ROOT / "data" / "organic"
# Prefer newest export; fallback to prior
GSC_DEFAULT = ROOT / "seo" / "gsc-2026-08-09"
if not GSC_DEFAULT.exists():
    GSC_DEFAULT = ROOT / "seo" / "gsc-2026-07-30"


def cmd_run(args: argparse.Namespace) -> int:
    from scripts.organic.engine import run_engine
    from scripts.organic.demand_graph import demand_map
    from scripts.organic.gsc_loader import load_gsc_dir
    from scripts.organic.metrics import commercial_exposure_metrics
    from scripts.organic.service_map import audit_link_coverage

    gsc_dir = Path(args.gsc_dir) if args.gsc_dir else GSC_DEFAULT
    out = Path(args.out) if args.out else ORGANIC / "SEO_OPPORTUNITIES.json"
    gsc = load_gsc_dir(gsc_dir)
    # Engine still accepts raw CSV-shaped dicts; pass normalized page rows as gsc_pages
    # with Portuguese keys for backward compatibility
    gsc_pages = [
        {
            "Páginas principais": p["url"],
            "Cliques": p["clicks"],
            "Impressões": p["impressions"],
            "Posição": p["position"],
            "CTR": f"{p['ctr']*100:.2f}%",
        }
        for p in gsc["pages"]
    ]
    gsc_queries = [
        {
            "Top consultas": q["query"],
            "Cliques": q["clicks"],
            "Impressões": q["impressions"],
            "Posição": q["position"],
        }
        for q in gsc["queries"]
    ]
    doc = run_engine(
        pseo_dir=Path(args.pseo_dir) if args.pseo_dir else PSEO,
        out_path=None,  # write after enriching
        gsc_queries=gsc_queries or None,
        gsc_pages=gsc_pages or None,
        as_of=args.as_of or gsc.get("meta", {}).get("export_date"),
    )
    coverage = audit_link_coverage(ROOT)
    serp_all = doc.get("serp_ctr_opportunities") or []
    serp_real_gaps = [
        d
        for d in serp_all
        if d.get("kind") == "ctr_gap" or (d.get("ctr_gap") or {}).get("is_opportunity")
    ]
    metrics = commercial_exposure_metrics(
        gsc["pages"],
        link_coverage=coverage,
        ctr_opportunities=serp_real_gaps,
    )
    doc["commercial_exposure_metrics"] = metrics
    doc["link_coverage"] = {
        k: coverage[k]
        for k in (
            "content_to_service_link_coverage",
            "commercial_bridge_coverage",
            "service_to_supporting_content_coverage",
            "indexable_content_to_service_link_coverage",
            "indexable_commercial_bridge_coverage",
            "indexable_mapped",
            "mapped",
            "content_pages_scanned",
        )
        if k in coverage
    }
    doc["gsc_export"] = {
        "dir": gsc["dir"],
        "export_id": gsc["export_id"],
        "totals": gsc["totals"],
        "devices": gsc["devices"],
        "aggregation_note": gsc["aggregation_note"],
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    dm_path = ORGANIC / "demand-map.json"
    dm_path.parent.mkdir(parents=True, exist_ok=True)
    dm_path.write_text(
        json.dumps(demand_map(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(out),
                "demand_map": str(dm_path),
                "gsc_export": gsc["export_id"],
                "total": doc["counts"]["total"],
                "bofu": doc["counts"]["bofu"],
                "serp_ctr_gap": doc["counts"].get("serp_ctr_gap"),
                "commercial_impression_share": metrics.get("commercial_impression_share"),
                "top3": [
                    {"id": o["id"], "score": o["score"], "action": o["action"], "intent": o["intent"]}
                    for o in doc["opportunities"][:3]
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_diagnose(args: argparse.Namespace) -> int:
    from scripts.organic.diagnosis import build_diagnosis

    out = Path(args.out) if args.out else ORGANIC / "diagnosis.json"
    doc = build_diagnosis(ROOT)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = out.with_suffix(".md")
    md.write_text(doc.get("markdown") or "", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "md": str(md)}, ensure_ascii=False))
    return 0


def cmd_cohort(args: argparse.Namespace) -> int:
    from scripts.organic.cohort import select_and_materialize_cohort

    opps_path = Path(args.opportunities) if args.opportunities else ORGANIC / "SEO_OPPORTUNITIES.json"
    if not opps_path.exists():
        cmd_run(argparse.Namespace(pseo_dir=None, gsc_dir=None, out=str(opps_path), as_of=None))
    doc = json.loads(opps_path.read_text(encoding="utf-8"))
    cohort = select_and_materialize_cohort(ROOT, doc, apply=bool(args.apply))
    out = ORGANIC / "pilot-cohort.json"
    out.write_text(json.dumps(cohort, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "n": len(cohort.get("items") or [])}, ensure_ascii=False))
    return 0


def cmd_growth(args: argparse.Namespace) -> int:
    from scripts.organic.growth_report import write_growth_report

    gsc_dir = Path(args.gsc_dir) if args.gsc_dir else GSC_DEFAULT
    out_json = Path(args.out) if args.out else ORGANIC / "growth-report.json"
    out_md = Path(args.md) if args.md else ROOT / "docs" / "ops" / "ORGANIC-GROWTH-REPORT.md"
    opps_path = ORGANIC / "SEO_OPPORTUNITIES.json"
    opps = json.loads(opps_path.read_text(encoding="utf-8")) if opps_path.exists() else None
    doc = write_growth_report(
        ROOT, gsc_dir, out_json=out_json, out_md=out_md, opportunities_doc=opps
    )
    print(
        json.dumps(
            {
                "ok": True,
                "json": str(out_json),
                "md": str(out_md),
                "actions": len(doc.get("actions") or []),
                "ctr_gaps": len((doc.get("sections") or {}).get("ctr_gap") or []),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_bridges(args: argparse.Namespace) -> int:
    from scripts.organic.bridges import apply_bridges

    paths = args.paths.split(",") if args.paths else None
    result = apply_bridges(
        ROOT,
        only_indexable=not bool(args.include_noindex),
        paths=paths,
        dry_run=bool(args.dry_run),
    )
    out = ORGANIC / "bridges-apply.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "applied": result.get("applied")}, ensure_ascii=False))
    return 0


def cmd_demand_engine(args: argparse.Namespace) -> int:
    from scripts.organic.demand_engine import main as demand_main

    forwarded: list[str] = []
    if args.gsc_dir:
        forwarded.extend(["--gsc-dir", args.gsc_dir])
    if args.rows:
        forwarded.extend(["--rows", args.rows])
    if args.proposals:
        forwarded.extend(["--proposals", args.proposals])
    if args.out:
        forwarded.extend(["--out", args.out])
    if args.config:
        forwarded.extend(["--config", args.config])
    if args.pull_api:
        forwarded.append("--pull-api")
    if args.compare_strip_clock:
        forwarded.append("--compare-strip-clock")
    return demand_main(forwarded)


def cmd_breakout(args: argparse.Namespace) -> int:
    from scripts.organic.breakout import main as breakout_main

    return breakout_main([args.breakout_cmd])


def cmd_sitemap_audit(args: argparse.Namespace) -> int:
    from scripts.organic.sitemap_hygiene import audit_sitemaps

    report = audit_sitemaps(ROOT)
    out = Path(args.out) if args.out else ORGANIC / "sitemap-hygiene.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": report.get("ok"), "out": str(out), "issues": len(report.get("issues") or [])}, ensure_ascii=False))
    return 0 if report.get("ok") or args.allow_fail else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="CONFENGE Organic Opportunity Engine (web-cfg)")
    sub = p.add_subparsers(dest="cmd")

    r = sub.add_parser("run", help="Build SEO_OPPORTUNITIES.json")
    r.add_argument("--pseo-dir", default=None)
    r.add_argument("--gsc-dir", default=None)
    r.add_argument("--out", default=None)
    r.add_argument("--as-of", default=None)
    r.set_defaults(func=cmd_run)

    d = sub.add_parser("diagnose", help="Write reproducible diagnosis artifacts")
    d.add_argument("--out", default=None)
    d.set_defaults(func=cmd_diagnose)

    c = sub.add_parser("cohort", help="Select pilot cohort from scored opportunities")
    c.add_argument("--opportunities", default=None)
    c.add_argument("--apply", action="store_true", help="Apply safe HTML improvements")
    c.set_defaults(func=cmd_cohort)

    g = sub.add_parser("growth", help="Write ORGANIC-GROWTH-REPORT from GSC export")
    g.add_argument("--gsc-dir", default=None)
    g.add_argument("--out", default=None)
    g.add_argument("--md", default=None)
    g.set_defaults(func=cmd_growth)

    b = sub.add_parser("bridges", help="Apply editorial commercial bridges on content")
    b.add_argument("--paths", default=None, help="Comma-separated paths")
    b.add_argument("--include-noindex", action="store_true")
    b.add_argument("--dry-run", action="store_true")
    b.set_defaults(func=cmd_bridges)

    de = sub.add_parser(
        "demand-engine",
        help="Normalize GSC snapshot → candidate/rejection registry (does not authorize pages)",
    )
    de.add_argument("--gsc-dir", default=None)
    de.add_argument("--rows", default=None)
    de.add_argument("--proposals", default=None)
    de.add_argument("--out", default=None)
    de.add_argument("--config", default=None)
    de.add_argument("--pull-api", action="store_true")
    de.add_argument("--compare-strip-clock", action="store_true")
    de.set_defaults(func=cmd_demand_engine)

    s = sub.add_parser("sitemap-audit", help="Audit sitemap hygiene")
    s.add_argument("--out", default=None)
    s.add_argument("--allow-fail", action="store_true")
    s.set_defaults(func=cmd_sitemap_audit)

    br = sub.add_parser("breakout", help="CONFENGE-ORGANIC-BREAKOUT-01 select/gate/render (max 3)")
    br.add_argument("breakout_cmd", nargs="?", default="build", choices=("build", "validate", "hashes"))
    br.set_defaults(func=cmd_breakout)

    args = p.parse_args(argv)
    if not args.cmd:
        args = p.parse_args(["run", *(argv or [])])
        return cmd_run(args)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
