"""Individual human approval for PUBLISHABLE_INDEX. Never quota-fill."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APPROVALS_REL = Path("data/editorial/contract-analysis/approvals.json")
APPROVAL_SCHEMA = "contract-analysis-approvals/1.0"

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


def approval_triple(record: dict[str, Any]) -> tuple[str, str, str]:
    """INDEX approval is bound to analysis_id + evidence_pack_version + content hash."""
    aid = str(record.get("id") or record.get("analysis_id") or record.get("analysis_candidate_id") or "")
    pack = str(record.get("evidence_pack_version") or "")
    digest = str(record.get("content_hash") or "")
    return aid, pack, digest


def triple_complete(record: dict[str, Any]) -> bool:
    aid, pack, digest = approval_triple(record)
    return bool(aid and pack and digest)


def _is_fixture_record(record: dict[str, Any]) -> bool:
    if record.get("is_fixture") or record.get("test_only"):
        return True
    return record.get("catalog_mode") in {"fixture", "offline_catalog"}


def approvals_path(root: Path | None = None) -> Path:
    return (root or _root()) / APPROVALS_REL


def load_approvals(root: Path | None = None) -> dict[str, Any]:
    path = approvals_path(root)
    if not path.is_file():
        return {"schema": APPROVAL_SCHEMA, "approvals": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"schema": APPROVAL_SCHEMA, "approvals": []}
    payload.setdefault("approvals", [])
    return payload


def find_approval(record: dict[str, Any], *, root: Path | None = None) -> dict[str, Any] | None:
    aid, pack, digest = approval_triple(record)
    if not (aid and pack and digest):
        return None
    expected = material_hash(record)
    for row in load_approvals(root).get("approvals") or []:
        if not isinstance(row, dict):
            continue
        if row.get("withdrawn"):
            continue
        if str(row.get("analysis_id") or "") != aid:
            continue
        if str(row.get("evidence_pack_version") or "") != pack:
            continue
        if str(row.get("content_hash") or "") != digest:
            continue
        if str(row.get("material_hash") or "") != expected:
            continue
        if row.get("state") != "PUBLISHABLE_INDEX":
            continue
        return row
    return None


class ApprovalError(ValueError):
    """Mass or fixture approval is refused."""


def approve_many(*_args: Any, **_kwargs: Any) -> None:
    """There is no bulk INDEX approval path."""
    raise ApprovalError("mass_approval_forbidden")


approve_all = approve_many


def approve_one(
    record: dict[str, Any],
    *,
    actor: str,
    rollback: str,
    root: Path | None = None,
) -> dict[str, Any]:
    """Record a single human INDEX approval. Refuses fixtures and incomplete triples."""
    if _is_fixture_record(record):
        raise ApprovalError("approval_refused_fixture")
    if not triple_complete(record):
        raise ApprovalError("approval_triple_incomplete")
    if not rollback:
        raise ApprovalError("approval_rollback_absent")
    if not str(actor or "").strip():
        raise ApprovalError("approval_actor_absent")
    aid, pack, digest = approval_triple(record)
    row = {
        "analysis_id": aid,
        "evidence_pack_version": pack,
        "content_hash": digest,
        "material_hash": material_hash(record),
        "state": "PUBLISHABLE_INDEX",
        "actor": str(actor).strip(),
        "rollback": rollback,
        "approved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "withdrawn": False,
    }
    payload = load_approvals(root)
    payload["schema"] = APPROVAL_SCHEMA
    payload.setdefault("audit", [])
    payload["audit"].append({"action": "approve_one", **row})
    payload["approvals"] = [
        existing
        for existing in (payload.get("approvals") or [])
        if not (
            isinstance(existing, dict)
            and existing.get("analysis_id") == aid
            and not existing.get("withdrawn")
        )
    ]
    payload["approvals"].append(row)
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return row


def withdraw_approval(
    analysis_id: str,
    *,
    actor: str,
    reason: str,
    root: Path | None = None,
) -> dict[str, Any]:
    """Audit-trailed rollback: withdraw every active INDEX approval for this id."""
    payload = load_approvals(root)
    payload.setdefault("audit", [])
    withdrawn = 0
    for row in payload.get("approvals") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("analysis_id") or "") != str(analysis_id):
            continue
        if row.get("withdrawn"):
            continue
        row["withdrawn"] = True
        row["withdrawn_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        row["withdrawn_by"] = str(actor or "").strip()
        row["withdraw_reason"] = str(reason or "fast_withdrawal")
        withdrawn += 1
    event = {
        "action": "withdraw",
        "analysis_id": analysis_id,
        "actor": str(actor or "").strip(),
        "reason": str(reason or "fast_withdrawal"),
        "count": withdrawn,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    payload["audit"].append(event)
    path = approvals_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return event


def approval_allows_index(record: dict[str, Any], *, root: Path | None = None) -> tuple[bool, list[str]]:
    """INDEX requires a stored approval whose triple and material hash still match."""
    reasons: list[str] = []
    if _is_fixture_record(record):
        return False, ["approval_refused_fixture"]
    if not triple_complete(record):
        return False, ["approval_triple_incomplete"]
    if not record.get("approved_for_index") and not find_approval(record, root=root):
        return False, ["approval_absent"]
    stored = find_approval(record, root=root)
    expected = material_hash(record)
    aid, pack, digest = approval_triple(record)
    if stored is None:
        # Inline approval on the record (tests) still needs the triple + hash + rollback.
        inline_hash = str(record.get("material_hash") or "")
        rollback = record.get("rollback") or (record.get("approval") or {}).get("rollback")
        inline_pack = str(record.get("approved_evidence_pack_version") or pack)
        inline_digest = str(record.get("approved_content_hash") or digest)
        if (
            record.get("approved_for_index")
            and inline_hash == expected
            and rollback
            and inline_pack == pack
            and inline_digest == digest
        ):
            return True, []
        if record.get("approved_for_index") and not inline_hash:
            reasons.append("approval_material_hash_absent")
            return False, reasons
        if record.get("approved_for_index") and inline_hash != expected:
            reasons.append("approval_material_hash_mismatch")
            return False, reasons
        if record.get("approved_for_index") and (inline_pack != pack or inline_digest != digest):
            reasons.append("approval_triple_mismatch")
            return False, reasons
        if not rollback:
            reasons.append("approval_rollback_absent")
        reasons.append("approval_absent")
        return False, reasons
    if str(stored.get("material_hash") or "") != expected:
        return False, ["approval_material_hash_mismatch"]
    if str(stored.get("evidence_pack_version") or "") != pack or str(stored.get("content_hash") or "") != digest:
        return False, ["approval_triple_mismatch"]
    if not stored.get("rollback"):
        return False, ["approval_rollback_absent"]
    return True, []
