"""Preview-review identity for the PR #54 editorial cohort.

The committed review packet explains the protocol.  The deploy-preview packet
is the evidence surface: it binds page material hashes to the exact Netlify
build that a named human can review.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.cohort import FIRST_COHORT_IDS
from scripts.editorial.registry import (
    REVIEW_PREVIEW_BASE_URL,
    approval_is_current,
    get_page,
    load_registry,
    material_hash,
    resolve_page_sources,
    save_registry,
)
from scripts.editorial.sources import load_manifest

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def deploy_commit() -> str:
    """Use deploy identity first; local git is only a development fallback."""
    for key in ("COMMIT_REF", "CACHED_COMMIT_REF", "GITHUB_SHA", "CF_PAGES_COMMIT_SHA"):
        value = (os.environ.get(key) or "").strip().lower()
        if re.fullmatch(r"[0-9a-f]{40}", value):
            return value
    try:
        value = subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip().lower()
        return value if re.fullmatch(r"[0-9a-f]{40}", value) else "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def preview_url(page_url: str, base_url: str = REVIEW_PREVIEW_BASE_URL) -> str:
    return f"{base_url.rstrip('/')}{page_url}"


def build_preview_packet(registry: dict[str, Any]) -> dict[str, Any]:
    """Create the public, deploy-bound review evidence packet."""
    manifest = load_manifest()
    by_id = {page.get("page_id"): page for page in registry.get("pages") or []}
    target_sha = deploy_commit()
    generated_at = _now()
    pages: list[dict[str, Any]] = []
    for page_id in FIRST_COHORT_IDS:
        page = by_id.get(page_id)
        if not page:
            continue
        current_hash = material_hash(page, manifest)
        pages.append(
            {
                "page_id": page_id,
                "preview_url": preview_url(str(page.get("url") or "")),
                "material_hash": current_hash,
                "sources": resolve_page_sources(page, manifest),
            }
        )
    return {
        "schema_version": "1.0.0",
        "review_target_sha": target_sha,
        "preview_base_url": REVIEW_PREVIEW_BASE_URL,
        "preview_build_sha": target_sha,
        "preview_generated_at": generated_at,
        "pages": pages,
        "commit_sha_role": "preview_identity_not_human_approval",
        "note": (
            "This deploy-preview packet is evidence for individual human review. "
            "It does not approve or index any page."
        ),
    }


def write_preview_packet(registry: dict[str, Any]) -> Path:
    """Write the public runtime packet copied into Netlify's _site artifact."""
    target = ROOT / ".well-known" / "editorial-review-packet.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(build_preview_packet(registry), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return target


def _fetch(url: str, *, timeout: int = 20) -> tuple[int, str]:
    request = Request(url, headers={"Accept": "application/json,text/html", "Cache-Control": "no-cache"})
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed human review URL
            return int(response.status), response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        return int(exc.code), exc.read().decode("utf-8", errors="replace")
    except URLError as exc:
        raise ValueError(f"preview_unreachable:{url}:{exc.reason}") from exc


def _fetch_json(url: str) -> tuple[int, dict[str, Any]]:
    status, raw = _fetch(url)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"preview_invalid_json:{url}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"preview_json_not_object:{url}")
    return status, payload


def verify_preview_cohort(
    registry: dict[str, Any], *, base_url: str = REVIEW_PREVIEW_BASE_URL, expected_head: str
) -> dict[str, dict[str, Any]]:
    """Fetch and prove that all three review pages match the current PR head.

    It verifies build-info, the runtime packet and the material-hash meta tag
    in rendered HTML.  The return value is suitable for one approval record.
    """
    base = base_url.rstrip("/")
    if base != REVIEW_PREVIEW_BASE_URL:
        raise ValueError("preview_base_url_not_pr54_deploy_preview")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", (expected_head or "")):
        raise ValueError("preview_expected_head_invalid")
    build_status, build_info = _fetch_json(f"{base}/.well-known/build-info.json")
    if build_status != 200:
        raise ValueError(f"preview_build_info_http_{build_status}")
    build_sha = str(build_info.get("commit") or "")
    if build_sha != expected_head:
        raise ValueError(f"preview_build_sha_mismatch:{build_sha}!={expected_head}")
    packet_status, packet = _fetch_json(f"{base}/.well-known/editorial-review-packet.json")
    if packet_status != 200:
        raise ValueError(f"preview_packet_http_{packet_status}")
    if packet.get("preview_base_url") != base:
        raise ValueError("preview_packet_base_mismatch")
    if packet.get("review_target_sha") != expected_head or packet.get("preview_build_sha") != build_sha:
        raise ValueError("preview_packet_sha_mismatch")
    remote_pages = {row.get("page_id"): row for row in packet.get("pages") or [] if isinstance(row, dict)}
    local_pages = {page.get("page_id"): page for page in registry.get("pages") or []}
    evidence: dict[str, dict[str, Any]] = {}
    checked_at = _now()
    for page_id in FIRST_COHORT_IDS:
        page = local_pages.get(page_id)
        remote = remote_pages.get(page_id)
        if not page or not remote:
            raise ValueError(f"preview_packet_missing_page:{page_id}")
        current_hash = material_hash(page, load_manifest())
        if remote.get("material_hash") != current_hash:
            raise ValueError(f"preview_packet_material_hash_mismatch:{page_id}")
        url = preview_url(str(page.get("url") or ""), base)
        if remote.get("preview_url") != url:
            raise ValueError(f"preview_page_url_mismatch:{page_id}")
        page_status, html = _fetch(url)
        if page_status != 200:
            raise ValueError(f"preview_page_http_{page_id}:{page_status}")
        meta = re.search(
            r'<meta\s+content=["\']([^"\']+)["\']\s+name=["\']editorial-material-hash["\']',
            html,
            re.I,
        ) or re.search(
            r'<meta\s+name=["\']editorial-material-hash["\']\s+content=["\']([^"\']+)["\']',
            html,
            re.I,
        )
        if not meta or meta.group(1) != current_hash:
            raise ValueError(f"preview_html_material_hash_mismatch:{page_id}")
        evidence[page_id] = {
            "page_id": page_id,
            "review_target_sha": expected_head,
            "preview_base_url": base,
            "preview_build_sha": build_sha,
            "preview_generated_at": checked_at,
            "reviewed_url": url,
            "material_hash": current_hash,
            "page_http_status": page_status,
            "build_info_url": f"{base}/.well-known/build-info.json",
            "review_packet_url": f"{base}/.well-known/editorial-review-packet.json",
        }
    return evidence


def reconfirm_approval_preview(
    registry: dict[str, Any], *, page_id: str, expected_head: str, base_url: str = REVIEW_PREVIEW_BASE_URL
) -> dict[str, Any]:
    """Refresh only preview evidence for already approved, unchanged material.

    This cannot create, revive or alter an approval decision.  It is the
    explicit path for a later non-material commit whose new deploy preview
    still renders exactly the material the human already approved.
    """
    manifest = load_manifest()
    page = get_page(registry, page_id)
    if not page or not approval_is_current(page, manifest):
        raise ValueError("approval_not_current_for_preview_reconfirmation")
    evidence = verify_preview_cohort(
        registry, base_url=base_url, expected_head=expected_head
    ).get(page_id)
    if not evidence:
        raise ValueError("preview_packet_missing_requested_page")
    approval = page.get("approval") or {}
    approval["preview"] = evidence
    page["approval"] = approval
    page.setdefault("history", []).append(
        {
            "at": _now(),
            "event": "preview_reconfirmed_nonmaterial_commit",
            "preview_build_sha": evidence["preview_build_sha"],
            "material_hash": evidence["material_hash"],
        }
    )
    return evidence


def main(argv: list[str] | None = None) -> int:
    """Read-only preview verification for a changed non-material commit."""
    import argparse

    parser = argparse.ArgumentParser(description="Verify PR #54 deploy-preview identity")
    parser.add_argument("--verify", action="store_true", help="Verify build-info, packet and all cohort pages")
    parser.add_argument(
        "--reconfirm-approval",
        action="store_true",
        help="Refresh preview evidence only for one existing current approval",
    )
    parser.add_argument("--page-id", default="", help="Required with --reconfirm-approval")
    parser.add_argument("--expected-head", default="", help="Exact PR head; defaults to local checked-out HEAD")
    parser.add_argument("--preview-base-url", default=REVIEW_PREVIEW_BASE_URL)
    args = parser.parse_args(argv)
    if not args.verify and not args.reconfirm_approval:
        parser.error("pass --verify or --reconfirm-approval; this command never approves a page")
    if args.verify and args.reconfirm_approval:
        parser.error("choose only one action")
    expected = (args.expected_head or deploy_commit()).strip().lower()
    try:
        registry = load_registry()
        if args.reconfirm_approval:
            if not args.page_id:
                parser.error("--page-id is required with --reconfirm-approval")
            evidence = reconfirm_approval_preview(
                registry,
                page_id=args.page_id,
                base_url=args.preview_base_url,
                expected_head=expected,
            )
            save_registry(registry, source_manifest=load_manifest())
        else:
            evidence = verify_preview_cohort(
                registry, base_url=args.preview_base_url, expected_head=expected
            )
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
