"""Drill-down URL model: mercado → allowed stratum → evidence → analysis → X-Ray/CTA.

No UF × município × objeto × métrica combinatorial explosion. Dynamic
filters stay query-string / on-page and noindex. Canonical URL is one.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from scripts.market_answers import CANONICAL, FAMILY_PATH, SITE


# Allowed strata are named peer slices, not a generated matrix.
ALLOWED_STRATA = (
    {
        "id": "recorte-publicado",
        "label": "Recorte publicado (SC e RS)",
        "filter": None,
    },
    {
        "id": "sc-municipal",
        "label": "Santa Catarina · esfera municipal",
        "filter": "sc-municipal",
    },
    {
        "id": "rs-municipal",
        "label": "Rio Grande do Sul · esfera municipal",
        "filter": "rs-municipal",
    },
)

ANALYSIS_ROOT = "/analises-contratos-publicos/"
XRAY_ANCHOR = "#xray"
CTA_ANCHOR = "#cta"
METHOD_ANCHOR = "#metodologia"
SOURCES_ANCHOR = "#fontes"
EVIDENCE_ANCHOR = "#evidencias"
CORRECTION_PATH = "/correcoes/"


def canonical_url() -> str:
    return CANONICAL


def page_path() -> str:
    return FAMILY_PATH


def stratum_href(stratum_id: str) -> str:
    match = next((item for item in ALLOWED_STRATA if item["id"] == stratum_id), None)
    if match is None:
        raise ValueError(f"stratum not allowed: {stratum_id}")
    if not match["filter"]:
        return FAMILY_PATH
    return f"{FAMILY_PATH}?{urlencode({'stratum': match['filter']})}"


def evidence_href(evidence_id: str) -> str:
    slug = str(evidence_id).strip()
    return f"{FAMILY_PATH}{EVIDENCE_ANCHOR}-{slug}"


def analysis_href(analysis_id: str | None, *, site_root: Path | None = None) -> str | None:
    if not analysis_id:
        return None
    slug = str(analysis_id).strip().strip("/")
    if not slug:
        return None
    rel = f"analises-contratos-publicos/{slug}/index.html"
    if site_root is not None and not (site_root / rel).is_file():
        return None
    return f"{ANALYSIS_ROOT}{slug}/"


def xray_href() -> str:
    return f"{FAMILY_PATH}{XRAY_ANCHOR}"


def cta_href() -> str:
    return f"{FAMILY_PATH}{CTA_ANCHOR}"


def combinatorial_paths() -> list[str]:
    """The generated public path set. Must stay a singleton + optional query."""
    return [FAMILY_PATH]


def drilldown_model(
    payload: dict[str, Any],
    *,
    site_root: Path | None = None,
) -> dict[str, Any]:
    contracts = []
    for item in payload.get("contract_refs") or []:
        if not isinstance(item, dict):
            continue
        evidence_id = str(item.get("id") or item.get("contract_id") or "").strip()
        analysis_id = item.get("analysis_id")
        contracts.append(
            {
                "id": evidence_id,
                "href": evidence_href(evidence_id) if evidence_id else FAMILY_PATH,
                "analysis_href": analysis_href(analysis_id, site_root=site_root),
                "label": item.get("label") or evidence_id,
            }
        )
    return {
        "canonical": CANONICAL,
        "path": FAMILY_PATH,
        "levels": [
            "mercado",
            "estrato_permitido",
            "contratos_evidence",
            "analysis",
            "xray_cta",
        ],
        "strata": [
            {
                "id": item["id"],
                "label": item["label"],
                "href": stratum_href(item["id"]),
                "noindex": bool(item["filter"]),
            }
            for item in ALLOWED_STRATA
        ],
        "contracts": contracts,
        "xray": xray_href(),
        "cta": cta_href(),
        "method": f"{FAMILY_PATH}{METHOD_ANCHOR}",
        "sources": f"{FAMILY_PATH}{SOURCES_ANCHOR}",
        "correction": CORRECTION_PATH,
        "generated_paths": combinatorial_paths(),
        "forbids_combinatorial_urls": True,
        "site": SITE,
    }
