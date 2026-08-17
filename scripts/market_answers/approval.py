"""Deterministic hashed editorial approval (BARRIER 2).

INDEX requires the exact payload_content_hash + rendered_content_hash plus
the campaign token. Any mismatch is fail-closed noindex.
"""

from __future__ import annotations

from typing import Any

from scripts.market_answers import ASSET_ID, CANONICAL, QUESTION_ID
from scripts.market_answers.copy import editorial_surfaces
from scripts.market_answers.hashing import content_hash


APPROVED_BY = "OWNER_CONFENGE"
APPROVAL_TOKEN = "OWNER_APPROVAL_MARKET_ANSWER_SC_INDEX_2026_08_17"
APPROVAL_SCHEMA = "market-answer-approval/1.1"
INVALIDATION_KEYS = (
    "facts",
    "coverage",
    "method",
    "geography",
    "visible_copy",
    "limitations",
    "source",
    "as_of",
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def payload_content_hash(payload: dict[str, Any]) -> str:
    return _text(payload.get("content_hash")) or content_hash(payload)


def rendered_content_hash(record: dict[str, Any], payload: dict[str, Any]) -> str:
    return content_hash(editorial_surfaces(record, payload))


def approval_for(question_id: str, approvals: dict[str, Any] | None) -> dict[str, Any] | None:
    for item in (approvals or {}).get("approvals") or []:
        if not isinstance(item, dict):
            continue
        if _text(item.get("question_id") or item.get("asset_id")) == question_id:
            return item
        if _text(item.get("asset_id")) == ASSET_ID and question_id == QUESTION_ID:
            return item
    return None


def evaluate_approval(
    payload: dict[str, Any],
    record: dict[str, Any],
    approval: dict[str, Any] | None,
) -> tuple[bool, list[str], dict[str, str]]:
    reasons: list[str] = []
    expected_payload = payload_content_hash(payload)
    expected_render = rendered_content_hash(record, payload)
    hashes = {
        "payload_content_hash": expected_payload,
        "rendered_content_hash": expected_render,
    }
    if not approval:
        reasons.append("approval_missing")
        return False, reasons, hashes

    got_payload = _text(approval.get("payload_content_hash") or approval.get("content_hash"))
    got_render = _text(approval.get("rendered_content_hash"))
    if not got_payload:
        reasons.append("approval_hash_missing")
    elif got_payload != expected_payload:
        reasons.append("approval_hash_drift")
        reasons.append("STALE_APPROVAL")
    if not got_render:
        reasons.append("rendered_approval_hash_missing")
    elif got_render != expected_render:
        reasons.append("rendered_approval_hash_drift")
        reasons.append("STALE_APPROVAL")

    if _text(approval.get("approved_by") or approval.get("approver")) != APPROVED_BY:
        reasons.append("approval_approver_mismatch")
    token = _text(approval.get("approval_token") or approval.get("token"))
    if token != APPROVAL_TOKEN:
        reasons.append("approval_token_mismatch")
    if approval.get("index_authorized") is not True:
        reasons.append("approval_index_not_authorized")
    scope = _text(approval.get("claim_scope") or "").lower()
    if scope and scope not in {"uf", "estadual", "sc"}:
        reasons.append("approval_claim_scope_not_uf")
    geo = approval.get("geography") if isinstance(approval.get("geography"), dict) else {}
    if geo:
        if _text(geo.get("code")).upper() not in {"", "SC"}:
            reasons.append("approval_geography_not_sc")
        kind = _text(geo.get("kind") or geo.get("scope")).lower()
        if kind and kind not in {"uf", "state", "estado"}:
            reasons.append("approval_geography_not_uf")
    if _text(approval.get("url") or approval.get("canonical")) not in {"", CANONICAL}:
        if _text(approval.get("url")) != CANONICAL:
            reasons.append("approval_url_mismatch")
    return (not reasons), reasons, hashes


def approval_artifact(
    *,
    payload: dict[str, Any],
    record: dict[str, Any],
    approved_at: str,
    index_authorized: bool,
) -> dict[str, Any]:
    return {
        "schema": APPROVAL_SCHEMA,
        "asset_id": ASSET_ID,
        "question_id": QUESTION_ID,
        "url": CANONICAL,
        "geography": {"kind": "uf", "code": "SC", "label": "Santa Catarina"},
        "claim_scope": "uf",
        "payload_content_hash": payload_content_hash(payload),
        "rendered_content_hash": rendered_content_hash(record, payload),
        "method_version": _text(payload.get("method_id")),
        "schema_version": _text(payload.get("schema") or payload.get("contract_version")),
        "approved_by": APPROVED_BY,
        "approval_token": APPROVAL_TOKEN,
        "approved_at": approved_at,
        "approved_conditions": [
            "official_live",
            "not_fixture",
            "geography_uf_sc",
            "coverage_complete_or_sufficient_same_uf",
            "freshness_current",
            "method_versioned",
            "limitations_visible",
            "no_national_claim",
            "grain_ticket_not_km",
            "human_hash_bound",
        ],
        "invalidation_keys": list(INVALIDATION_KEYS),
        "index_authorized": bool(index_authorized),
        "approved_state": "PUBLISHABLE_INDEX" if index_authorized else "PUBLISHABLE_NOINDEX",
    }
