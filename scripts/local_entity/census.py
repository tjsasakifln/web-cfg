"""Local vs map-pack vs organic census. Live GSC absence is BLOCKED, never zero."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

from scripts.local_entity.constants import (
    CAMPAIGN_AS_OF,
    CENSUS_CHANNELS,
    GSC_ABSENCE_STATUSES,
    GSC_LIVE_BLOCKED,
    GSC_SOURCES,
)


class CensusError(ValueError):
    """Census labeling or GSC-honesty defect."""


def hash_gsc_query(query: str) -> str:
    digest = hashlib.sha256((query or "").encode("utf-8")).hexdigest()[:16]
    return f"sha256:{digest}"


def _row(
    *,
    rid: str,
    channel: str,
    query_or_context: str,
    source: str,
    freshness: str,
    limitation: str,
    observation: str = "UNKNOWN",
    query_redacted: bool = False,
    impressions: int | None = None,
    clicks: int | None = None,
) -> dict[str, Any]:
    if channel not in CENSUS_CHANNELS:
        raise CensusError(f"invalid_channel:{channel}")
    return {
        "id": rid,
        "channel": channel,
        "query_or_context": query_or_context,
        "query_redacted": query_redacted,
        "source": source,
        "freshness": freshness,
        "limitation": limitation,
        "observation": observation,
        "impressions": impressions,
        "clicks": clicks,
    }


def default_census_rows() -> list[dict[str, Any]]:
    """Labeled research + historical rows. Map-pack stays distinct from organic."""
    blocked = (
        "Live map-pack observation was not collected. Live GSC is LIVE_JOB_OK "
        "(PR #159). Absence is BLOCKED/UNKNOWN, not zero and not a product decision."
    )
    organic_lim = (
        "Organic/local-organic row is labeled independently of map-pack. "
        "Do not fold map-pack presence into this row. Live GSC is BLOCKED."
    )
    return [
        _row(
            rid="map-pack-confenge-florianopolis",
            channel="MAP_PACK",
            query_or_context="CONFENGE Florianópolis",
            source="campaign_query",
            freshness="BLOCKED",
            limitation=blocked,
        ),
        _row(
            rid="map-pack-tiago-sasaki-florianopolis",
            channel="MAP_PACK",
            query_or_context="Tiago Sasaki Florianópolis",
            source="campaign_query",
            freshness="BLOCKED",
            limitation=blocked,
        ),
        _row(
            rid="map-pack-confenge-engenharia-sc",
            channel="MAP_PACK",
            query_or_context="CONFENGE engenharia Santa Catarina",
            source="campaign_query",
            freshness="BLOCKED",
            limitation=blocked,
        ),
        _row(
            rid="organic-historical-serp-entity-snippet",
            channel="ORGANIC",
            query_or_context="site:confenge.com.br CONFENGE licitações contratos obras públicas",
            source="historical_serp_sample",
            freshness="STALE",
            limitation=(
                "data/organic/search-baseline-2026-08-14.json observation STALE_ENTITY_SNIPPET. "
                + organic_lim
            ),
            observation="STALE_ENTITY_SNIPPET",
        ),
        _row(
            rid="organic-historical-serp-margin-query",
            channel="ORGANIC",
            query_or_context="reequilíbrio contrato obra pública consultoria",
            source="historical_serp_sample",
            freshness="STALE",
            limitation=(
                "data/organic/search-baseline-2026-08-14.json observation CONFENGE_NOT_OBSERVED. "
                + organic_lim
            ),
            observation="CONFENGE_NOT_OBSERVED",
        ),
        _row(
            rid="organic-historical-gsc-branded",
            channel="ORGANIC",
            query_or_context=hash_gsc_query("confenge"),
            source="historical_gsc_csv",
            freshness="STALE",
            limitation=(
                "Historical Search Console CSV (seo/gsc-2026-08-09). Query text hashed. "
                "Not live Search Analytics. Metrics omitted so staleness is not treated as current zero."
            ),
            query_redacted=True,
        ),
        _row(
            rid="local-organic-consultoria-sc",
            channel="LOCAL_ORGANIC",
            query_or_context="consultoria licitações contratos obras públicas Santa Catarina",
            source="campaign_query",
            freshness="BLOCKED",
            limitation=(
                "Local-organic (query with geographic modifier, web blue links — not map-pack). "
                + organic_lim
            ),
        ),
        _row(
            rid="local-organic-consultoria-florianopolis",
            channel="LOCAL_ORGANIC",
            query_or_context="consultoria contratos obras públicas Florianópolis",
            source="campaign_query",
            freshness="BLOCKED",
            limitation=(
                "Local-organic geographic modifier. Not a map-pack row. Live SERP not collected. "
                + organic_lim
            ),
        ),
        _row(
            rid="organic-branded-person",
            channel="ORGANIC",
            query_or_context="Engº Tiago Sasaki CONFENGE",
            source="campaign_query",
            freshness="BLOCKED",
            limitation="Branded person query in classic organic. Not map-pack. Live GSC BLOCKED.",
        ),
    ]


def gsc_live_envelope(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Normalize live GSC. Blocked/missing stays non-numeric; never product-ready."""
    if not payload:
        env = copy.deepcopy(GSC_LIVE_BLOCKED)
        env["as_of"] = CAMPAIGN_AS_OF
        return env
    errors = validate_gsc_live(payload)
    if errors:
        raise CensusError(";".join(errors))
    env = copy.deepcopy(payload)
    env.setdefault("as_of", CAMPAIGN_AS_OF)
    return env


def validate_gsc_live(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    status = payload.get("status") or payload.get("source_kind")
    blocked = (
        status in GSC_ABSENCE_STATUSES
        or payload.get("source_kind") in {"LIVE_JOB_OK", "missing_credentials"}
        or payload.get("error") in {"missing_credentials", "LIVE_JOB_OK"}
    )
    if blocked:
        for key in ("impressions", "clicks", "queries", "rows"):
            if payload.get(key) == 0:
                errors.append("gsc_blocked_as_zero")
        if payload.get("ready_for_product_decisions") is True:
            errors.append("gsc_blocked_product_ready")
        if payload.get("status") not in (None, *GSC_ABSENCE_STATUSES) and payload.get(
            "status"
        ) not in {"BLOCKED", "UNKNOWN"}:
            errors.append(f"gsc_blocked_bad_status:{payload.get('status')}")
    return errors


def validate_census(doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rows = doc.get("rows")
    if not isinstance(rows, list) or not rows:
        return ["census_rows_absent"]
    channels: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            errors.append("census_row_not_object")
            continue
        channel = str(row.get("channel") or "")
        if channel not in CENSUS_CHANNELS:
            errors.append("collapsed_local_vs_organic")
            errors.append(f"invalid_channel:{channel}")
        mixed = channel.replace(" ", "").replace("-", "_").upper()
        if "MAP_PACK" in mixed and "ORGANIC" in mixed and channel not in CENSUS_CHANNELS:
            errors.append("collapsed_local_vs_organic")
        if channel == "ORGANIC" and row.get("map_pack"):
            errors.append("collapsed_map_pack_into_organic")
        if channel == "MAP_PACK" and row.get("organic"):
            errors.append("collapsed_organic_into_map_pack")
        for key in ("query_or_context", "source", "freshness", "limitation", "channel"):
            if not row.get(key):
                errors.append(f"census_missing:{key}")
        source = str(row.get("source") or "")
        q = str(row.get("query_or_context") or "")
        if source in GSC_SOURCES:
            if not q.startswith("sha256:"):
                errors.append("raw_gsc_query_text")
            if row.get("query_redacted") is not True:
                errors.append("gsc_query_not_redacted")
        channels.add(channel)
    if "MAP_PACK" in channels and "ORGANIC" not in channels and "LOCAL_ORGANIC" not in channels:
        errors.append("census_organic_absent")
    if "ORGANIC" in channels and "MAP_PACK" not in channels:
        errors.append("census_map_pack_absent")
    gsc = doc.get("gsc_live") or {}
    errors.extend(validate_gsc_live(gsc))
    if gsc.get("ready_for_product_decisions") is True:
        errors.append("gsc_blocked_product_ready")
    if gsc.get("status") in GSC_ABSENCE_STATUSES and gsc.get("impressions") == 0:
        errors.append("gsc_blocked_as_zero")
    return sorted(set(errors))


def build_census(
    *,
    rows: list[dict[str, Any]] | None = None,
    gsc_live: dict[str, Any] | None = None,
    search_baseline: dict[str, Any] | None = None,
) -> dict[str, Any]:
    built_rows = copy.deepcopy(rows if rows is not None else default_census_rows())
    env = gsc_live_envelope(gsc_live)
    doc = {
        "as_of": CAMPAIGN_AS_OF,
        "schema": "local-entity-census/v1",
        "gsc_live": env,
        "rows": built_rows,
        "channels": sorted({r["channel"] for r in built_rows}),
        "map_pack_distinct_from_organic": True,
        "search_baseline_consumed": bool(search_baseline),
        "limitation": env.get("limitation"),
    }
    errors = validate_census(doc)
    if errors:
        raise CensusError(";".join(errors))
    return doc


def load_search_baseline(root: Path) -> dict[str, Any] | None:
    path = root / "data" / "organic" / "search-baseline-2026-08-14.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
