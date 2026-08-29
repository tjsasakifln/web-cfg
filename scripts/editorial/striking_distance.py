"""Approval-bound noindex gate for three striking-distance library URLs (#127).

Dimensional GSC demand never flips robots. A hash-bound approval is required.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DECISIONS_PATH = ROOT / "data" / "editorial" / "striking-distance-noindex.v1.json"
ALLOWED = frozenset({"REWRITE_THEN_INDEX", "KEEP_NOINDEX", "CONSOLIDATE"})
CANARY_CAP = 1
APPROVAL_TYPES = frozenset({"NAMED_HUMAN_APPROVAL", "OWNER_DELEGATED_APPROVAL"})
REQUIRED_OWNER_DELEGATED_REVIEWS = frozenset(
    {
        "factual_legal_adversarial",
        "originality_anti_doorway",
        "query_ownership_cannibalization",
        "skeptical_visitor_copy_ux",
        "responsive_js_off_keyboard_accessibility",
    }
)


def load_decisions(path: Path | None = None) -> dict[str, Any]:
    data = json.loads((path or DECISIONS_PATH).read_text(encoding="utf-8"))
    if data.get("canary_cap") != CANARY_CAP:
        raise ValueError("canary_cap must be 1")
    return data


def html_robots(html: str) -> str:
    m = re.search(
        r'<meta[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']',
        html,
        re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").lower()


def is_noindex(html: str) -> bool:
    return "noindex" in html_robots(html)


def material_hash_for_html(html: str) -> str:
    """Bind approval to visitor material while allowing the authorized robots flip.

    Robots is a release state, not editorial material.  Normalizing only that
    meta value lets review happen while the page is still fail-closed and keeps
    the approval valid when the same reviewed page changes to ``index,follow``.
    """

    patterns = (
        re.compile(
            r'(<meta[^>]*name=["\']robots["\'][^>]*content=["\'])[^"\']+(["\'][^>]*>)',
            re.I,
        ),
        re.compile(
            r'(<meta[^>]*content=["\'])[^"\']+(["\'][^>]*name=["\']robots["\'][^>]*>)',
            re.I,
        ),
    )
    normalized = html
    for pattern in patterns:
        normalized, count = pattern.subn(r"\1__ROBOTS_RELEASE_STATE__\2", normalized, count=1)
        if count:
            break
    return "sha256:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def page_material_hash(row: dict[str, Any], root: Path | None = None) -> str:
    base = root or ROOT
    rel = str(row.get("html") or "")
    page = base / rel
    if not rel or not page.is_file():
        return ""
    return material_hash_for_html(page.read_text(encoding="utf-8"))


def approval_payload_hash(approval: dict[str, Any]) -> str:
    payload = {key: value for key, value in approval.items() if key != "approval_hash"}
    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def approval_errors(row: dict[str, Any], root: Path | None = None) -> list[str]:
    """Validate named-human or explicit owner-delegated approval provenance."""

    approval = row.get("approval")
    if not isinstance(approval, dict):
        return ["missing_approval_record"]

    errors: list[str] = []
    approval_type = approval.get("approval_type")
    if approval_type not in APPROVAL_TYPES:
        errors.append("invalid_approval_type")
    if approval.get("status") != "INDEXABLE":
        errors.append("approval_status_not_indexable")
    if not str(approval.get("decision_authority") or "").strip():
        errors.append("missing_decision_authority")
    if not str(approval.get("reviewer_executor") or "").strip():
        errors.append("missing_reviewer_executor")
    if not str(approval.get("approval_basis") or "").strip():
        errors.append("missing_approval_basis")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(approval.get("approved_at") or "")):
        errors.append("invalid_approved_at")

    expected_material = page_material_hash(row, root)
    if not expected_material or approval.get("material_hash") != expected_material:
        errors.append("approval_material_hash_mismatch")
    if approval.get("approval_hash") != approval_payload_hash(approval):
        errors.append("approval_record_hash_mismatch")

    if approval_type == "OWNER_DELEGATED_APPROVAL":
        if approval.get("decision_authority") != "owner / Tiago Sasaki":
            errors.append("owner_delegated_decision_authority_mismatch")
        if approval.get("approval_basis") != "owner-delegated review 2026-08-29":
            errors.append("owner_delegated_basis_mismatch")
        if approval.get("manual_human_review") is not False:
            errors.append("owner_delegated_must_not_claim_manual_human_review")
        reviews = approval.get("review_results")
        passed = {
            key
            for key, value in (reviews.items() if isinstance(reviews, dict) else ())
            if value is True
        }
        missing = sorted(REQUIRED_OWNER_DELEGATED_REVIEWS - passed)
        if missing:
            errors.append(f"owner_delegated_review_incomplete:{missing}")
    elif approval_type == "NAMED_HUMAN_APPROVAL":
        if approval.get("manual_human_review") is not True:
            errors.append("named_human_approval_requires_manual_review")

    return errors


def may_flip_index(row: dict[str, Any], root: Path | None = None) -> bool:
    """Only the rewritten canary with a valid hash-bound approval may be indexed."""
    if row.get("decision") != "REWRITE_THEN_INDEX":
        return False
    if row.get("canary") is not True:
        return False
    if row.get("rewrite_complete") is not True:
        return False
    if row.get("approve_cli_indexable") is not True:
        return False
    return not approval_errors(row, root)


def evaluate_striking_distance(
    *, root: Path | None = None, data: dict[str, Any] | None = None
) -> dict[str, Any]:
    root = root or ROOT
    data = data or load_decisions()
    fails: list[str] = []
    rows = list(data.get("urls") or [])
    if len(rows) != 3:
        fails.append("expected_three_urls")
    canaries = [r for r in rows if r.get("canary") is True]
    if len(canaries) > CANARY_CAP:
        fails.append("canary_cap_exceeded")
    indexed_live = []
    for row in rows:
        decision = row.get("decision")
        if decision not in ALLOWED:
            fails.append(f"invalid_decision:{row.get('path')}")
        if not row.get("owner"):
            fails.append(f"missing_owner:{row.get('path')}")
        rel = row.get("html") or ""
        page = root / rel
        if not page.is_file():
            fails.append(f"missing_html:{rel}")
            continue
        html = page.read_text(encoding="utf-8")
        live_noindex = is_noindex(html)
        if not live_noindex:
            indexed_live.append(row.get("path"))
            if not may_flip_index(row, root):
                fails.append(f"unauthorized_index:{row.get('path')}")
        if row.get("decision") == "KEEP_NOINDEX" and not live_noindex:
            fails.append(f"keep_noindex_but_indexable:{row.get('path')}")
        if row.get("decision") == "REWRITE_THEN_INDEX" and not may_flip_index(row, root):
            if not live_noindex:
                fails.append(f"canary_indexed_before_approve:{row.get('path')}")
    if len(indexed_live) > CANARY_CAP:
        fails.append("more_than_one_indexed")
    return {
        "schema_version": "striking-distance-gate-v1",
        "ok": not fails,
        "fails": fails,
        "canary_count": len(canaries),
        "indexed_live": indexed_live,
        "decisions": {r.get("path"): r.get("decision") for r in rows},
    }
