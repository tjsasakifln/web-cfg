"""Attribution keep-list for analysis CTA → lead → Warmbly.

Mirrors the shipped lead-core allowlist keys added for this family.
No PII. correlation is correlation_id.
"""

from __future__ import annotations

from typing import Any

from scripts.contract_analysis import ASSET_FAMILY, ROUTE_FAMILY

# Keys that must survive persist-first capture. Keep in sync with lead-core.cjs.
KEEP_LIST = (
    "analysis_id",
    "evidence_pack_version",
    "asset_family",
    "correlation_id",
    "route_family",
    "asset_id",
    "cta_id",
)

PII_KEYS = (
    "email",
    "nome",
    "telefone",
    "phone",
    "name",
    "cnpj",
    "mensagem",
    "message",
)


def attribution_payload(record: dict[str, Any], *, correlation_id: str = "") -> dict[str, str]:
    return {
        "analysis_id": str(record.get("analysis_id") or record.get("id") or ""),
        "evidence_pack_version": str(record.get("evidence_pack_version") or ""),
        "asset_family": ASSET_FAMILY,
        "correlation_id": correlation_id,
        "route_family": ROUTE_FAMILY,
        "asset_id": str(record.get("slug") or record.get("id") or ""),
        "cta_id": "analise-tecnica-contextual",
    }


def pick_attribution(data: dict[str, Any]) -> dict[str, str]:
    """Keep only the analysis family keys; drop PII and arbitrary fields."""
    out: dict[str, str] = {}
    for key in KEEP_LIST:
        val = data.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if not text or "@" in text:
            continue
        out[key] = text[:180]
    return out
