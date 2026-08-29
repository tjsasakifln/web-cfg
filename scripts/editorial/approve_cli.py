#!/usr/bin/env python3
"""Individual named-human approval for one PR #54 preview page.

This CLI never approves in CI and never treats a local commit or production
URL as proof.  It fetches the Netlify deploy preview, verifies all three
cohort pages against the current PR head and stores the selected page's exact
preview evidence in the approval record.

Example (run only by the named human after reviewing the preview):
  ALLOW_HUMAN_APPROVAL=1 python3 scripts/editorial/approve_cli.py \\
    --reviewer "Tiago Sasaki" \\
    --page-id guia-checklist-aditivo \\
    --notes "Fontes, limites, CTAs e decisão de canibalização conferidos no preview." \\
    --sources lei-14133-art124,lei-14133-art125,lei-14133-art126-132,lei-14133-planalto,agu-alteracoes-contratuais-2024 \\
    --checklist sources_verified,legal_devices_checked,naturalness_ok,cta_contextual,no_fictitious_authorship,cannibalization_resolved_or_blocked,material_hash_confirmed,no_indecent_promise \\
    --material-hash <hash-do-pacote> --confirm --indexable
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.cohort import FIRST_COHORT_SET  # noqa: E402
from scripts.editorial.governance import (  # noqa: E402
    EDITORIAL_CHECKLIST_KEYS,
    validate_approval_request,
)
from scripts.editorial.preview import deploy_commit, verify_preview_cohort  # noqa: E402
from scripts.editorial.registry import (  # noqa: E402
    REVIEW_PREVIEW_BASE_URL,
    approve_human,
    get_page,
    load_registry,
    mark_indexable,
    material_hash,
    save_registry,
    source_verification_errors,
)
from scripts.editorial.sources import load_manifest  # noqa: E402


def _source_ids(raw: str) -> list[str]:
    return [source.strip() for source in (raw or "").split(",") if source.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Human-approve one editorial page (fail-closed)")
    parser.add_argument("--reviewer", required=True, help="Real human name (not operator/bot/tester)")
    parser.add_argument("--page-id", required=True)
    parser.add_argument("--notes", required=True)
    parser.add_argument("--sources", required=True, help="Comma-separated exact page source_ids verified")
    parser.add_argument("--caveats", default="")
    parser.add_argument("--checklist", default="", help="Comma-separated completed checklist keys (all required)")
    parser.add_argument("--material-hash", default="", help="Current hash from the review packet")
    parser.add_argument("--confirm", action="store_true", help="Required individual confirmation")
    parser.add_argument("--indexable", action="store_true", help="Also advance HUMAN_APPROVED → INDEXABLE")
    parser.add_argument(
        "--preview-base-url",
        default=REVIEW_PREVIEW_BASE_URL,
        help="PR #54 Netlify deploy preview (production URLs are rejected)",
    )
    parser.add_argument(
        "--review-target-sha",
        default="",
        help="Optional exact PR head; otherwise derived from this checked-out branch",
    )
    parser.add_argument("--page-ids", default="", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.page_ids and [item.strip() for item in args.page_ids.split(",") if item.strip()]:
        print("ERROR: bulk_approval_forbidden — pass exactly one --page-id", file=sys.stderr)
        return 3
    if args.indexable and args.page_id not in FIRST_COHORT_SET:
        print(
            "ERROR: outside_first_cohort_not_indexable — this release permits only "
            "guia-checklist-aditivo and lei-item-novo-desconto",
            file=sys.stderr,
        )
        return 3

    registry = load_registry()
    page = get_page(registry, args.page_id)
    if not page:
        print(f"unknown page_id: {args.page_id}", file=sys.stderr)
        return 1
    manifest = load_manifest()
    current_hash = material_hash(page, manifest)
    checklist_keys = [item.strip() for item in (args.checklist or "").split(",") if item.strip()]
    errors = validate_approval_request(
        reviewer=args.reviewer,
        notes=args.notes,
        checklist=checklist_keys,
        page_ids=[args.page_id],
        confirm=bool(args.confirm),
        material_hash_expected=(args.material_hash or "").strip() or None,
        material_hash_actual=current_hash,
        page_status=page.get("status"),
        required_checklist=EDITORIAL_CHECKLIST_KEYS,
        require_material_hash=True,
        require_allow_human_approval=True,
    )
    if page.get("material_hash") != current_hash:
        errors.append("registry_material_hash_stale_run_editorial_build")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print("Approval blocked before any write.", file=sys.stderr)
        return 3

    sources = _source_ids(args.sources)
    source_errors = source_verification_errors(page, sources, manifest)
    if source_errors:
        for error in source_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 3

    expected_head = (args.review_target_sha or deploy_commit()).strip().lower()
    try:
        preview_evidence = verify_preview_cohort(
            registry,
            base_url=args.preview_base_url,
            expected_head=expected_head,
        )[args.page_id]
    except (KeyError, ValueError) as exc:
        print(f"ERROR: preview_verification_failed:{exc}", file=sys.stderr)
        return 3

    checklist = {key: True for key in checklist_keys if key in EDITORIAL_CHECKLIST_KEYS}
    try:
        approve_human(
            registry,
            args.page_id,
            reviewer=args.reviewer,
            notes=args.notes,
            sources_verified=sources,
            checklist=checklist,
            preview_evidence=preview_evidence,
            caveats=args.caveats,
            source_manifest=manifest,
        )
        if args.indexable:
            mark_indexable(registry, args.page_id, source_manifest=manifest)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    save_registry(registry, source_manifest=manifest)
    docs = ROOT / "docs" / "editorial" / "EDITORIAL-REGISTRY.json"
    if docs.parent.exists():
        docs.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    approved = get_page(registry, args.page_id)
    print({"page_id": args.page_id, "status": approved.get("status") if approved else None})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
