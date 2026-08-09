#!/usr/bin/env python3
"""CLI: python -m scripts.organic [run|diagnose|cohort]

Default: run engine against data/pseo + seo/gsc export → data/organic/SEO_OPPORTUNITIES.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PSEO = ROOT / "data" / "pseo"
ORGANIC = ROOT / "data" / "organic"
GSC_DEFAULT = ROOT / "seo" / "gsc-2026-07-30"


def _load_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cmd_run(args: argparse.Namespace) -> int:
    from scripts.organic.engine import run_engine
    from scripts.organic.demand_graph import demand_map

    gsc_dir = Path(args.gsc_dir) if args.gsc_dir else GSC_DEFAULT
    out = Path(args.out) if args.out else ORGANIC / "SEO_OPPORTUNITIES.json"
    doc = run_engine(
        pseo_dir=Path(args.pseo_dir) if args.pseo_dir else PSEO,
        out_path=out,
        gsc_queries=_load_csv(gsc_dir / "Consultas.csv") or None,
        gsc_pages=_load_csv(gsc_dir / "Paginas.csv") or None,
        as_of=args.as_of,
    )
    # Write demand map alongside
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
                "total": doc["counts"]["total"],
                "bofu": doc["counts"]["bofu"],
                "data_driven": doc["counts"]["data_driven"],
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
        # generate first
        cmd_run(argparse.Namespace(pseo_dir=None, gsc_dir=None, out=str(opps_path), as_of=None))
    doc = json.loads(opps_path.read_text(encoding="utf-8"))
    cohort = select_and_materialize_cohort(ROOT, doc, apply=bool(args.apply))
    out = ORGANIC / "pilot-cohort.json"
    out.write_text(json.dumps(cohort, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "n": len(cohort.get("items") or [])}, ensure_ascii=False))
    return 0


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

    args = p.parse_args(argv)
    if not args.cmd:
        args = p.parse_args(["run", *(argv or [])])
        return cmd_run(args)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
