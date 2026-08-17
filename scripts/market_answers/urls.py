"""Drill-down URL model: mercado → allowed stratum → evidence → analysis → X-Ray/CTA.

No UF × município × objeto × métrica combinatorial explosion. Dynamic
filters stay query-string / on-page and noindex. Canonical URL is one.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from scripts.market_answers import CANONICAL, FAMILY_PATH, SITE


UF_DISPLAY = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AM": "Amazonas",
    "AP": "Amapá",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MG": "Minas Gerais",
    "MS": "Mato Grosso do Sul",
    "MT": "Mato Grosso",
    "PA": "Pará",
    "PB": "Paraíba",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "PR": "Paraná",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RO": "Rondônia",
    "RR": "Roraima",
    "RS": "Rio Grande do Sul",
    "SC": "Santa Catarina",
    "SE": "Sergipe",
    "SP": "São Paulo",
    "TO": "Tocantins",
}


def geography_ufs(payload: dict[str, Any] | None) -> list[str]:
    """UF codes present on the consumed payload. Never invent a second UF."""
    if not isinstance(payload, dict):
        return []
    geo = payload.get("geography") if isinstance(payload.get("geography"), dict) else {}
    seen: list[str] = []
    raw_ufs = geo.get("ufs") if isinstance(geo.get("ufs"), list) else []
    for item in raw_ufs:
        code = str(item or "").strip().upper()
        if len(code) == 2 and code.isalpha() and code not in seen:
            seen.append(code)
    single = str(geo.get("code") or "").strip().upper()
    if len(single) == 2 and single.isalpha() and single not in seen:
        seen.append(single)
    return seen


def allowed_strata(payload: dict[str, Any] | None = None) -> tuple[dict[str, Any], ...]:
    """Named peer slices derived from payload geography.

    Official SC (ufs=['SC'] or code=SC) must not ship leftover fixture
    'SC e RS' / rs-municipal labels. Missing geography yields a generic
    recorte with no invented UF filters.
    """
    ufs = geography_ufs(payload)
    if not ufs:
        return (
            {
                "id": "recorte-publicado",
                "label": "Recorte publicado",
                "filter": None,
            },
        )
    names = [UF_DISPLAY.get(uf, uf) for uf in ufs]
    recorte = f"Recorte publicado ({' e '.join(names)})"
    items: list[dict[str, Any]] = [
        {
            "id": "recorte-publicado",
            "label": recorte,
            "filter": None,
        }
    ]
    for uf, name in zip(ufs, names, strict=True):
        items.append(
            {
                "id": f"{uf.lower()}-municipal",
                "label": f"{name} · esfera municipal",
                "filter": f"{uf.lower()}-municipal",
            }
        )
    return tuple(items)


# Fixture-shaped default only. Live/official pages must call allowed_strata(payload).
ALLOWED_STRATA = allowed_strata(
    {"geography": {"ufs": ["SC", "RS"], "label": "Santa Catarina e Rio Grande do Sul"}}
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


def stratum_href(stratum_id: str, payload: dict[str, Any] | None = None) -> str:
    strata = allowed_strata(payload) if payload is not None else ALLOWED_STRATA
    match = next((item for item in strata if item["id"] == stratum_id), None)
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
                "href": stratum_href(item["id"], payload),
                "noindex": bool(item["filter"]),
            }
            for item in allowed_strata(payload)
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
