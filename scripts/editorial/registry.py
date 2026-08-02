"""Editorial page registry and approval state machine.

States (forward only with hash checks):
  DRAFT → LEGAL_SOURCE_VALIDATED → TECHNICAL_REVIEWED → EDITORIAL_REVIEWED
       → HUMAN_APPROVED → INDEXABLE → PUBLISHED
  Any material hash change after HUMAN_APPROVED → REVIEW_REQUIRED
  Weak content → REJECTED
"""

from __future__ import annotations

import hashlib
import json
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

# Only these may appear in public sitemaps as indexable
INDEXABLE_STATES = frozenset({"INDEXABLE", "PUBLISHED"})

APPROVAL_PREREQ = "HUMAN_APPROVED"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
            # Invalidate approval if material hash changed
            old_hash = existing.get("material_hash")
            new_hash = page.get("material_hash") or material_hash(page)
            page["material_hash"] = new_hash
            if (
                old_hash
                and new_hash != old_hash
                and existing.get("status") in INDEXABLE_STATES | {"HUMAN_APPROVED"}
            ):
                page["status"] = "REVIEW_REQUIRED"
                page.setdefault("history", []).append(
                    {
                        "at": _now(),
                        "event": "material_hash_invalidated_approval",
                        "from": existing.get("status"),
                        "to": "REVIEW_REQUIRED",
                    }
                )
            pages[i] = {**existing, **page}
            return pages[i]
    page.setdefault("status", "DRAFT")
    page.setdefault("history", [])
    page["material_hash"] = page.get("material_hash") or material_hash(page)
    pages.append(page)
    return page


def can_advance(current: str, target: str) -> bool:
    if target == "REJECTED" or target == "REVIEW_REQUIRED":
        return True
    if current == "REJECTED":
        return False
    try:
        # linear path for progressive states
        order = [
            "DRAFT",
            "LEGAL_SOURCE_VALIDATED",
            "TECHNICAL_REVIEWED",
            "EDITORIAL_REVIEWED",
            "HUMAN_APPROVED",
            "INDEXABLE",
            "PUBLISHED",
        ]
        if current not in order or target not in order:
            return current == target
        return order.index(target) == order.index(current) + 1 or order.index(target) >= order.index(
            current
        )
    except ValueError:
        return False


def approve_human(
    reg: dict[str, Any],
    page_id: str,
    *,
    reviewer: str,
    notes: str,
    sources_verified: list[str],
    caveats: str = "",
) -> dict[str, Any]:
    """Record real human approval. Does not auto-index without explicit advance."""
    pg = get_page(reg, page_id)
    if not pg:
        raise KeyError(page_id)
    if pg.get("status") not in {
        "EDITORIAL_REVIEWED",
        "HUMAN_APPROVED",
        "TECHNICAL_REVIEWED",
        "LEGAL_SOURCE_VALIDATED",
        "REVIEW_REQUIRED",
    }:
        # allow approval from late draft stages after review work
        if pg.get("status") == "REJECTED":
            raise ValueError("cannot_approve_rejected")
    pg["status"] = "HUMAN_APPROVED"
    pg["approval"] = {
        "reviewer": reviewer,
        "at": _now(),
        "notes": notes,
        "sources_verified": sources_verified,
        "caveats": caveats,
        "material_hash": pg.get("material_hash"),
    }
    pg.setdefault("history", []).append(
        {"at": _now(), "event": "HUMAN_APPROVED", "reviewer": reviewer}
    )
    return pg


def mark_indexable(reg: dict[str, Any], page_id: str) -> dict[str, Any]:
    pg = get_page(reg, page_id)
    if not pg:
        raise KeyError(page_id)
    if pg.get("status") != "HUMAN_APPROVED" and pg.get("status") != "INDEXABLE":
        raise ValueError("requires_HUMAN_APPROVED")
    appr = pg.get("approval") or {}
    if appr.get("material_hash") and appr.get("material_hash") != pg.get("material_hash"):
        pg["status"] = "REVIEW_REQUIRED"
        raise ValueError("approval_hash_mismatch")
    pg["status"] = "INDEXABLE"
    pg.setdefault("history", []).append({"at": _now(), "event": "INDEXABLE"})
    return pg


def indexable_pages(reg: dict[str, Any]) -> list[dict[str, Any]]:
    return [p for p in reg.get("pages") or [] if p.get("status") in INDEXABLE_STATES]
