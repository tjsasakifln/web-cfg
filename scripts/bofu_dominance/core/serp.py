"""SERP census model. No evasive scraping; no single-query official rank."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.bofu_dominance.core.constants import CENSUS_PATH, MAX_CENSUS_QUERIES
from scripts.bofu_dominance.core.schema import validate_census


def classify_page_type(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    path = urlparse(url).path.lower()
    if host.endswith("confenge.com.br"):
        if path.startswith("/conteudos/"):
            return "editorial_article"
        if path.startswith("/ferramentas/"):
            return "tool"
        if path.startswith("/analises-contratos-publicos/"):
            return "contract_analysis_canary"
        if path.startswith("/inteligencia/"):
            return "market_answer"
        if path in {"/", ""}:
            return "home"
        return "service_pillar"
    if "tcu.gov.br" in host:
        return "control_body"
    if host.endswith("gov.br"):
        return "official"
    if "jusbrasil" in host:
        return "legal_aggregator"
    if "youtube.com" in host or "youtu.be" in host:
        return "video"
    if "instagram.com" in host or "facebook.com" in host:
        return "social"
    if any(token in host for token in ("zenite", "migalhas", "conjur")):
        return "legal_commentary"
    return "third_party"


def load_census(path: Path | None = None, family_ids: set[str] | None = None) -> dict[str, Any]:
    target = path or CENSUS_PATH
    doc = json.loads(target.read_text(encoding="utf-8"))
    if family_ids is not None:
        validate_census(doc, family_ids)
    return doc


def observations_for_family(census: dict[str, Any], family_id: str) -> list[dict[str, Any]]:
    rows = [row for row in census.get("observations") or [] if row.get("family_id") == family_id]
    return rows[:MAX_CENSUS_QUERIES]


def census_summary(census: dict[str, Any], p0_p1_ids: set[str]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in census.get("observations") or []:
        grouped[str(row.get("family_id"))].append(row)
    missing = sorted(fid for fid in p0_p1_ids if fid not in grouped)
    over = {fid: len(rows) for fid, rows in grouped.items() if len(rows) > MAX_CENSUS_QUERIES}
    confenge = {fid: any(row.get("confenge_observed") for row in rows) for fid, rows in grouped.items()}
    return {
        "p0_p1_missing_census": missing,
        "over_limit": over,
        "max_queries": MAX_CENSUS_QUERIES,
        "confenge_observed_by_family": confenge,
        "official_position_claimed": any(
            row.get("official_position") not in (None,) for row in census.get("observations") or []
        ),
    }
