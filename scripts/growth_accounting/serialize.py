"""Deterministic JSON: stable key order, no wall-clock, stable numbers."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def stable_number(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, float):
        if value != value:  # NaN
            raise ValueError("NaN is not serializable in growth-accounting reports")
        rounded = round(value, 10)
        if rounded == int(rounded) and abs(rounded) < 1e15:
            return int(rounded)
        return rounded
    return value


def stabilize(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): stabilize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stabilize(item) for item in value]
    if isinstance(value, tuple):
        return [stabilize(item) for item in value]
    return stable_number(value)


def canonical_dumps(value: Any) -> str:
    return json.dumps(
        stabilize(value),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
        allow_nan=False,
    ) + "\n"


def sha256_canonical(value: Any) -> str:
    payload = canonical_dumps(value).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()
