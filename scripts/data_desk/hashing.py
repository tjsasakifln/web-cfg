"""Deterministic package hashing and correction invalidation."""

from __future__ import annotations

import hashlib
import json
from typing import Any

HASH_FIELDS = (
    "id",
    "watermark",
    "permalink",
    "canonical",
    "citation_text",
    "citation_short",
    "method_version",
    "schema_version",
    "data_version",
    "as_of",
    "coverage",
    "limitations",
    "correction_link",
    "creator",
    "publisher",
    "license",
    "usage_guidance",
    "identifier",
    "provenance",
    "has_dataset",
    "dataset",
    "csv_sha256",
    "svg_sha256",
    "png_sha256",
    "stats",
    "missingness",
    "payload_content_hash",
    "rendered_content_hash",
    "grain",
    "geography_code",
)


def canonical_bytes(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_hex(text.encode("utf-8"))


def package_material(package: dict[str, Any]) -> dict[str, Any]:
    material: dict[str, Any] = {}
    for key in HASH_FIELDS:
        if key in package:
            material[key] = package[key]
    return material


def package_hash(package: dict[str, Any]) -> str:
    return sha256_hex(canonical_bytes(package_material(package)))


def version_label(package: dict[str, Any]) -> str:
    return f"{package.get('data_version')}·{package.get('as_of')}·{package_hash(package)[:12]}"
