"""CLI: python3 -m scripts.market_panorama build|validate"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from scripts.market_panorama import FAMILY_PATH, FAMILY_SLUG, STATE_INDEX
from scripts.market_panorama.consume import ConsumeError, load_approvals, load_cohort
from scripts.market_panorama.gate import evaluate
from scripts.market_panorama.render import (
    HEADERS_FAMILY_BEGIN,
    ROBOTS_FAMILY_BEGIN,
    SITEMAP_NAME,
    sync_family_crawler_rules,
    write_pages,
    write_sitemap,
    write_status,
)


def _cohort(args: argparse.Namespace) -> dict:
    return load_cohort(
        rendezvous=Path(args.rendezvous) if args.rendezvous else None,
        fixture=Path(args.fixture) if args.fixture else None,
    )


def cmd_build(args: argparse.Namespace) -> int:
    bundle = _cohort(args)
    approvals = load_approvals()
    pairs = [
        (payload, evaluate(payload, source_kind=bundle["source_kind"], approvals=approvals))
        for payload in bundle["records"]
    ]
    written: dict = {}
    if not args.report_only:
        written = write_pages(pairs)
        # A fixture run must never rewrite the production crawler rules: it has
        # no approved slugs, so syncing would strip the real Allow overrides.
        if not bundle.get("test_only"):
            sync_family_crawler_rules(pairs)
            sitemap = write_sitemap(pairs)
            if sitemap is not None:
                written["sitemap"] = str(sitemap)
    status = {
        "evaluated": len(pairs),
        "source_kind": bundle["source_kind"],
        "test_only": bundle.get("test_only", False),
        "reason_codes": bundle["reason_codes"],
        "handoff": bundle.get("handoff", {}),
        "index_count": sum(1 for _p, d in pairs if d.indexable),
        "states": sorted({d.state for _p, d in pairs}),
        "decisions": [
            {
                "panorama_id": d.panorama_id,
                "slug": d.slug,
                "state": d.state,
                "indexable": d.indexable,
                "reason_codes": list(d.reason_codes),
                "content_hash": d.content_hash,
            }
            for _p, d in pairs
        ],
        "written": written,
    }
    path = write_status(status)
    print(json.dumps({**status, "status_report": str(path)}, ensure_ascii=False, indent=2))
    return 0


ROBOTS_META = re.compile(r'content="([^"]*)"\s+name="robots"', re.IGNORECASE)


def audit_shipped(root: Path, approvals: dict) -> list[str]:
    """Check what is actually on disk, not what the gate would have decided.

    Re-deriving the decision from the payload proves only that the gate agrees
    with itself. These are the artifacts Netlify serves.
    """
    problems: list[str] = []
    family = root / FAMILY_SLUG
    robots = (root / "robots.txt").read_text(encoding="utf-8") if (root / "robots.txt").is_file() else ""
    headers = (root / "_headers").read_text(encoding="utf-8") if (root / "_headers").is_file() else ""

    for marker, name in ((ROBOTS_FAMILY_BEGIN, "robots.txt"), (HEADERS_FAMILY_BEGIN, "_headers")):
        text = robots if name == "robots.txt" else headers
        count = text.count(marker)
        if count > 1:
            problems.append(f"{name}: generated block appears {count} times")

    if not family.is_dir():
        return problems

    indexable_slugs: list[str] = []
    hub_indexes = False
    for page in sorted(family.rglob("index.html")):
        html = page.read_text(encoding="utf-8", errors="replace")
        match = ROBOTS_META.search(html)
        robots_value = (match.group(1) if match else "").lower()
        claims_index = "noindex" not in robots_value
        slug = page.parent.name
        is_hub = page.parent == family
        if is_hub:
            hub_indexes = claims_index
            continue
        if not claims_index:
            continue
        indexable_slugs.append(slug)
        entry = approvals.get(_slug_approval_id(html))
        if not isinstance(entry, dict) or entry.get("approved") is not True:
            problems.append(f"{slug}: page claims index with no approved ledger entry")
        if f"Allow: {FAMILY_PATH}{slug}/" not in robots:
            problems.append(f"{slug}: page claims index but robots.txt does not allow it")
        if f"{FAMILY_PATH}{slug}/*" not in headers:
            problems.append(f"{slug}: page claims index but _headers has no index override")
        if "test_only_fixture" in html:
            problems.append(f"{slug}: fixture page claims index")

    if hub_indexes and not indexable_slugs:
        problems.append("hub claims index while every child is a draft")
    if indexable_slugs and f"Allow: {FAMILY_PATH}$" not in robots:
        problems.append("an approved page exists but the hub is not crawlable, so nothing links to it")
    sitemap = root / SITEMAP_NAME
    if indexable_slugs and not sitemap.is_file():
        problems.append("an approved page exists with no sitemap entry")
    if not indexable_slugs and sitemap.is_file():
        problems.append("sitemap exists while nothing is approved")
    return problems


def _slug_approval_id(html: str) -> str:
    match = re.search(r'data-panorama-id="([^"]+)"', html)
    return match.group(1) if match else ""


def cmd_validate(args: argparse.Namespace) -> int:
    bundle = _cohort(args)
    approvals = load_approvals()
    pairs = [
        (payload, evaluate(payload, source_kind=bundle["source_kind"], approvals=approvals))
        for payload in bundle["records"]
    ]
    fixture_indexed = [d.panorama_id for _p, d in pairs if d.is_fixture and d.state == STATE_INDEX]
    unapproved_index = [
        d.panorama_id
        for _p, d in pairs
        if d.indexable and approvals.get(d.panorama_id, {}).get("approved") is not True
    ]
    root = Path(args.root) if args.root else Path(__file__).resolve().parents[2]
    shipped = audit_shipped(root, approvals)
    ok = not fixture_indexed and not unapproved_index and not shipped
    print(
        json.dumps(
            {
                "ok": ok,
                "evaluated": len(pairs),
                "source_kind": bundle["source_kind"],
                "reason_codes": bundle["reason_codes"],
                "fixture_indexed": fixture_indexed,
                "unapproved_index": unapproved_index,
                "shipped_problems": shipped,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.market_panorama")
    sub = parser.add_subparsers(dest="cmd", required=True)

    build = sub.add_parser("build", help="Consume the rendezvous and render the family")
    build.add_argument("--rendezvous", help="Override the handoff rendezvous directory")
    build.add_argument("--fixture", help="Path to a labeled test-only payload")
    build.add_argument("--report-only", action="store_true")
    build.set_defaults(func=cmd_build)

    validate = sub.add_parser("validate", help="Fail closed if a fixture or an unapproved page would INDEX")
    validate.add_argument("--rendezvous")
    validate.add_argument("--fixture")
    validate.add_argument("--root", help="Repository root to audit. Defaults to this checkout.")
    validate.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ConsumeError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
