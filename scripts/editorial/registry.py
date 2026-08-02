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
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_blocked_reviewer(reviewer: str) -> bool:
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
        "claims",
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
    data["indexable_urls"] = [
        pg["url"] for pg in pages if pg.get("status") in INDEXABLE_STATES and pg.get("url")
    ]
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def get_page(reg: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    for pg in reg.get("pages") or []:
        if pg.get("page_id") == page_id:
            return pg
    return None


def upsert_page(reg: dict[str, Any], page: dict[str, Any]) -> dict[str, Any]:
    pages = reg.setdefault("pages", [])
    pid = page["page_id"]
    for i, existing in enumerate(pages):
        if existing.get("page_id") == pid:
            old_hash = existing.get("material_hash")
            new_hash = page.get("material_hash") or material_hash(page)
            page["material_hash"] = new_hash
            if (
                old_hash
                and new_hash != old_hash
                and existing.get("status") in INDEXABLE_STATES | {"HUMAN_APPROVED"}
            ):
                page["status"] = "REVIEW_REQUIRED"
                page.pop("approval", None)
                page.setdefault("history", []).append(
                    {
                        "at": _now(),
                        "event": "material_hash_invalidated_approval",
                        "from": existing.get("status"),
                        "to": "REVIEW_REQUIRED",
                    }
                )
            # Preserve history/approval unless explicitly overwritten
            merged = {**existing, **page}
            if "history" not in page and existing.get("history"):
                merged["history"] = existing["history"]
            pages[i] = merged
            return pages[i]
    page.setdefault("status", "DRAFT")
    page.setdefault("history", [])
    page["material_hash"] = page.get("material_hash") or material_hash(page)
    pages.append(page)
    return page


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
    pg["status"] = "HUMAN_APPROVED"
    pg["approval"] = {
        "reviewer": reviewer.strip(),
        "at": _now(),
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
    appr = pg.get("approval") or {}
    if not appr.get("reviewer") or is_blocked_reviewer(str(appr.get("reviewer"))):
        raise ValueError("indexable_requires_human_reviewer")
    if appr.get("material_hash") and appr.get("material_hash") != pg.get("material_hash"):
        pg["status"] = "REVIEW_REQUIRED"
        raise ValueError("approval_hash_mismatch")
    pg["status"] = "INDEXABLE"
    pg.setdefault("history", []).append({"at": _now(), "event": "INDEXABLE"})
    return pg


def revoke_auto_approvals(reg: dict[str, Any]) -> int:
    """Downgrade any INDEXABLE/HUMAN_APPROVED stamped by blocked reviewers to EDITORIAL_REVIEWED."""
    n = 0
    for pg in reg.get("pages") or []:
        appr = pg.get("approval") or {}
        reviewer = str(appr.get("reviewer") or "")
        st = pg.get("status")
        if st in INDEXABLE_STATES | {"HUMAN_APPROVED"} and (
            is_blocked_reviewer(reviewer) or not reviewer
        ):
            pg["status"] = "EDITORIAL_REVIEWED"
            pg.pop("approval", None)
            pg.setdefault("history", []).append(
                {
                    "at": _now(),
                    "event": "revoked_non_human_approval",
                    "from": st,
                    "to": "EDITORIAL_REVIEWED",
                    "reviewer_was": reviewer,
                }
            )
            n += 1
    return n


def indexable_pages(reg: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for p in reg.get("pages") or []:
        if p.get("status") not in INDEXABLE_STATES:
            continue
        appr = p.get("approval") or {}
        if is_blocked_reviewer(str(appr.get("reviewer") or "")):
            continue
        out.append(p)
    return out
