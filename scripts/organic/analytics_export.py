"""Versioned aggregate analytics export reader; absent/invalid never means zero."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXPORT = ROOT / "data" / "organic" / "analytics-export" / "current.v1.json"
SCHEMA = "confenge.organic_funnel_export/1.0"
METRICS = (
    "organic_assisted_conversion",
    "organic_service_page_entry",
    "organic_content_to_service_transition",
    "organic_content_to_lead",
    "organic_service_to_lead",
)
PII_KEYS = frozenset(
    {"name", "nome", "email", "phone", "telefone", "whatsapp", "cnpj", "cpf", "message", "mensagem"}
)


def _unknown(reason_code: str, as_of: str) -> dict[str, Any]:
    return {"status": "UNKNOWN", "value": None, "reason_code": reason_code, "as_of": as_of}


def _contains_pii_key(value: Any) -> bool:
    if isinstance(value, dict):
        return any(str(key).lower() in PII_KEYS or _contains_pii_key(child) for key, child in value.items())
    if isinstance(value, list):
        return any(_contains_pii_key(child) for child in value)
    return False


def read_funnel_metrics(path: Path | None = None, *, as_of: str | None = None) -> dict[str, dict[str, Any]]:
    """Read aggregate metrics, returning typed UNKNOWN for every absent or unusable value."""
    target = path or DEFAULT_EXPORT
    clock = as_of or date.today().isoformat()
    if not target.is_file():
        return {name: _unknown("ANALYTICS_EXPORT_ABSENT", clock) for name in METRICS}
    try:
        doc = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {name: _unknown("ANALYTICS_EXPORT_INVALID", clock) for name in METRICS}
    export_as_of = str(doc.get("as_of") or clock)
    if doc.get("schema") != SCHEMA or doc.get("pii") is not False or _contains_pii_key(doc):
        return {name: _unknown("ANALYTICS_EXPORT_INVALID", export_as_of) for name in METRICS}
    source_metrics = doc.get("metrics") if isinstance(doc.get("metrics"), dict) else {}
    if not source_metrics:
        return {name: _unknown("ANALYTICS_EXPORT_EMPTY", export_as_of) for name in METRICS}
    result: dict[str, dict[str, Any]] = {}
    for name in METRICS:
        row = source_metrics.get(name) if isinstance(source_metrics.get(name), dict) else {}
        value = row.get("value")
        if row.get("status") == "MEASURED" and isinstance(value, (int, float)) and not isinstance(value, bool):
            result[name] = {
                "status": "MEASURED",
                "value": value,
                "numerator": row.get("numerator"),
                "denominator": row.get("denominator"),
                "as_of": export_as_of,
            }
        else:
            result[name] = _unknown(str(row.get("reason_code") or "METRIC_NOT_MEASURED"), export_as_of)
    return result
