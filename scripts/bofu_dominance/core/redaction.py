"""Git-safe redaction. Live query text is hashed; PII is refused."""

from __future__ import annotations

import hashlib
import re
from typing import Any

from scripts.bofu_dominance.core.constants import PII_PATTERNS

_PII_RE = [re.compile(pat, re.I) for pat in PII_PATTERNS]


def redact_query(query: str) -> str:
    digest = hashlib.sha256((query or "").encode("utf-8")).hexdigest()
    return f"sha256:{digest[:16]}"


def contains_pii(text: str) -> bool:
    return any(pat.search(text or "") for pat in _PII_RE)


def assert_no_pii(text: str, label: str) -> None:
    if contains_pii(text):
        raise ValueError(f"PII refused in {label}")


def redact_live_query_fields(value: Any) -> Any:
    if isinstance(value, list):
        return [redact_live_query_fields(item) for item in value]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        live = bool(value.get("is_gsc_live")) or str(value.get("source_kind") or "") in {
            "gsc_api",
            "gsc_live",
            "search_analytics_api_live",
        }
        for key, item in value.items():
            if live and key == "query" and isinstance(item, str):
                out["query_hash"] = redact_query(item)
                continue
            out[key] = redact_live_query_fields(item)
        if live:
            out["query_text_redacted"] = True
        return out
    return value


def git_safe_status(status: dict[str, Any]) -> dict[str, Any]:
    payload = redact_live_query_fields(status)
    assert_no_pii(str(payload), "status")
    return payload
