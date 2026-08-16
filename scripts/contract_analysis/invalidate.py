"""Correction, refresh and fast withdrawal invalidate INDEX."""

from __future__ import annotations

from typing import Any

from scripts.contract_analysis.approval import withdraw_approval


def apply_correction(record: dict[str, Any], correction: dict[str, Any]) -> dict[str, Any]:
    """Material correction unpublishes INDEX and forces editorial re-review."""
    rec = dict(record)
    rec["correction_invalidated"] = True
    rec["approved_for_index"] = False
    rec["editorial_status"] = "pending"
    history = list(rec.get("update_history") or [])
    history.append(correction)
    rec["update_history"] = history
    return rec


def apply_refresh(
    record: dict[str, Any],
    *,
    evidence_pack_version: str,
    content_hash: str,
) -> dict[str, Any]:
    """Producer refresh changes the approval triple; previous approval cannot INDEX."""
    rec = dict(record)
    rec["evidence_pack_version"] = evidence_pack_version
    rec["content_hash"] = content_hash
    rec["approved_for_index"] = False
    rec["editorial_status"] = "pending"
    return rec


def apply_fast_withdraw(
    record: dict[str, Any],
    *,
    reason: str,
    actor: str = "",
    root: Any = None,
) -> dict[str, Any]:
    """Immediate unpublish. Pages must leave INDEX."""
    rec = dict(record)
    rec["withdrawn"] = True
    rec["withdraw_reason"] = reason
    rec["approved_for_index"] = False
    aid = str(rec.get("id") or rec.get("analysis_id") or "")
    if aid and root is not None:
        withdraw_approval(aid, actor=actor or "system", reason=reason, root=root)
    return rec
