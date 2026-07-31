#!/usr/bin/env python3
"""Human review CLI for pSEO registry — no bulk auto-approve.

Usage:
  python3 scripts/pseo/review.py list
  python3 scripts/pseo/review.py show PAGE_ID
  python3 scripts/pseo/review.py set PAGE_ID APPROVED --reviewer tiago --notes "..."
  python3 scripts/pseo/review.py report

States: PENDING | APPROVED | APPROVED_WITH_NOTES | REJECTED |
        NEEDS_DATA_FIX | NEEDS_CONTENT_FIX | EXPIRED
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "data" / "pseo" / "registry.json"

ALLOWED = {
    "PENDING",
    "APPROVED",
    "APPROVED_WITH_NOTES",
    "REJECTED",
    "NEEDS_DATA_FIX",
    "NEEDS_CONTENT_FIX",
    "EXPIRED",
}


def load_reg() -> dict:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def save_reg(reg: dict) -> None:
    REGISTRY.write_text(
        json.dumps(reg, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def cmd_list(args: argparse.Namespace) -> int:
    reg = load_reg()
    pages = reg.get("pages") or []
    status_f = args.status
    hr_f = args.human_review
    for p in pages:
        if status_f and p.get("status") != status_f:
            continue
        if hr_f and p.get("human_review") != hr_f:
            continue
        print(
            f"{p.get('page_id')}\t{p.get('status')}\t{p.get('human_review')}\t"
            f"score={p.get('indexability_score')}\t{p.get('url')}"
        )
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    reg = load_reg()
    for p in reg.get("pages") or []:
        if p.get("page_id") == args.page_id:
            print(json.dumps(p, ensure_ascii=False, indent=2))
            return 0
    print(f"not found: {args.page_id}", file=sys.stderr)
    return 1


def cmd_set(args: argparse.Namespace) -> int:
    if args.state not in ALLOWED:
        print(f"invalid state {args.state}; allowed={sorted(ALLOWED)}", file=sys.stderr)
        return 2
    if args.state in {"APPROVED", "APPROVED_WITH_NOTES"} and not args.reviewer:
        print("reviewer required for approval", file=sys.stderr)
        return 2
    reg = load_reg()
    found = False
    for p in reg.get("pages") or []:
        if p.get("page_id") != args.page_id:
            continue
        found = True
        p["human_review"] = args.state
        p["reviewer"] = args.reviewer
        p["review_date"] = date.today().isoformat()
        p["review_notes"] = args.notes
        p["review_dataset_hash"] = reg.get("dataset_hash") or p.get("dataset_hash")
        if args.evidences:
            p["evidences_checked"] = [x.strip() for x in args.evidences.split("|") if x.strip()]
        print(f"updated {args.page_id} -> {args.state}")
    if not found:
        print(f"not found: {args.page_id}", file=sys.stderr)
        return 1
    save_reg(reg)
    print("NOTE: run npm run pseo:build to apply indexation gates")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    reg = load_reg()
    from collections import Counter

    pages = reg.get("pages") or []
    print("dataset_hash", reg.get("dataset_hash"))
    print("status", dict(Counter(p.get("status") for p in pages)))
    print("human_review", dict(Counter(p.get("human_review") for p in pages)))
    print("by_type", dict(Counter(p.get("page_type") for p in pages)))
    pending = [p for p in pages if p.get("human_review") == "PENDING" and p.get("quality_eligible")]
    print(f"quality_eligible_pending_review: {len(pending)}")
    for p in pending[:20]:
        print(f"  {p.get('page_id')}\tscore={p.get('indexability_score')}\t{p.get('url')}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="pSEO human review CLI")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--status")
    p_list.add_argument("--human-review")
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show")
    p_show.add_argument("page_id")
    p_show.set_defaults(func=cmd_show)

    p_set = sub.add_parser("set")
    p_set.add_argument("page_id")
    p_set.add_argument("state")
    p_set.add_argument("--reviewer", default=None)
    p_set.add_argument("--notes", default="")
    p_set.add_argument("--evidences", default="", help="pipe-separated evidence notes")
    p_set.set_defaults(func=cmd_set)

    p_rep = sub.add_parser("report")
    p_rep.set_defaults(func=cmd_report)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
