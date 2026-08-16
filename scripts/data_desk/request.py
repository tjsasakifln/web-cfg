"""Prepare-only data-request intake contract. No automatic promise."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from scripts.data_desk.schema import (
    FORBIDDEN_REQUEST_FIELDS,
    MIN_REQUEST_FIELDS,
    REQUEST_SCHEMA,
    REQUEST_STATES,
    SchemaError,
    validate_request_state,
)


def correlation_id_for(payload: dict[str, Any]) -> str:
    material = {
        "finalidade": payload.get("finalidade"),
        "organization": payload.get("organization"),
        "asset_id": payload.get("asset_id"),
        "as_of": payload.get("as_of"),
    }
    digest = hashlib.sha256(
        json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return f"ddr-{digest[:16]}"


def validate_intake(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaError("request_must_be_object")
    forbidden = FORBIDDEN_REQUEST_FIELDS.intersection(payload)
    if forbidden:
        raise SchemaError("pii_field_forbidden:" + ",".join(sorted(forbidden)))
    missing = [field for field in MIN_REQUEST_FIELDS if field not in payload]
    if missing:
        raise SchemaError("missing_request_fields:" + ",".join(missing))
    if payload.get("consent") is not True:
        raise SchemaError("consent_required")
    if payload.get("prazo") != "UNKNOWN":
        raise SchemaError("prazo_must_be_unknown_until_measured")
    if payload.get("automatic_promise") is True:
        raise SchemaError("automatic_promise_forbidden")
    state = payload.get("outcome") or payload.get("state") or "UNKNOWN"
    validate_request_state(state)
    return payload


def request_contract(asset: dict[str, Any]) -> dict[str, Any]:
    """Static intake contract shipped with the package. Not an API."""
    return {
        "schema": REQUEST_SCHEMA,
        "mode": "prepare-only",
        "automatic_promise": False,
        "api": False,
        "prazo": "UNKNOWN",
        "prazo_note": "SLA stays UNKNOWN until measured against real requests.",
        "consent_required": True,
        "pii_minimized": True,
        "allowed_fields": [
            "finalidade",
            "organization",
            "role",
            "work_email",
            "consent",
            "asset_id",
            "attribution",
            "intended_publication",
        ],
        "forbidden_fields": sorted(FORBIDDEN_REQUEST_FIELDS),
        "minimum_fields": list(MIN_REQUEST_FIELDS),
        "states": sorted(REQUEST_STATES),
        "default_state": "UNKNOWN",
        "correlation_id": {
            "required": True,
            "generated_from": ["finalidade", "organization", "asset_id", "as_of"],
        },
        "attribution": {
            "required": True,
            "must_preserve_canonical_or_permalink": True,
        },
        "registry_outcome": "UNKNOWN until a human records FULFILLED|DECLINED|NEEDS_SCOPE",
        "asset_id": asset.get("id"),
        "watermark": asset.get("watermark") or asset.get("label"),
    }


def register_request(payload: dict[str, Any], *, asset: dict[str, Any]) -> dict[str, Any]:
    validate_intake(payload)
    cid = payload.get("correlation_id") or correlation_id_for(
        {**payload, "asset_id": asset.get("id"), "as_of": asset.get("as_of")}
    )
    return {
        "schema": REQUEST_SCHEMA,
        "correlation_id": cid,
        "asset_id": asset.get("id"),
        "finalidade": payload.get("finalidade"),
        "organization": payload.get("organization"),
        "role": payload.get("role"),
        "consent": True,
        "prazo": "UNKNOWN",
        "attribution": payload.get("attribution"),
        "outcome": payload.get("outcome") or "UNKNOWN",
        "automatic_promise": False,
    }
