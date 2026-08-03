#!/usr/bin/env python3
"""Human approval CLI — only named humans may stamp HUMAN_APPROVED / INDEXABLE.

Fail-closed:
  - complete per-page checklist
  - material hash match
  - individual --confirm (no bulk / approve-all)
  - external reviewer identity (not tester/ci/bot)
  - blocked in CI / automation environments
  - cannot approve REJECTED pages

Usage (example — run by named human outside agent):
  ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \\
    --reviewer "Tiago Sasaki" \\
    --page-id lei-art124-alteracao-obra \\
    --notes "Fontes Planalto art.124-125 conferidas; CTAs e naturalidade OK." \\
    --sources lei-14133-art124,lei-14133-planalto \\
    --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \\
    --material-hash <hash from packet> \\
    --confirm \\
    --indexable
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.governance import (  # noqa: E402
    EDITORIAL_CHECKLIST_KEYS,
    validate_approval_request,
)
from scripts.editorial.registry import (  # noqa: E402
    approve_human,
    get_page,
    load_registry,
    mark_indexable,
    save_registry,
)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Human-approve editorial page (fail-closed)")
    ap.add_argument("--reviewer", required=True, help="Real human name (not operator/bot/tester)")
    ap.add_argument("--page-id", required=True)
    ap.add_argument("--notes", required=True)
    ap.add_argument(
        "--sources",
        required=True,
        help="Comma-separated source_ids verified",
    )
    ap.add_argument("--caveats", default="")
    ap.add_argument(
        "--checklist",
        default="",
        help="Comma-separated completed checklist keys (all required)",
    )
    ap.add_argument(
        "--material-hash",
        default="",
        dest="material_hash",
        help="Material hash from review packet; must match registry",
    )
    ap.add_argument(
        "--confirm",
        action="store_true",
        help="Required individual confirmation for this single page_id",
    )
    ap.add_argument(
        "--indexable",
        action="store_true",
        help="Also advance HUMAN_APPROVED → INDEXABLE",
    )
    # Explicitly reject bulk
    ap.add_argument(
        "--page-ids",
        default="",
        help=argparse.SUPPRESS,  # hidden trap: if provided with multiple, fail
    )
    args = ap.parse_args(argv)

    page_ids = [args.page_id]
    if args.page_ids:
        extras = [x.strip() for x in args.page_ids.split(",") if x.strip()]
        if extras:
            print("ERROR: bulk_approval_forbidden — pass exactly one --page-id", file=sys.stderr)
            return 3

    reg = load_registry()
    pg = get_page(reg, args.page_id)
    if not pg:
        print(f"unknown page_id: {args.page_id}", file=sys.stderr)
        return 1

    checklist_keys = [x.strip() for x in (args.checklist or "").split(",") if x.strip()]
    errors = validate_approval_request(
        reviewer=args.reviewer,
        notes=args.notes,
        checklist=checklist_keys,
        page_ids=page_ids,
        confirm=bool(args.confirm),
        material_hash_expected=args.material_hash or pg.get("material_hash"),
        material_hash_actual=pg.get("material_hash"),
        page_status=pg.get("status"),
        required_checklist=EDITORIAL_CHECKLIST_KEYS,
    )
    # Require explicit --material-hash when approving
    if not (args.material_hash or "").strip():
        errors.append("material_hash_flag_required")
    elif args.material_hash != pg.get("material_hash"):
        if "approval_hash_mismatch" not in errors:
            errors.append("approval_hash_mismatch")

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        print(
            "Approval blocked. Complete checklist, pass --material-hash matching the page, "
            "--confirm, and a real human --reviewer. Not allowed in CI.",
            file=sys.stderr,
        )
        return 3

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
        # stamp checklist on approval record
        pg2 = get_page(reg, args.page_id)
        if pg2 and pg2.get("approval"):
            pg2["approval"]["checklist"] = {k: True for k in EDITORIAL_CHECKLIST_KEYS}
        if args.indexable:
            mark_indexable(reg, args.page_id)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    save_registry(reg)
    docs = ROOT / "docs" / "editorial" / "EDITORIAL-REGISTRY.json"
    if docs.parent.exists():
        docs.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pg = get_page(reg, args.page_id)
    print({"page_id": args.page_id, "status": pg.get("status") if pg else None})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
