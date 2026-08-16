"""Deterministic content hashes for market-answer payloads and approvals."""

from __future__ import annotations

import hashlib
import json
from typing import Any


HASH_SKIP_KEYS = frozenset(
    {
        "content_hash",
        "schema_hash",
        "_source_path",
        "_adapted",
        "_warnings",
    }
)


def canonicalize(value: Any) -> Any:
    """Stable JSON shape: sort object keys, drop hash/adapter annotations."""
    if isinstance(value, dict):
        return {
            str(key): canonicalize(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
            if key not in HASH_SKIP_KEYS
        }
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    if isinstance(value, tuple):
        return [canonicalize(item) for item in value]
    return value


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        canonicalize(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def schema_hash(schema_id: str, contract_version: str) -> str:
    return content_hash({"schema": schema_id, "contract_version": contract_version})
