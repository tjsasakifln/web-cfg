"""No-PII Market Answer event catalog and payload builder.

Impression, engagement, lead and pipeline stay separate. A page view is
never a lead. Attribution uses source CONFENGE_WEB and allowlisted fields.
"""

from __future__ import annotations

from typing import Any

from scripts.market_answers import (
    ASSET_FAMILY,
    ASSET_ID,
    PII_EVENT_KEYS,
    ROUTE_FAMILY,
    SOURCE,
)

EVENT_NAMES = (
    "answer_view",
    "method_open",
    "evidence_drilldown",
    "analysis_click",
    "xray_start",
    "cta_view",
    "cta_click",
    "lead_receipt_correlated",
    "correction_open",
)

# The browser canary has no local capture form and therefore cannot truthfully
# emit a receipt event. The internal event remains available to receipt-owning
# producers, but is not advertised by this public surface.
BROWSER_EVENT_NAMES = tuple(
    name for name in EVENT_NAMES if name != "lead_receipt_correlated"
)

EVENT_LAYER = {
    "answer_view": "impression",
    "method_open": "engagement",
    "evidence_drilldown": "engagement",
    "analysis_click": "engagement",
    "xray_start": "engagement",
    "cta_view": "engagement",
    "cta_click": "engagement",
    "lead_receipt_correlated": "lead",
    "correction_open": "engagement",
}

# Allowlisted analytics props. Never nome/email/telefone/CNPJ/query text.
ALLOWED_PROPS = frozenset(
    {
        "event_layer",
        "asset_id",
        "asset_family",
        "asset_version",
        "route_family",
        "source",
        "cta_id",
        "cta_position",
        "correlation_id",
        "evidence_id",
        "analysis_id",
        "stratum_id",
        "content_hash",
        "page_path",
        "producer_status",
        "index_state",
        "official_live",
    }
)


def catalog(*, asset_version: str, content_hash: str) -> dict[str, Any]:
    return {
        "source": SOURCE,
        "asset_id": ASSET_ID,
        "asset_family": ASSET_FAMILY,
        "route_family": ROUTE_FAMILY,
        "asset_version": asset_version,
        "content_hash": content_hash,
        "events": [
            {
                "name": name,
                "layer": EVENT_LAYER[name],
                "pii": False,
                "is_lead": name == "lead_receipt_correlated",
                "is_page_view": False,
            }
            for name in BROWSER_EVENT_NAMES
        ],
        "notes": {
            "page_view_is_not_lead": True,
            "answer_view_is_impression_only": True,
            "lead_join": "UNAVAILABLE_ON_CANARY; downstream capture owns receipt analytics",
        },
    }


def build_event(name: str, props: dict[str, Any] | None = None) -> dict[str, Any]:
    if name not in EVENT_NAMES:
        raise ValueError(f"unknown market-answer event: {name}")
    raw = dict(props or {})
    safe: dict[str, Any] = {
        "event": name,
        "event_layer": EVENT_LAYER[name],
        "asset_id": ASSET_ID,
        "asset_family": ASSET_FAMILY,
        "route_family": ROUTE_FAMILY,
        "source": SOURCE,
    }
    for key, value in raw.items():
        lowered = str(key).lower()
        if lowered in PII_EVENT_KEYS:
            continue
        if lowered not in ALLOWED_PROPS:
            continue
        if value is None or value == "":
            continue
        if isinstance(value, str) and ("@" in value or _looks_phone(value)):
            continue
        if isinstance(value, str) and len(value) > 180:
            continue
        safe[key] = value
    return safe


def _looks_phone(value: str) -> bool:
    digits = "".join(ch for ch in value if ch.isdigit())
    return len(digits) >= 8 and (value.startswith("+") or "whatsapp" in value.lower())


def assert_no_pii(payload: dict[str, Any]) -> None:
    for key in payload:
        if str(key).lower() in PII_EVENT_KEYS:
            raise AssertionError(f"PII key in event payload: {key}")
        value = payload[key]
        if isinstance(value, str) and "@" in value:
            raise AssertionError(f"email-like value in {key}")
