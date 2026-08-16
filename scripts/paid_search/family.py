"""Score problem families from GSC / optional WEB-016. Volume does not authorize."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scripts.paid_search.evidence import (
    demand_status_from_row,
    iter_gsc_queries,
    load_demand_engine_records,
    load_gsc_snapshots,
)
from scripts.paid_search.landing import choose_landing_for_family, inspect_known_landings
from scripts.paid_search.schema import FAMILY_CATALOG, PRIMARY_METRIC, UNKNOWN

ROOT = Path(__file__).resolve().parents[2]


def _compile_catalog() -> list[tuple[re.Pattern[str], dict[str, Any]]]:
    compiled: list[tuple[re.Pattern[str], dict[str, Any]]] = []
    for family in FAMILY_CATALOG:
        for pattern in family["patterns"]:
            compiled.append((re.compile(pattern, re.I), family))
    return compiled


_CATALOG = _compile_catalog()


def classify_query(query: str) -> dict[str, Any] | None:
    text = (query or "").strip()
    if not text:
        return None
    for pattern, family in _CATALOG:
        if pattern.search(text):
            return family
    return None


def score_family(
    family: dict[str, Any],
    *,
    gsc_rows: list[dict[str, Any]] | None = None,
    landing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score one family. Impression volume is recorded, never added to the score."""
    rows = list(gsc_rows or [])
    has_impressions = any(float(r.get("impressions") or 0) > 0 for r in rows)
    has_clicks = any(float(r.get("clicks") or 0) > 0 for r in rows)
    impressions = sum(float(r.get("impressions") or 0) for r in rows)
    clicks = sum(float(r.get("clicks") or 0) for r in rows)

    landing = landing or {}
    ineligible: list[str] = []
    if not has_impressions:
        ineligible.append("no_gsc_evidence")
    if not family.get("adjacent_to_60"):
        ineligible.append("not_adjacent_to_60")
    if family.get("id") == "brand":
        ineligible.append("brand_is_split_not_canary")
    if family.get("id") == "legacy_avcb":
        ineligible.append("legacy_entity")
    if landing.get("wrong_landing"):
        ineligible.append("wrong_landing")
    if landing and not landing.get("eligible", True):
        if "wrong_landing" not in ineligible:
            ineligible.append("landing_ineligible")
    if landing and not landing.get("exists", True):
        ineligible.append("landing_missing")
    if landing.get("noindex") and not landing.get("honest_noindex_experiment"):
        ineligible.append("landing_noindex")

    commercial_high = 1 if family.get("commercial_intent") == "high" else 0
    problem_now = 1 if family.get("problem_now") else 0
    first_vertical = 1 if family.get("first_vertical_event") else 0
    landing_is_60 = 1 if landing.get("id") == "diagnostico-defesa-margem" and landing.get(
        "eligible"
    ) else 0

    score = (
        4 * commercial_high
        + 2 * problem_now
        + 2 * (1 if has_clicks else 0)
        + 1 * (1 if has_impressions else 0)
        + 3 * landing_is_60
        + 2 * first_vertical
    )
    if ineligible:
        score = 0

    paid_demand = UNKNOWN
    organic_demand = "observed" if has_impressions else UNKNOWN

    return {
        "id": family.get("id"),
        "label": family.get("label"),
        "cluster": family.get("cluster"),
        "adjacent_to_60": bool(family.get("adjacent_to_60")),
        "commercial_intent": family.get("commercial_intent"),
        "problem_now": bool(family.get("problem_now")),
        "first_vertical_event": bool(family.get("first_vertical_event")),
        "event_family": family.get("event_family"),
        "eligible": not ineligible,
        "ineligible_reasons": ineligible,
        "score": score,
        "score_components": {
            "commercial_high": commercial_high,
            "problem_now": problem_now,
            "has_clicks": 1 if has_clicks else 0,
            "has_impressions": 1 if has_impressions else 0,
            "landing_is_60_utility": landing_is_60,
            "first_vertical_event": first_vertical,
            "volume_in_score": 0,
        },
        "organic_demand": organic_demand,
        "paid_demand": paid_demand,
        "gsc_totals": {
            "impressions": impressions,
            "clicks": clicks,
            "query_count": len(rows),
            "note": "Totals are evidence of organic presence, not authorization and not paid demand.",
        },
        "gsc_queries": [
            {
                "query": r.get("query"),
                "export_id": r.get("export_id"),
                "demand": demand_status_from_row(r),
            }
            for r in rows
        ],
        "landing": {
            "id": landing.get("id"),
            "path": landing.get("path"),
            "canonical": landing.get("canonical"),
            "html_path": landing.get("html_path"),
            "exists": landing.get("exists"),
            "indexable": landing.get("indexable"),
            "noindex": landing.get("noindex"),
            "in_sitemap": landing.get("in_sitemap"),
            "eligible": landing.get("eligible"),
            "wrong_landing": landing.get("wrong_landing"),
            "honesty": landing.get("honesty"),
            "issue": landing.get("issue"),
            "kind": landing.get("kind"),
            "asset_id": landing.get("asset_id"),
            "route_family": landing.get("route_family"),
            "cta_id": landing.get("cta_id"),
            "jornada": landing.get("jornada"),
        },
        "primary_metric": PRIMARY_METRIC,
    }


def _bucket_queries(queries: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    buckets: dict[str, list[dict[str, Any]]] = {family["id"]: [] for family in FAMILY_CATALOG}
    buckets["unclassified"] = []
    for row in queries:
        family = classify_query(str(row.get("query") or ""))
        if family is None:
            buckets["unclassified"].append(row)
        else:
            buckets[family["id"]].append(row)
    return buckets


def select_family(root: Path | str | None = None) -> dict[str, Any]:
    base = Path(root) if root else ROOT
    snapshots = load_gsc_snapshots(base)
    queries = iter_gsc_queries(snapshots)
    demand_engine = load_demand_engine_records(base)
    landings = inspect_known_landings(base)
    buckets = _bucket_queries(queries)

    catalog_by_id = {family["id"]: family for family in FAMILY_CATALOG}
    scored: list[dict[str, Any]] = []
    for family in FAMILY_CATALOG:
        landing = choose_landing_for_family(family["id"], family.get("landing_id"), landings)
        scored.append(
            score_family(
                family,
                gsc_rows=buckets.get(family["id"]) or [],
                landing=landing,
            )
        )

    eligible = [row for row in scored if row["eligible"]]
    eligible.sort(key=lambda row: (-int(row["score"]), str(row["id"])))

    geography = _geography(snapshots)
    device = _device(snapshots)

    if not snapshots:
        return {
            "decision": "BLOCKED",
            "reason": "no_gsc_snapshots",
            "prerequisite": "versioned GSC export under seo/gsc-YYYY-MM-DD",
            "next_command": "python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-2026-08-09",
            "family": None,
            "families": scored,
            "demand_engine": demand_engine,
            "geography": geography,
            "device": device,
            "primary_metric": PRIMARY_METRIC,
        }

    if not eligible:
        return {
            "decision": "BLOCKED",
            "reason": "no_eligible_family",
            "prerequisite": (
                "an evidence-backed family adjacent to #60 with an indexable "
                "utility landing, or WEB-016 records plus an eligible #84 page"
            ),
            "next_command": (
                "git fetch origin && "
                "python3 -m scripts.organic demand-engine --gsc-dir seo/gsc-2026-08-09"
            ),
            "family": None,
            "families": scored,
            "demand_engine": demand_engine,
            "geography": geography,
            "device": device,
            "primary_metric": PRIMARY_METRIC,
            "unclassified_queries": [
                {"query": r.get("query"), "export_id": r.get("export_id")}
                for r in buckets.get("unclassified") or []
            ],
        }

    winner = eligible[0]
    hypothesis = (
        f"A construtora com contrato de obra pública ativo que busca termos exact/phrase "
        f"da família '{winner['label']}' usa o Diagnóstico de Defesa de Margem para "
        f"identificar o contrato e pede segunda leitura. O canário mede learning "
        f"qualificado e pipeline, não click/CTR. Paid demand permanece {UNKNOWN} "
        f"até haver gasto aprovado; GSC orgânico não autoriza o family como TAM."
    )
    return {
        "decision": "SELECTED",
        "reason": "highest_eligible_score_volume_excluded",
        "family": winner,
        "hypothesis": hypothesis,
        "icp": {
            "who": (
                "Diretoria técnica / sócio de construtora B2G com contrato de "
                "obra pública ativo"
            ),
            "job": winner["label"],
            "why_now": (
                "evento contratual com dinheiro em risco"
                if winner.get("problem_now")
                else "investigação comercial de defesa de margem"
            ),
            "not": (
                "estudante, candidato a vaga, AVCB/legado, busca de marca, "
                "SINAPI tabela, SmartLic"
            ),
        },
        "geography": geography,
        "device": device,
        "schedule": {
            "timezone": "America/Sao_Paulo",
            "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
            "hours": "08:00-19:00",
            "status": "PROPOSED",
            "note": "Schedule confirmation is HUMAN_REQUIRED before go-live.",
        },
        "exclusions": {
            "geo": [c["country"] for c in geography.get("exclude_countries") or []],
            "device": ["mobile", "tablet"],
            "audiences": ["remarketing", "retargeting", "customer_match"],
            "query_families": [
                row["id"]
                for row in scored
                if row["id"] != winner["id"]
            ],
            "brand_as_primary": True,
            "smartlic": True,
        },
        "families": scored,
        "demand_engine": demand_engine,
        "snapshots": [s.get("export_id") for s in snapshots],
        "primary_metric": PRIMARY_METRIC,
        "unclassified_queries": [
            {"query": r.get("query"), "export_id": r.get("export_id")}
            for r in buckets.get("unclassified") or []
        ],
        "catalog_ref": {fid: catalog_by_id[fid]["label"] for fid in catalog_by_id},
    }


def _geography(snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    by_country: dict[str, dict[str, float]] = {}
    for snap in snapshots:
        for row in snap.get("countries") or []:
            name = row["country"]
            slot = by_country.setdefault(name, {"clicks": 0.0, "impressions": 0.0})
            slot["clicks"] += float(row.get("clicks") or 0)
            slot["impressions"] += float(row.get("impressions") or 0)
    include = ["Brasil"] if "Brasil" in by_country else []
    exclude = [name for name in sorted(by_country) if name not in include]
    return {
        "include": include,
        "exclude_countries": [
            {"country": name, **by_country[name]} for name in exclude
        ],
        "observed": [
            {"country": name, **vals} for name, vals in sorted(by_country.items())
        ],
        "note": "GSC Paises.csv is organic evidence. Paid geo is Brasil-only.",
    }


def _device(snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    by_device: dict[str, dict[str, float]] = {}
    for snap in snapshots:
        for row in snap.get("devices") or []:
            key = row.get("device_key") or row.get("device")
            slot = by_device.setdefault(str(key), {"clicks": 0.0, "impressions": 0.0})
            slot["clicks"] += float(row.get("clicks") or 0)
            slot["impressions"] += float(row.get("impressions") or 0)
    return {
        "include": ["desktop"],
        "exclude": ["mobile", "tablet"],
        "observed": [
            {"device": name, **vals} for name, vals in sorted(by_device.items())
        ],
        "note": (
            "Across gsc-2026-07-30 and gsc-2026-08-09 desktop dominates clicks. "
            "Canary stays desktop-only; mobile is an exclusion, not a second canary."
        ),
    }
