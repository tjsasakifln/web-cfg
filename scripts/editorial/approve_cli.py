#!/usr/bin/env python3
"""Human approval CLI — only named humans may stamp HUMAN_APPROVED / INDEXABLE.

Usage:
  python3 scripts/editorial/approve_cli.py \\
    --reviewer "Tiago Sasaki" \\
    --page-id lei-art124-alteracao-obra \\
    --notes "Fontes Planalto art.124-125 conferidas; CTAs e naturalidade OK." \\
    --sources lei-14133-art124,lei-14133-planalto \\
    --indexable
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.registry import (  # noqa: E402
    approve_human,
    get_page,
    load_registry,
    mark_indexable,
    save_registry,
)


def main() -> int:
    ap = argparse.ArgumentParser(description="Human-approve editorial page")
    ap.add_argument("--reviewer", required=True, help="Real human name (not operator/bot)")
    ap.add_argument("--page-id", required=True)
    ap.add_argument("--notes", required=True)
    ap.add_argument(
        "--sources",
        required=True,
        help="Comma-separated source_ids verified",
    )
    ap.add_argument("--caveats", default="")
    ap.add_argument(
        "--indexable",
        action="store_true",
        help="Also advance HUMAN_APPROVED → INDEXABLE",
    )
    args = ap.parse_args()
    reg = load_registry()
    if not get_page(reg, args.page_id):
        print(f"unknown page_id: {args.page_id}", file=sys.stderr)
        return 1
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    try:
        approve_human(
            reg,
            args.page_id,
            reviewer=args.reviewer,
            notes=args.notes,
            sources_verified=sources,
            caveats=args.caveats,
        )
        if args.indexable:
            mark_indexable(reg, args.page_id)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    save_registry(reg)
    docs = ROOT / "docs" / "editorial" / "EDITORIAL-REGISTRY.json"
    if docs.parent.exists():
        import json

        docs.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pg = get_page(reg, args.page_id)
    print({"page_id": args.page_id, "status": pg.get("status") if pg else None})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
