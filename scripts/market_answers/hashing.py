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

# extra-cli official export: drop versioned timestamps before byte/hash compare.
FOLDED_TIMESTAMP_KEYS = frozenset(
    {
        "generated_at",
        "as_of",
        "source_as_of",
        "produced_at",
        "expires_at",
        "content_hash",
        "payload_content_hash",
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


def fold_versioned_timestamps(value: Any) -> Any:
    """Drop extra-cli versioned timestamp fields. Facts stay intact."""
    if isinstance(value, dict):
        return {
            str(key): fold_versioned_timestamps(item)
            for key, item in value.items()
            if key not in FOLDED_TIMESTAMP_KEYS
            and key != "freshness"
            and key != "_source_path"
        }
    if isinstance(value, list):
        return [fold_versioned_timestamps(item) for item in value]
    return value


def folded_content_hash(value: Any) -> str:
    # Match the campaign fold: default json.dumps (ensure_ascii=True) + sort_keys + default=str.
    return hashlib.sha256(
        json.dumps(fold_versioned_timestamps(value), sort_keys=True, default=str).encode()
    ).hexdigest()


def schema_hash(schema_id: str, contract_version: str) -> str:
    return content_hash({"schema": schema_id, "contract_version": contract_version})
