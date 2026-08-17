"""Deterministic hash of a funnel trace.

Reuses the shipped market-answer hasher. Strips only documented non-semantic
clocks and local paths so two isolated runs compare equal.
"""

from __future__ import annotations

from typing import Any

from scripts.knowledge_funnel import CLOCK_KEYS, PATH_KEYS
from scripts.market_answers.hashing import canonicalize, content_hash


def strip_non_semantic(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): strip_non_semantic(item)
            for key, item in value.items()
            if key not in CLOCK_KEYS and key not in PATH_KEYS
        }
    if isinstance(value, list):
        return [strip_non_semantic(item) for item in value]
    return value


def canonical_trace(trace: dict[str, Any]) -> dict[str, Any]:
    return canonicalize(strip_non_semantic(trace))


def trace_hash(trace: dict[str, Any]) -> str:
    return content_hash(strip_non_semantic(trace))
