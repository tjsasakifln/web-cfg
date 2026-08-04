#!/usr/bin/env python3
"""Human review CLI for pSEO registry, no bulk auto-approve.

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

    # Hard block bulk / approve-all style invocations
    if getattr(args, "page_id", None) in {"*", "ALL", "all", "approve-all"}:
        print("approval blocked, bulk/approve-all forbidden", file=sys.stderr)
        return 3
    if "," in (args.page_id or ""):
        print("approval blocked, bulk_approval_forbidden (one page_id only)", file=sys.stderr)
        return 3

    if args.state in {"APPROVED", "APPROVED_WITH_NOTES"}:
        # Import governance (fail-closed)
        try:
            from scripts.editorial.governance import (
                PSEO_CHECKLIST_KEYS,
                is_automation_environment,
                is_blocked_reviewer,
                missing_checklist,
            )
        except Exception:  # noqa: BLE001
            # Fallback minimal if package layout differs
            def is_automation_environment():  # type: ignore
                import os

                return bool(os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"))

            def is_blocked_reviewer(r):  # type: ignore
                return not r or r.strip().lower() in {"tester", "ci", "bot", "system"}

            def missing_checklist(provided, required):  # type: ignore
                have = set(provided or [])
                return sorted(set(required) - have)

            PSEO_CHECKLIST_KEYS = (  # type: ignore
                "sample_independence_verified",
                "no_internal_slugs",
                "sources_checked",
                "claims_have_direct_evidence",
                "no_duplicates_in_tables",
                "meta_description_complete",
                "cannibalization_checked",
                "cta_contextual",
            )

        try:
            from scripts.editorial.governance import human_approval_explicitly_allowed
        except Exception:  # noqa: BLE001
            def human_approval_explicitly_allowed():  # type: ignore
                import os

                return (os.environ.get("ALLOW_HUMAN_APPROVAL") or "").strip() == "1"

        if is_automation_environment():
            print("approval blocked, CI/automation environment", file=sys.stderr)
            return 3
        if not human_approval_explicitly_allowed():
            print(
                "approval blocked, set ALLOW_HUMAN_APPROVAL=1 only when a named human runs this",
                file=sys.stderr,
            )
            return 3
        if not args.reviewer or is_blocked_reviewer(args.reviewer):
            print(
                f"approval blocked, reviewer not accepted as named human: {args.reviewer!r}",
                file=sys.stderr,
            )
            return 3
        if not getattr(args, "confirm", False):
            print(
                "approval blocked, individual --confirm required (no silent approve)",
                file=sys.stderr,
            )
            return 3
        notes = (args.notes or args.rationale or "").strip()
        if len(notes) < 20:
            print("approval blocked, notes/rationale too short (min 20 chars)", file=sys.stderr)
            return 3

    reg = load_reg()
    found = False
    for p in reg.get("pages") or []:
        if p.get("page_id") != args.page_id:
            continue
        found = True
        # Block APPROVED without checklist + rationale
        if args.state in {"APPROVED", "APPROVED_WITH_NOTES"}:
            if (p.get("status") or "").upper() == "REJECTED" or (
                p.get("human_review") or ""
            ).upper() == "REJECTED":
                print("approval blocked, cannot_approve_rejected", file=sys.stderr)
                return 3
            checklist_keys = [x.strip() for x in (args.checklist or "").split(",") if x.strip()]
            required = set(PSEO_CHECKLIST_KEYS)
            existing = dict(p.get("review_checklist") or {})
            for k in checklist_keys:
                existing[k] = True
            missing = missing_checklist(existing, required)
            if missing:
                print(f"approval blocked, checklist incomplete: {missing}", file=sys.stderr)
                print("Run: python3 scripts/pseo/review.py audit PAGE_ID", file=sys.stderr)
                return 3
            # Fail-closed: --material-hash required and must match current material
            expected = (getattr(args, "material_hash", None) or "").strip()
            if not expected:
                print(
                    "approval blocked, --material-hash required and must match page_material_hash",
                    file=sys.stderr,
                )
                return 3
            sig = p.get("current_material_signature") or {
                "title": p.get("title"),
                "h1": p.get("h1"),
                "description": (p.get("description") or "")[:200],
                "cta_label": p.get("cta_label"),
                "cta_intent": p.get("cta_intent"),
                "archetype": p.get("archetype"),
                "sources": tuple(sorted(str(s) for s in (p.get("sources") or []))),
                "observation_count": p.get("observation_count"),
                "mandatory_fail": tuple(sorted(p.get("mandatory_fail") or [])),
                "template_version": "pseo-html-v2",
            }
            try:
                from scripts.pseo.score import page_material_hash

                actual = p.get("page_material_hash") or page_material_hash(sig)
            except Exception:  # noqa: BLE001
                actual = p.get("page_material_hash") or ""
            if not actual or expected != actual:
                print(
                    f"approval blocked, approval_hash_mismatch "
                    f"(expected flag must equal current page_material_hash)",
                    file=sys.stderr,
                )
                return 3
            p["review_checklist"] = existing
            p["approval_rationale"] = args.rationale or args.notes
            p["approver"] = args.reviewer
            # Capture render hash if page exists
            import hashlib
            url = (p.get("url") or "").strip("/")
            hp = ROOT / url / "index.html" if url else None
            if hp and hp.exists():
                p["reviewed_render_hash"] = hashlib.sha256(hp.read_bytes()).hexdigest()[:32]
            # Snapshot material signature + pin approved hash (already validated above)
            p["reviewed_material_signature"] = sig
            p["page_material_hash"] = actual
            p["data_quality_metrics"] = p.get("data_quality_metrics") or {}
        p["human_review"] = args.state
        p["reviewer"] = args.reviewer
        p["review_date"] = date.today().isoformat()
        p["review_notes"] = args.notes
        p["review_dataset_hash"] = reg.get("dataset_hash") or p.get("dataset_hash")
        if args.evidences:
            p["evidences_checked"] = [x.strip() for x in args.evidences.split("|") if x.strip()]
            p["evidence_sample"] = p["evidences_checked"]
        if args.claims:
            p["claims_checked"] = [x.strip() for x in args.claims.split("|") if x.strip()]
        if args.sources_checked:
            p["source_links_checked"] = [x.strip() for x in args.sources_checked.split("|") if x.strip()]
        if args.cannibalization is not None:
            p["cannibalization_checked"] = bool(args.cannibalization)
        print(f"updated {args.page_id} -> {args.state}")
    if not found:
        print(f"not found: {args.page_id}", file=sys.stderr)
        return 1
    save_reg(reg)
    print("NOTE: run npm run pseo:build to apply indexation gates")
    return 0




def _html_for(page_id: str, reg: dict) -> Path | None:
    for p in reg.get("pages") or []:
        if p.get("page_id") == page_id:
            url = (p.get("url") or "").strip("/")
            if url:
                return ROOT / url / "index.html"
    return None


def cmd_audit(args: argparse.Namespace) -> int:
    """Present data package before approval. Does not approve."""
    reg = load_reg()
    page = None
    for p in reg.get("pages") or []:
        if p.get("page_id") == args.page_id:
            page = p
            break
    if not page:
        print(f"not found: {args.page_id}", file=sys.stderr)
        return 1

    print("=" * 72)
    print(f"AUDIT PACKAGE: {args.page_id}")
    print("=" * 72)
    print(json.dumps({
        "page_id": page.get("page_id"),
        "url": page.get("url"),
        "page_type": page.get("page_type"),
        "status": page.get("status"),
        "human_review": page.get("human_review"),
        "indexability_score": page.get("indexability_score"),
        "mandatory_fail": page.get("mandatory_fail"),
        "reasons": page.get("reasons"),
        "observation_count": page.get("observation_count"),
        "sources": page.get("sources"),
        "title": page.get("title"),
        "h1": page.get("h1"),
        "description": page.get("description"),
        "cta_label": page.get("cta_label"),
        "dataset_hash": page.get("dataset_hash") or reg.get("dataset_hash"),
        "review_dataset_hash": page.get("review_dataset_hash"),
        "reviewed_render_hash": page.get("reviewed_render_hash"),
        "data_quality_metrics": page.get("data_quality_metrics"),
        "editorial_issues": page.get("editorial_issues"),
        "review_checklist": page.get("review_checklist"),
    }, ensure_ascii=False, indent=2))

    html_path = _html_for(args.page_id, reg)
    if html_path and html_path.exists():
        import hashlib
        import re
        html = html_path.read_text(encoding="utf-8", errors="replace")
        text_only = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text_only = re.sub(r"<style[\s\S]*?</style>", " ", text_only, flags=re.I)
        text_only = re.sub(r"<[^>]+>", " ", text_only)
        text_only = re.sub(r"\s+", " ", text_only).strip()
        rh = hashlib.sha256(html.encode()).hexdigest()[:16]
        print("\n--- HTML textual (first 1200 chars) ---")
        print(text_only[:1200])
        print(f"\nrender_hash: {rh}")
        print(f"html_path: {html_path}")
        # Link scan
        links = re.findall(r'href=["\'](https?://[^"\']+)["\']', html)
        print(f"external_links: {len(links)}")
        for u in links[:12]:
            print(f"  {u}")
        if "/app/contratos/" in html:
            print("WARNING: contract URL present in HTML")
        if re.search(r"R\$\s*0,00", html):
            print("WARNING: R$ 0,00 present")
    else:
        print("HTML not found, run npm run pseo:build")

    # Editorial checklist required for approval
    checklist = [
        "sample_independence_verified",
        "no_internal_slugs",
        "sources_checked",
        "claims_have_direct_evidence",
        "no_duplicates_in_tables",
        "meta_description_complete",
        "cannibalization_checked",
        "cta_contextual",
    ]
    print("\n--- checklist before APPROVED ---")
    existing = page.get("review_checklist") or {}
    for item in checklist:
        mark = "x" if existing.get(item) else " "
        print(f"  [{mark}] {item}")
    missing = [c for c in checklist if not existing.get(c)]
    if missing:
        print(f"\nBLOCKED for APPROVED until checklist complete: {missing}")
        print("Set with: review.py set PAGE_ID APPROVED --reviewer X --notes '...' --checklist key1,key2,...")
    else:
        print("\nChecklist complete, APPROVED may be set with rationale.")
    print("=" * 72)
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
    p_set.add_argument("--checklist", default="", help="comma-separated completed checklist keys")
    p_set.add_argument("--rationale", default="", help="approval rationale")
    p_set.add_argument("--claims", default="", help="pipe-separated claims checked")
    p_set.add_argument("--sources-checked", default="", dest="sources_checked")
    p_set.add_argument("--cannibalization", type=int, default=None, help="1 if cannibalization checked")
    p_set.add_argument(
        "--confirm",
        action="store_true",
        help="Required for APPROVED, individual confirmation of this page only",
    )
    p_set.add_argument(
        "--material-hash",
        default="",
        dest="material_hash",
        help="Optional pin: must match page_material_hash when set",
    )
    p_set.set_defaults(func=cmd_set)

    p_audit = sub.add_parser("audit")
    p_audit.add_argument("page_id")
    p_audit.set_defaults(func=cmd_audit)

    p_rep = sub.add_parser("report")
    p_rep.set_defaults(func=cmd_report)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
