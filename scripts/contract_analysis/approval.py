"""Individual human approval for PUBLISHABLE_INDEX. Never quota-fill."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

APPROVALS_REL = Path("data/editorial/contract-analysis/approvals.json")

_MATERIAL_KEYS = (
    "id",
    "slug",
    "title",
    "insight_singular",
    "executive_summary",
    "why_analysis",
    "utility_beyond_source",
    "cannot_conclude",
    "methodology",
    "limitations",
    "as_of",
    "evidence_pack_hash",
    "evidence_pack_version",
    "content_hash",
    "publication_readiness",
    "catalog_mode",
    "facts",
    "calculations",
    "comparisons",
    "interpretation",
)


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def material_payload(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in _MATERIAL_KEYS}


def material_hash(record: dict[str, Any]) -> str:
    blob = json.dumps(material_payload(record), ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def approvals_path(root: Path | None = None) -> Path:
    return (root or _root()) / APPROVALS_REL


def load_approvals(root: Path | None = None) -> dict[str, Any]:
    path = approvals_path(root)
    if not path.is_file():
        return {"schema": "contract-analysis-approvals/1.0", "approvals": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"schema": "contract-analysis-approvals/1.0", "approvals": []}
    payload.setdefault("approvals", [])
    return payload


def find_approval(record: dict[str, Any], *, root: Path | None = None) -> dict[str, Any] | None:
    aid = str(record.get("id") or record.get("analysis_id") or "")
    digest = material_hash(record)
    for row in load_approvals(root).get("approvals") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("analysis_id") or "") != aid:
            continue
        if str(row.get("material_hash") or "") != digest:
            continue
        if row.get("state") != "PUBLISHABLE_INDEX":
            continue
        return row
    return None


def approval_allows_index(record: dict[str, Any], *, root: Path | None = None) -> tuple[bool, list[str]]:
    """INDEX requires a stored approval whose hash still matches the material."""
    reasons: list[str] = []
    if record.get("is_fixture") or record.get("catalog_mode") in {"fixture", "offline_catalog"}:
        return False, ["approval_refused_fixture"]
    if not record.get("approved_for_index") and not find_approval(record, root=root):
        return False, ["approval_absent"]
    stored = find_approval(record, root=root)
    expected = material_hash(record)
    if stored is None:
        # Inline approval on the record (tests) still needs a hash + rollback.
        inline_hash = str(record.get("material_hash") or "")
        rollback = record.get("rollback") or (record.get("approval") or {}).get("rollback")
        if record.get("approved_for_index") and inline_hash == expected and rollback:
            return True, []
        if record.get("approved_for_index") and not inline_hash:
            reasons.append("approval_material_hash_absent")
            return False, reasons
        if record.get("approved_for_index") and inline_hash != expected:
            reasons.append("approval_material_hash_mismatch")
            return False, reasons
        if not rollback:
            reasons.append("approval_rollback_absent")
        reasons.append("approval_absent")
        return False, reasons
    if str(stored.get("material_hash") or "") != expected:
        return False, ["approval_material_hash_mismatch"]
    if not stored.get("rollback"):
        return False, ["approval_rollback_absent"]
    return True, []
