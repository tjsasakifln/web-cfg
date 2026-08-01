"""Canonical URL lifecycle states for pSEO pages.

Single source of truth for state machine. Registry pages may carry a
`lifecycle_state` field; transitions are append-only events.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

# Canonical ordered lifecycle states (objective §11)
LIFECYCLE_STATES = (
    "CANDIDATE",
    "QUALITY_ELIGIBLE",
    "EDITORIALLY_APPROVED",
    "PUBLISHED",
    "DISCOVERED",
    "CRAWLED",
    "INDEXED",
    "NOINDEX",
    "REDIRECTED",
    "GONE",
    "REJECTED",
)

# Valid transitions (fail-closed: unknown edges rejected)
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "CANDIDATE": frozenset({"QUALITY_ELIGIBLE", "REJECTED", "NOINDEX"}),
    "QUALITY_ELIGIBLE": frozenset({"EDITORIALLY_APPROVED", "REJECTED", "NOINDEX", "CANDIDATE"}),
    "EDITORIALLY_APPROVED": frozenset({"PUBLISHED", "REJECTED", "NOINDEX", "QUALITY_ELIGIBLE"}),
    "PUBLISHED": frozenset(
        {"DISCOVERED", "CRAWLED", "INDEXED", "NOINDEX", "REDIRECTED", "GONE", "REJECTED"}
    ),
    "DISCOVERED": frozenset({"CRAWLED", "INDEXED", "NOINDEX", "REDIRECTED", "GONE"}),
    "CRAWLED": frozenset({"INDEXED", "NOINDEX", "REDIRECTED", "GONE", "DISCOVERED"}),
    "INDEXED": frozenset({"NOINDEX", "REDIRECTED", "GONE", "CRAWLED"}),
    "NOINDEX": frozenset({"QUALITY_ELIGIBLE", "PUBLISHED", "GONE", "REDIRECTED", "REJECTED"}),
    "REDIRECTED": frozenset({"GONE", "PUBLISHED"}),
    "GONE": frozenset({"REDIRECTED"}),  # rare resurrection via redirect only
    "REJECTED": frozenset({"CANDIDATE", "NOINDEX"}),
}


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def derive_lifecycle_from_registry_page(page: dict[str, Any]) -> str:
    """Map legacy status/human_review/GSC fields to a canonical lifecycle state."""
    if page.get("lifecycle_state") in LIFECYCLE_STATES:
        return str(page["lifecycle_state"])
    status = (page.get("status") or page.get("publication_status") or "").lower()
    hr = (page.get("human_review") or "").upper()
    gsc = (page.get("indexation_status") or page.get("gsc_verdict") or "").upper()
    if status == "reject" or hr == "REJECTED":
        return "REJECTED"
    if status == "redirect" or page.get("redirect_to"):
        return "REDIRECTED"
    if status == "gone" or page.get("http_status") == 410:
        return "GONE"
    if gsc in {"INDEXED", "PASS", "SUBMITTED_AND_INDEXED"}:
        return "INDEXED"
    if gsc in {"CRAWLED", "CRAWLED_CURRENTLY_NOT_INDEXED"}:
        return "CRAWLED"
    if gsc in {"DISCOVERED", "DISCOVERED_CURRENTLY_NOT_INDEXED"}:
        return "DISCOVERED"
    if status == "noindex":
        return "NOINDEX"
    if status == "publish" and hr in {"APPROVED", "APPROVED_WITH_NOTES", "APPROVED_UNCHANGED"}:
        return "PUBLISHED"
    if status == "publish" and page.get("quality_eligible"):
        return "QUALITY_ELIGIBLE"
    if page.get("quality_eligible") or hr in {"APPROVED", "APPROVED_WITH_NOTES"}:
        if hr in {"APPROVED", "APPROVED_WITH_NOTES", "APPROVED_UNCHANGED"}:
            return "EDITORIALLY_APPROVED"
        return "QUALITY_ELIGIBLE"
    return "CANDIDATE"


def can_transition(from_state: str, to_state: str) -> bool:
    if from_state not in ALLOWED_TRANSITIONS or to_state not in LIFECYCLE_STATES:
        return False
    if from_state == to_state:
        return True
    return to_state in ALLOWED_TRANSITIONS[from_state]


def transition(
    page_id: str,
    from_state: str,
    to_state: str,
    *,
    reason: str,
    actor: str = "system",
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an audit event; raises ValueError if transition is illegal."""
    if not can_transition(from_state, to_state):
        raise ValueError(f"illegal lifecycle transition {from_state} -> {to_state} for {page_id}")
    return {
        "page_id": page_id,
        "from_state": from_state,
        "to_state": to_state,
        "reason": reason,
        "actor": actor,
        "evidence": evidence or {},
        "at": now_iso(),
    }


def retirement_action(*, has_semantic_substitute: bool) -> dict[str, Any]:
    """Decide 301 vs 410 when a previously indexed URL loses eligibility."""
    if has_semantic_substitute:
        return {
            "http_status": 301,
            "lifecycle_state": "REDIRECTED",
            "note": "Use 301 to semantic equivalent; remove from sitemap and internal links",
        }
    return {
        "http_status": 410,
        "lifecycle_state": "GONE",
        "note": "Use 410 Gone; remove from sitemap and internal links; track in GSC",
    }
