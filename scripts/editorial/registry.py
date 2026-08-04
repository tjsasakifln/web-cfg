"""Editorial page registry and approval state machine.

States (forward only with hash checks):
  DRAFT → LEGAL_SOURCE_VALIDATED → TECHNICAL_REVIEWED → EDITORIAL_REVIEWED
       → HUMAN_APPROVED → INDEXABLE → PUBLISHED
  Any material hash change after HUMAN_APPROVED → REVIEW_REQUIRED
  Weak content → REJECTED

HUMAN_APPROVED requires a real named human reviewer and prior EDITORIAL_REVIEWED.
Automated operators (e.g. editorial-wave1-operator, CI bots) cannot stamp HUMAN_APPROVED.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"

STATES = (
    "DRAFT",
    "LEGAL_SOURCE_VALIDATED",
    "TECHNICAL_REVIEWED",
    "EDITORIAL_REVIEWED",
    "HUMAN_APPROVED",
    "INDEXABLE",
    "PUBLISHED",
    "REVIEW_REQUIRED",
    "REJECTED",
)

INDEXABLE_STATES = frozenset({"INDEXABLE", "PUBLISHED"})

# Approval records are decision evidence, not a pin to an arbitrary repository HEAD.
# Bump only when the approval-record contract changes.
APPROVAL_SCHEMA_VERSION = "2.0.0"

PROGRESSION = [
    "DRAFT",
    "LEGAL_SOURCE_VALIDATED",
    "TECHNICAL_REVIEWED",
    "EDITORIAL_REVIEWED",
    "HUMAN_APPROVED",
    "INDEXABLE",
    "PUBLISHED",
]

# Reviewer strings that are automated / non-human — cannot HUMAN_APPROVE
# Keep in sync with scripts.editorial.governance.BLOCKED_REVIEWER_PATTERNS
BLOCKED_REVIEWER_PATTERNS = (
    r"^editorial-wave1-operator$",
    r"^ci[-_]",
    r"^bot[-_]",
    r"^auto[-_]",
    r"operator$",
    r"^test-",
    r"^tester$",
    r"^system$",
    r"^pipeline$",
    r"^github-actions$",
    r"^dependabot$",
    r"^grok$",
    r"^agent$",
    r"^llm$",
    r"^automation$",
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_blocked_reviewer(reviewer: str) -> bool:
    try:
        from scripts.editorial.governance import is_blocked_reviewer as _gov

        return _gov(reviewer)
    except Exception:  # noqa: BLE001
        r = (reviewer or "").strip().lower()
        if not r or len(r) < 3:
            return True
        return any(re.search(p, r, re.I) for p in BLOCKED_REVIEWER_PATTERNS)


def material_hash(payload: dict[str, Any]) -> str:
    """Hash of public-facing material fields only."""
    keys = (
        "url",
        "title",
        "meta_description",
        "direct_answer",
        "body_markdown",
        "sources",
        "cta_whatsapp",
        "cta_email_subject",
        "cta_email_body",
        "legal_devices",
        "archetype",
    )
    subset = {k: payload.get(k) for k in keys}
    raw = json.dumps(subset, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def load_registry(path: Path | None = None) -> dict[str, Any]:
    p = path or REGISTRY_PATH
    if not p.exists():
        return {
            "schema_version": "1.0.0",
            "generated_at": _now(),
            "pages": [],
            "counts": {},
        }
    return json.loads(p.read_text(encoding="utf-8"))


def save_registry(data: dict[str, Any], path: Path | None = None) -> None:
    p = path or REGISTRY_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    pages = data.get("pages") or []
    counts: dict[str, int] = {}
    for pg in pages:
        st = pg.get("status") or "DRAFT"
        counts[st] = counts.get(st, 0) + 1
    data["counts"] = counts
    data["generated_at"] = _now()
    data["indexable_urls"] = [pg["url"] for pg in indexable_pages(data) if pg.get("url")]
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_page(reg: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    for pg in reg.get("pages") or []:
        if pg.get("page_id") == page_id:
            return pg
    return None


def upsert_page(reg: dict[str, Any], page: dict[str, Any]) -> dict[str, Any]:
    """Upsert a page and invalidate an approval only for a material change."""
    pages = reg.setdefault("pages", [])
    pid = page["page_id"]
    for i, existing in enumerate(pages):
        if existing.get("page_id") != pid:
            continue
        # Never trust a caller-supplied stored hash: it can describe older text.
        old_hash = material_hash(existing)
        new_hash = material_hash(page)
        page["material_hash"] = new_hash
        was_approved = existing.get("status") in INDEXABLE_STATES | {"HUMAN_APPROVED"}
        invalidated = bool(old_hash and new_hash != old_hash and was_approved)

        merged = {**existing, **page}
        if "history" not in page and existing.get("history"):
            merged["history"] = list(existing["history"])

        if invalidated:
            # Do not leave the previous approval object attached to new material.
            # Its material_hash is evidence for the old page, never authorization
            # for the replacement.
            merged["status"] = "REVIEW_REQUIRED"
            merged.pop("approval", None)
            merged.setdefault("history", []).append(
                {
                    "at": _now(),
                    "event": "material_hash_invalidated_approval",
                    "from": existing.get("status"),
                    "to": "REVIEW_REQUIRED",
                    "previous_material_hash": old_hash,
                    "material_hash": new_hash,
                }
            )
        pages[i] = merged
        return merged

    page.setdefault("status", "DRAFT")
    page.setdefault("history", [])
    page["material_hash"] = material_hash(page)
    pages.append(page)
    return page


def approval_is_current(page: dict[str, Any]) -> bool:
    """Return true only for a named-human approval of this exact material."""
    approval = page.get("approval") or {}
    reviewer = str(approval.get("reviewer") or "")
    canonical_hash = material_hash(page)
    return bool(
        approval.get("schema_version") == APPROVAL_SCHEMA_VERSION
        and approval.get("page_id") == page.get("page_id")
        and approval.get("state") == "HUMAN_APPROVED"
        and page.get("material_hash") == canonical_hash
        and approval.get("material_hash") == canonical_hash
        and approval.get("at")
        and reviewer
        and not is_blocked_reviewer(reviewer)
    )


def can_advance(current: str, target: str) -> bool:
    if target in {"REJECTED", "REVIEW_REQUIRED"}:
        return True
    if current == "REJECTED":
        return False
    if current == "REVIEW_REQUIRED":
        # re-enter at LEGAL after review
        return target in {"DRAFT", "LEGAL_SOURCE_VALIDATED", "REJECTED"}
    try:
        if current not in PROGRESSION or target not in PROGRESSION:
            return current == target
        return PROGRESSION.index(target) == PROGRESSION.index(current) + 1
    except ValueError:
        return False


def advance(
    reg: dict[str, Any],
    page_id: str,
    target: str,
    *,
    actor: str,
    notes: str = "",
) -> dict[str, Any]:
    """Advance exactly one step in the progression (or REJECTED / REVIEW_REQUIRED)."""
    pg = get_page(reg, page_id)
    if not pg:
        raise KeyError(page_id)
    current = pg.get("status") or "DRAFT"
    if not can_advance(current, target):
        raise ValueError(f"cannot_advance:{current}->{target}")
    if target == "HUMAN_APPROVED":
        raise ValueError("use_approve_human_for_HUMAN_APPROVED")
    if target == "INDEXABLE":
        raise ValueError("use_mark_indexable_for_INDEXABLE")
    pg["status"] = target
    pg.setdefault("history", []).append(
        {"at": _now(), "event": target, "actor": actor, "notes": notes, "from": current}
    )
    return pg


def approve_human(
    reg: dict[str, Any],
    page_id: str,
    *,
    reviewer: str,
    notes: str,
    sources_verified: list[str],
    caveats: str = "",
) -> dict[str, Any]:
    """Record real human approval. Only from EDITORIAL_REVIEWED. Named human only."""
    pg = get_page(reg, page_id)
    if not pg:
        raise KeyError(page_id)
    if pg.get("status") == "REJECTED":
        raise ValueError("cannot_approve_rejected")
    if pg.get("status") != "EDITORIAL_REVIEWED":
        raise ValueError(
            f"requires_EDITORIAL_REVIEWED_got_{pg.get('status')}"
        )
    if is_blocked_reviewer(reviewer):
        raise ValueError(f"reviewer_not_human:{reviewer}")
    if not notes or len(notes.strip()) < 20:
        raise ValueError("approval_notes_too_short")
    if not sources_verified:
        raise ValueError("sources_verified_required")
    # Approval must record the canonical content hash calculated at decision time.
    pg["material_hash"] = material_hash(pg)
    pg["status"] = "HUMAN_APPROVED"
    approved_at = _now()
    pg["approval"] = {
        "schema_version": APPROVAL_SCHEMA_VERSION,
        "page_id": page_id,
        "state": "HUMAN_APPROVED",
        "reviewer": reviewer.strip(),
        "at": approved_at,
        "notes": notes.strip(),
        "sources_verified": list(sources_verified),
        "caveats": caveats,
        "material_hash": pg.get("material_hash"),
    }
    pg.setdefault("history", []).append(
        {"at": _now(), "event": "HUMAN_APPROVED", "reviewer": reviewer.strip()}
    )
    return pg


def mark_indexable(reg: dict[str, Any], page_id: str) -> dict[str, Any]:
    pg = get_page(reg, page_id)
    if not pg:
        raise KeyError(page_id)
    if pg.get("status") not in {"HUMAN_APPROVED", "INDEXABLE"}:
        raise ValueError("requires_HUMAN_APPROVED")
    if not approval_is_current(pg):
        pg["status"] = "REVIEW_REQUIRED"
        pg.pop("approval", None)
        raise ValueError("approval_hash_or_identity_mismatch")
    pg["status"] = "INDEXABLE"
    pg.setdefault("history", []).append({"at": _now(), "event": "INDEXABLE"})
    return pg


def revoke_auto_approvals(reg: dict[str, Any]) -> int:
    """Remove invalid human approvals and fail closed on stale material."""
    n = 0
    for pg in reg.get("pages") or []:
        status = pg.get("status")
        if status not in INDEXABLE_STATES | {"HUMAN_APPROVED"}:
            continue
        approval = pg.get("approval") or {}
        reviewer = str(approval.get("reviewer") or "")
        canonical_hash = material_hash(pg)
        if approval_is_current(pg):
            continue
        material_changed = (
            pg.get("material_hash") != canonical_hash
            or approval.get("material_hash") != canonical_hash
        )
        pg["status"] = "REVIEW_REQUIRED" if material_changed else "EDITORIAL_REVIEWED"
        pg.pop("approval", None)
        pg.setdefault("history", []).append(
            {
                "at": _now(),
                "event": "revoked_invalid_approval",
                "from": status,
                "to": pg["status"],
                "reviewer_was": reviewer,
            }
        )
        n += 1
    return n



def indexable_pages(
    reg: dict[str, Any],
    *,
    allowed_page_ids: set[str] | frozenset[str] | None = None,
) -> list[dict[str, Any]]:
    """Pages eligible for sitemap/indexing, optionally limited to a release cohort."""
    out = []
    for p in reg.get("pages") or []:
        if p.get("status") not in INDEXABLE_STATES:
            continue
        if allowed_page_ids is not None and p.get("page_id") not in allowed_page_ids:
            continue
        if not approval_is_current(p):
            continue
        out.append(p)
    return out
