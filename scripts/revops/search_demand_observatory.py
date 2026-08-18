#!/usr/bin/env python3
"""Search Demand Observatory — Search Console Search Analytics (not URL Inspection).

Supports:
  1) Google Search Console Search Analytics API (when credentials present)
  2) Structured CSV import (GSC UI export: Consultas.csv, Páginas.csv, etc.)
  3) Incremental daily storage under data/revops/gsc/

Never joins a single query to an individual lead. Attribution is cohort/probability only.

Env (API mode only):
  GSC_CLIENT_SECRETS_JSON  path to OAuth client secrets
  GSC_TOKEN_JSON           path to stored token
  GSC_SITE_URL             e.g. sc-domain:confenge.com.br or https://confenge.com.br/
  GSC_CREDENTIALS_JSON     service account JSON (alternative)

Usage:
  python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-2026-07-30
  python3 scripts/revops/search_demand_observatory.py analyze
  python3 scripts/revops/search_demand_observatory.py pull-api --days 28
  python3 scripts/revops/search_demand_observatory.py candidates --dir seo/gsc-2026-07-30
  python3 scripts/revops/search_demand_observatory.py dashboard --out data/ops/gsc-insights.json
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "revops" / "gsc"
PRIVATE_DIR = DATA / "private"
BRAND_CLASSIFICATION_VERSION = "brand-class/v1"
WINDOW_POLICY_VERSION = "complete-days/v1"
CTR_MIN_IMPRESSIONS = 100
SEARCH_ANALYTICS_LIMITATION = (
    "Search Analytics may return top rows only and is not an exhaustive total. "
    "Row counts describe the returned set, not the property universe."
)

# Current brand: CONFENGE and documented misspellings. Not sector terms.
CONFENGE_BRAND = re.compile(
    r"\b(confenge|coenge|consenge|conenge|smartenge)\b",
    re.I,
)
# Legacy brand: SmartLic. Classified separately so it cannot inflate CONFENGE brand.
LEGACY_BRAND = re.compile(r"\b(smartlic|smart[\s-]?lic)\b", re.I)
# Person name is branded only when the query is clearly navigational.
PERSON_NAME = re.compile(r"\btiago(?:\s+jun)?\s+sasaki\b", re.I)
NAVIGATIONAL_HINT = re.compile(
    r"\b(site|login|contato|email|linkedin|quem\s+[eé]|consultoria|empresa)\b",
    re.I,
)
SECTOR_TERMS = re.compile(
    r"\b(aditivo|reequil|paviment|obra|contrato|licita|bdi|sinapi|lei\s*14|"
    r"acr[eé]scimo|supress|reajuste|medi[cç][aã]o|glosa)\b",
    re.I,
)
# Backward-compatible detector used by legacy analyses (legacy entity + brand scan).
BRAND_TERMS = re.compile(
    r"\b(confenge|coenge|consenge|conenge|smartenge|tiago\s*sasaki|smartlic)\b",
    re.I,
)

# Map path fragments → cluster / offer for enrichment
CLUSTER_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"aditivo|acr[eé]scimo|supress", re.I), "aditivos", "defesa-margem"),
    (re.compile(r"reequil|reajuste|repactua", re.I), "reequilibrio", "defesa-margem"),
    (re.compile(r"bdi|sinapi|sicro|or[cç]amento|exequib", re.I), "orcamento-bdi", "bid-room"),
    (re.compile(r"medi[cç]|glosa|pagamento", re.I), "medicoes-pagamentos", "defesa-margem"),
    (re.compile(r"atraso|prorroga|paralisa", re.I), "atrasos-prorrogacao", "defesa-margem"),
    (re.compile(r"edital|licita|habilita|proposta", re.I), "edital-proposta", "bid-room"),
    (re.compile(r"diretoria|b2g|diagn[oó]stico", re.I), "oferta", "diretoria-b2g"),
    (re.compile(r"avcb|clcb|avalia[cç]|im[oó]vel|automa[cç]|nexgen|vision", re.I), "legacy-entity", ""),
]


def ensure_dirs() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "daily").mkdir(exist_ok=True)
    (DATA / "imports").mkdir(exist_ok=True)


def parse_pct(val: str) -> float:
    s = str(val or "0").strip().replace("%", "").replace(",", ".")
    try:
        return float(s) / 100.0 if "%" in str(val) or float(s) > 1 else float(s)
    except ValueError:
        return 0.0


def parse_num(val: str) -> float:
    s = str(val or "0").strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def classify_query(query: str) -> dict[str, Any]:
    """Versioned brand / legacy-brand / non-brand classification.

    Sector terms (aditivo, reequilibrio, pavimentacao, …) are never branded.
    ``tiago sasaki`` / ``tiago jun sasaki`` are branded only when navigational.
    """
    text = (query or "").strip()
    lowered = text.lower()
    if CONFENGE_BRAND.search(lowered):
        return {
            "label": "brand",
            "version": BRAND_CLASSIFICATION_VERSION,
            "navigational": True,
            "reason": "confenge_or_variation",
        }
    if LEGACY_BRAND.search(lowered):
        return {
            "label": "legacy_brand",
            "version": BRAND_CLASSIFICATION_VERSION,
            "navigational": True,
            "reason": "smartlic_legacy",
        }
    if PERSON_NAME.search(lowered):
        has_sector = bool(SECTOR_TERMS.search(lowered))
        has_nav = bool(NAVIGATIONAL_HINT.search(lowered))
        clearly_nav = (not has_sector) or (has_nav and not has_sector)
        if clearly_nav:
            return {
                "label": "brand",
                "version": BRAND_CLASSIFICATION_VERSION,
                "navigational": True,
                "reason": "person_name_navigational",
            }
        return {
            "label": "non_brand",
            "version": BRAND_CLASSIFICATION_VERSION,
            "navigational": False,
            "reason": "person_name_not_clearly_navigational",
        }
    return {
        "label": "non_brand",
        "version": BRAND_CLASSIFICATION_VERSION,
        "navigational": False,
        "reason": "sector_or_unbranded",
    }


def branded(query: str) -> bool:
    """True only for current CONFENGE brand (including navigational person name)."""
    return classify_query(query).get("label") == "brand"


def last_complete_day(*, today: date, provider_max_date: date | None) -> date:
    """Latest day that is complete. Today without a row is not a complete day."""
    yesterday = today - timedelta(days=1)
    if provider_max_date is None:
        return yesterday
    if provider_max_date >= today:
        return yesterday
    return provider_max_date


def complete_windows(
    *,
    today: date,
    provider_max_date: date | None,
    available_dates: set[date] | None = None,
) -> dict[str, Any]:
    """Pulse 7 / trend 28 vs prior 28 / context up to 90 — complete days only."""
    end = last_complete_day(today=today, provider_max_date=provider_max_date)
    pulse_start = end - timedelta(days=6)
    trend_start = end - timedelta(days=27)
    prior_end = trend_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=27)
    context_start = end - timedelta(days=89)

    def _span(start: date, stop: date) -> list[str]:
        days: list[str] = []
        cur = start
        while cur <= stop:
            days.append(cur.isoformat())
            cur += timedelta(days=1)
        return days

    pulse_days = _span(pulse_start, end)
    trend_days = _span(trend_start, end)
    prior_days = _span(prior_start, prior_end)
    context_days = _span(context_start, end)
    incomplete: list[str] = []
    if today not in (available_dates or set()) and today > end:
        incomplete.append(today.isoformat())
    return {
        "version": WINDOW_POLICY_VERSION,
        "today": today.isoformat(),
        "provider_max_date": provider_max_date.isoformat() if provider_max_date else None,
        "last_complete_day": end.isoformat(),
        "incomplete_days_excluded": incomplete,
        "today_missing_is_not_zero": True,
        "mixed_incomplete_periods": False,
        "pulse": {
            "label": "pulse_7_complete_days",
            "start": pulse_start.isoformat(),
            "end": end.isoformat(),
            "days": pulse_days,
            "complete": True,
        },
        "trend": {
            "label": "trend_28_complete_vs_prior_28",
            "current": {
                "start": trend_start.isoformat(),
                "end": end.isoformat(),
                "days": trend_days,
                "complete": True,
            },
            "prior": {
                "start": prior_start.isoformat(),
                "end": prior_end.isoformat(),
                "days": prior_days,
                "complete": True,
            },
        },
        "context": {
            "label": "context_up_to_90_complete_days",
            "start": context_start.isoformat(),
            "end": end.isoformat(),
            "days": context_days,
            "complete": True,
        },
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
    }


def day_status(day: str | date, rows_by_date: dict[str, Any] | None = None) -> dict[str, Any]:
    """A missing day is ABSENT, never coerced to zero."""
    key = day.isoformat() if isinstance(day, date) else str(day)
    rows_by_date = rows_by_date or {}
    if key not in rows_by_date:
        return {
            "date": key,
            "status": "ABSENT",
            "value": None,
            "impressions": None,
            "clicks": None,
            "note": "missing_day_is_not_zero",
        }
    payload = rows_by_date[key]
    if payload is None:
        return {
            "date": key,
            "status": "ABSENT",
            "value": None,
            "impressions": None,
            "clicks": None,
            "note": "missing_day_is_not_zero",
        }
    return {
        "date": key,
        "status": "observed",
        "value": payload,
        "note": None,
    }


def ctr_optimization_decision(impressions: float | int | None) -> dict[str, Any]:
    """Refuse CTR optimization below 100 impressions on the selected denominator."""
    imps = float(impressions or 0)
    if imps < CTR_MIN_IMPRESSIONS:
        return {
            "decision": "INSUFFICIENT_EVIDENCE",
            "impressions": imps,
            "threshold": CTR_MIN_IMPRESSIONS,
            "optimize_ctr": False,
            "data_preserved": True,
        }
    return {
        "decision": "ALLOWED",
        "impressions": imps,
        "threshold": CTR_MIN_IMPRESSIONS,
        "optimize_ctr": True,
        "data_preserved": True,
    }


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"\W+", (text or "").lower()) if len(t) > 3}


def cannibalization_verdict(
    rows: list[dict[str, Any]],
    *,
    reviewed_semantic_overlap: bool = False,
) -> dict[str, Any]:
    """Cannibalization requires the same non-brand intent on 2+ URLs.

    Similar words alone are not enough. Repeated evidence plus reviewed
    semantic overlap are both required.
    """
    by_query: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        query = (row.get("query") or "").strip()
        page = (row.get("page") or "").strip()
        if not query or not page:
            continue
        if classify_query(query)["label"] != "non_brand":
            continue
        by_query[query].add(page)
    repeated = {q: sorted(pages) for q, pages in by_query.items() if len(pages) >= 2}
    if not repeated:
        return {
            "status": "NOT_CANNIBALIZATION",
            "reason": "no_repeated_nonbrand_query_on_two_or_more_urls",
            "candidates": [],
        }
    if not reviewed_semantic_overlap:
        return {
            "status": "INSUFFICIENT_EVIDENCE",
            "reason": "similar_words_alone_are_not_cannibalization_review_required",
            "candidates": [
                {"query_hash": redact_query(q), "pages": pages, "url_count": len(pages)}
                for q, pages in sorted(repeated.items())
            ],
        }
    return {
        "status": "CANNIBALIZATION",
        "reason": "same_nonbrand_intent_repeated_and_reviewed",
        "candidates": [
            {"query_hash": redact_query(q), "pages": pages, "url_count": len(pages)}
            for q, pages in sorted(repeated.items())
        ],
    }


def redact_query(query: str) -> str:
    digest = hashlib.sha256((query or "").encode("utf-8")).hexdigest()
    return f"sha256:{digest[:16]}"


def git_safe_aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Minimized aggregates with hashed queries. No raw query/PII."""
    branded_n = 0
    legacy_n = 0
    nonbrand_n = 0
    impressions = 0.0
    clicks = 0.0
    hashed: list[dict[str, Any]] = []
    for row in rows:
        cls = classify_query(str(row.get("query") or ""))
        if cls["label"] == "brand":
            branded_n += 1
        elif cls["label"] == "legacy_brand":
            legacy_n += 1
        else:
            nonbrand_n += 1
        impressions += float(row.get("impressions") or 0)
        clicks += float(row.get("clicks") or 0)
        hashed.append(
            {
                "date": row.get("date"),
                "query_hash": redact_query(str(row.get("query") or "")),
                "page": row.get("page"),
                "country": row.get("country"),
                "device": row.get("device"),
                "impressions": row.get("impressions"),
                "clicks": row.get("clicks"),
                "ctr": row.get("ctr"),
                "position": row.get("position"),
                "brand_class": cls["label"],
                "brand_class_version": cls["version"],
            }
        )
    return {
        "schema": "gsc_git_safe_aggregate_v1",
        "row_count": len(rows),
        "branded_rows": branded_n,
        "legacy_brand_rows": legacy_n,
        "nonbrand_rows": nonbrand_n,
        "impressions": impressions,
        "clicks": clicks,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "rows": hashed,
    }


def snapshot_manifest(
    *,
    source: str,
    rows: list[dict[str, Any]],
    max_date: str | None,
    latency_ms: int | None,
    ready_for_product_decisions: bool,
    synthetic: bool,
) -> dict[str, Any]:
    payload = json.dumps(
        [{"date": r.get("date"), "page": r.get("page"), "country": r.get("country"),
          "device": r.get("device"), "impressions": r.get("impressions"),
          "clicks": r.get("clicks")} for r in rows],
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return {
        "schema": "gsc_snapshot_manifest_v1",
        "source": source,
        "synthetic": synthetic,
        "ready_for_product_decisions": ready_for_product_decisions,
        "row_count": len(rows),
        "max_date": max_date,
        "latency_ms": latency_ms,
        "content_sha256": digest,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "brand_classification_version": BRAND_CLASSIFICATION_VERSION,
        "window_policy_version": WINDOW_POLICY_VERSION,
    }


FIXTURE_MANIFEST_REL = Path("data/revops/gsc/fixtures/last_fixture_manifest.json")
COMMITTED_GSC_SNAPSHOT_RELS = (
    Path("data/revops/gsc/latest_import.json"),
    Path("data/revops/gsc/imports/import-2026-07-30.json"),
    Path("data/revops/gsc/insights_latest.json"),
    Path("data/ops/gsc-insights.json"),
    Path("netlify/functions/data/gsc-insights.json"),
)


def is_live_gsc_payload(data: dict[str, Any] | None) -> bool:
    data = data or {}
    return (
        data.get("source") == "search_analytics_api"
        and data.get("synthetic") is not True
        and data.get("ready_for_product_decisions") is not False
    )


def stamp_non_live_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    """Historical CSV / fixture payloads cannot drive product decisions."""
    out = dict(payload)
    if is_live_gsc_payload(out):
        out["synthetic"] = False
        out["fixture"] = False
        out["ready_for_product_decisions"] = True
        out["live_baseline_invented"] = False
        return out
    out["synthetic"] = True
    out["fixture"] = True
    out["ready_for_product_decisions"] = False
    out["live_baseline_invented"] = False
    if not out.get("source"):
        out["source"] = out.get("source_dir") or "csv_export"
    return out


def stamp_committed_gsc_snapshots(*, root: Path | None = None) -> dict[str, Any]:
    """Stamp every committed GSC snapshot. Does not invent metrics."""
    root = root or ROOT
    stamped: list[str] = []
    skipped: list[str] = []
    for rel in COMMITTED_GSC_SNAPSHOT_RELS:
        path = root / rel
        if not path.is_file():
            skipped.append(str(rel))
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            skipped.append(str(rel))
            continue
        stamped_payload = stamp_non_live_snapshot(payload)
        path.write_text(
            json.dumps(stamped_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        stamped.append(str(rel))
    return {"ok": True, "stamped": stamped, "skipped": skipped}


def write_last_fixture_manifest(*, root: Path | None = None) -> dict[str, Any]:
    """Persist a git-safe fixture manifest via the shipped snapshot_manifest()."""
    root = root or ROOT
    fixture = root / "data" / "revops" / "gsc" / "fixtures" / "sample_rows.json"
    rows = json.loads(fixture.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("fixture_invalid")
    max_date = max((str(r.get("date") or "1970-01-01") for r in rows), default=None)
    manifest = snapshot_manifest(
        source="fixture",
        rows=rows,
        max_date=max_date,
        latency_ms=0,
        ready_for_product_decisions=False,
        synthetic=True,
    )
    dest = root / FIXTURE_MANIFEST_REL
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "path": str(FIXTURE_MANIFEST_REL), "manifest": manifest}


def credential_presence() -> dict[str, Any]:
    """Detect GSC credential presence without printing secret content."""
    sa = os.environ.get("GSC_CREDENTIALS_JSON")
    secrets = os.environ.get("GSC_CLIENT_SECRETS_JSON")
    token_path = os.environ.get("GSC_TOKEN_JSON")
    site = os.environ.get("GSC_SITE_URL", "sc-domain:confenge.com.br")
    sa_present = bool(sa and sa.strip())
    oauth_present = bool(secrets and token_path)
    return {
        "present": sa_present or oauth_present,
        "mode": "service_account" if sa_present else ("oauth" if oauth_present else None),
        "site": site,
        "env_names": [
            "GSC_SITE_URL",
            "GSC_CREDENTIALS_JSON",
            "GSC_CLIENT_SECRETS_JSON",
            "GSC_TOKEN_JSON",
        ],
        "scope": "https://www.googleapis.com/auth/webmasters.readonly",
        "printed_secret": False,
    }


def enrich_path(path_or_url: str) -> dict[str, str]:
    path = path_or_url
    if path.startswith("http"):
        path = urlparse(path).path or "/"
    cluster, offer = "other", ""
    for rx, c, o in CLUSTER_RULES:
        if rx.search(path) or rx.search(path_or_url):
            cluster, offer = c, o
            break
    intent = "informational"
    if re.search(r"como|o que|quando|checklist|guia", path_or_url, re.I):
        intent = "informational"
    if re.search(r"consultoria|servi[cç]o|pre[cç]o|contratar|or[cç]amento", path_or_url, re.I):
        intent = "commercial"
    if re.search(r"limite|calcular|planilha|modelo", path_or_url, re.I):
        intent = "commercial_investigation"
    return {
        "path": path,
        "cluster": cluster,
        "offer": offer,
        "intent": intent,
        "funnel_stage": "consideration" if intent != "informational" else "awareness",
    }


def read_csv_flexible(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    # Normalize header aliases
    reader = csv.DictReader(text.splitlines())
    rows = []
    for row in reader:
        norm = { (k or "").strip(): (v or "").strip() for k, v in row.items() if k is not None }
        rows.append(norm)
    return rows


def col(row: dict[str, str], *names: str) -> str:
    keys = {k.lower(): k for k in row}
    for n in names:
        if n.lower() in keys:
            return row[keys[n.lower()]]
        for k, orig in keys.items():
            if n.lower() in k:
                return row[orig]
    return ""


def import_csv_dir(src: Path, as_of: str | None = None) -> dict[str, Any]:
    ensure_dirs()
    as_of = as_of or date.today().isoformat()
    queries_file = None
    pages_file = None
    for p in src.rglob("*.csv"):
        name = p.name.lower()
        if "consulta" in name or "quer" in name:
            queries_file = p
        if "pagina" in name or "p[aá]gina" in name or "page" in name:
            pages_file = p
        # Portuguese with accents may be mangled
        if "ginas" in name or name.startswith("p"):
            if pages_file is None and "filtro" not in name and "pais" not in name and "pa" in name:
                pages_file = p
    # Prefer exact known names
    for cand in ("Consultas.csv", "consultas.csv", "Queries.csv"):
        if (src / cand).exists():
            queries_file = src / cand
    for cand in ("Paginas.csv", "Páginas.csv", "Pages.csv"):
        # try variants
        pass
    for p in src.iterdir() if src.is_dir() else []:
        if p.suffix.lower() != ".csv":
            continue
        low = p.name.lower()
        if "consulta" in low:
            queries_file = p
        if "gina" in low or low.startswith("pág") or "pagina" in low:
            pages_file = p

    query_rows: list[dict[str, Any]] = []
    page_rows: list[dict[str, Any]] = []

    if queries_file and queries_file.exists():
        for row in read_csv_flexible(queries_file):
            q = col(row, "Top consultas", "Consultas", "Query", "query", "Consulta")
            if not q:
                continue
            clicks = parse_num(col(row, "Cliques", "Clicks", "clicks"))
            imps = parse_num(col(row, "Impressões", "Impressions", "impressions"))
            ctr = parse_pct(col(row, "CTR", "ctr"))
            pos = parse_num(col(row, "Posição", "Position", "position"))
            enr = enrich_path(q)
            query_rows.append(
                {
                    "date": as_of,
                    "query": q,
                    "page": None,
                    "country": "bra",
                    "device": "all",
                    "impressions": imps,
                    "clicks": clicks,
                    "ctr": ctr if ctr else (clicks / imps if imps else 0),
                    "position": pos,
                    "branded": branded(q),
                    "brand_class": classify_query(q),
                    "cluster": enr["cluster"],
                    "offer": enr["offer"],
                    "intent": enr["intent"],
                    "funnel_stage": enr["funnel_stage"],
                    "source": "csv_export",
                }
            )

    if pages_file and pages_file.exists():
        for row in read_csv_flexible(pages_file):
            page = col(row, "Páginas principais", "Páginas", "Pages", "page", "URL", "Top pages")
            if not page:
                continue
            clicks = parse_num(col(row, "Cliques", "Clicks"))
            imps = parse_num(col(row, "Impressões", "Impressions"))
            ctr = parse_pct(col(row, "CTR"))
            pos = parse_num(col(row, "Posição", "Position"))
            enr = enrich_path(page)
            page_rows.append(
                {
                    "date": as_of,
                    "query": None,
                    "page": page if page.startswith("http") else f"https://confenge.com.br{page}",
                    "path": enr["path"],
                    "country": "bra",
                    "device": "all",
                    "impressions": imps,
                    "clicks": clicks,
                    "ctr": ctr if ctr else (clicks / imps if imps else 0),
                    "position": pos,
                    "branded": False,
                    "cluster": enr["cluster"],
                    "offer": enr["offer"],
                    "intent": enr["intent"],
                    "funnel_stage": enr["funnel_stage"],
                    "source": "csv_export",
                }
            )

    payload = {
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "as_of": as_of,
        "source_dir": str(src.relative_to(ROOT)) if src.is_relative_to(ROOT) else str(src),
        "source": "csv_export",
        "synthetic": True,
        "fixture": True,
        "ready_for_product_decisions": False,
        "live_baseline_invented": False,
        "queries": query_rows,
        "pages": page_rows,
        "query_count": len(query_rows),
        "page_count": len(page_rows),
    }
    out = DATA / "imports" / f"import-{as_of}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    # Also mirror latest
    (DATA / "latest_import.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def load_latest() -> dict[str, Any]:
    p = DATA / "latest_import.json"
    if not p.exists():
        return {"queries": [], "pages": []}
    return json.loads(p.read_text(encoding="utf-8"))


def expected_ctr(position: float) -> float:
    """Rough industry CTR curve — directional only, not scientific claim."""
    if position <= 1:
        return 0.28
    if position <= 2:
        return 0.15
    if position <= 3:
        return 0.11
    if position <= 5:
        return 0.07
    if position <= 10:
        return 0.03
    if position <= 20:
        return 0.01
    return 0.003


def analyze(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data or load_latest()
    queries = data.get("queries") or []
    pages = data.get("pages") or []

    low_ctr = []
    for q in queries:
        imps = float(q.get("impressions") or 0)
        pos = float(q.get("position") or 99)
        ctr = float(q.get("ctr") or 0)
        exp = expected_ctr(pos)
        if imps >= 5 and ctr < exp * 0.5:
            decision = ctr_optimization_decision(imps)
            low_ctr.append(
                {
                    **q,
                    "expected_ctr": exp,
                    "gap": exp - ctr,
                    "ctr_decision": decision["decision"],
                    "optimize_ctr": decision["optimize_ctr"],
                    "data_preserved": True,
                }
            )

    striking_distance = [
        p
        for p in pages
        if 4 <= float(p.get("position") or 0) <= 20 and float(p.get("impressions") or 0) >= 3
    ]

    commercial_no_page = [
        q
        for q in queries
        if q.get("intent") in {"commercial", "commercial_investigation"}
        and float(q.get("impressions") or 0) >= 2
        and not q.get("page")
    ]

    legacy_entity = [
        q
        for q in queries
        if q.get("cluster") == "legacy-entity" or BRAND_TERMS.search(q.get("query") or "") is None
        and re.search(r"\b(avcb|clcb|avalia[cç][aã]o\s*imob|automa[cç][aã]o)\b", q.get("query") or "", re.I)
    ]
    # fix legacy detection
    legacy_entity = [
        q
        for q in queries
        if re.search(r"\b(avcb|clcb|avalia|automa[cç]|nexgen|vision|ia)\b", q.get("query") or "", re.I)
        and not re.search(r"licita|obra|contrato|aditivo|bdi|sinapi", q.get("query") or "", re.I)
    ]

    # Cannibalization: multiple pages same cluster with similar position — weak without query×page
    by_cluster: dict[str, list] = defaultdict(list)
    for p in pages:
        by_cluster[p.get("cluster") or "other"].append(p)

    zero_impr_indexable_note = {
        "status": "needs_coverage_export",
        "note": (
            "Requires index coverage export; not available in performance-only CSV. "
            "Use URL Inspection batch or coverage report separately."
        ),
        "candidates": [
            p
            for p in pages
            if float(p.get("impressions") or 0) == 0 and float(p.get("clicks") or 0) == 0
        ][:20],
    }

    # 5/6 growth vs decay: compare two most recent daily snapshots when present
    growth_pages: list[dict[str, Any]] = []
    decay_pages: list[dict[str, Any]] = []
    daily_dir = DATA / "daily"
    daily_files = sorted(daily_dir.glob("*.json")) if daily_dir.is_dir() else []
    if len(daily_files) >= 2:
        try:
            older = json.loads(daily_files[-2].read_text(encoding="utf-8"))
            newer = json.loads(daily_files[-1].read_text(encoding="utf-8"))
            old_map = {
                (p.get("page") or p.get("path") or ""): float(p.get("impressions") or 0)
                for p in (older.get("pages") or [])
            }
            for p in newer.get("pages") or []:
                key = p.get("page") or p.get("path") or ""
                if not key:
                    continue
                prev = old_map.get(key)
                cur = float(p.get("impressions") or 0)
                if prev is None:
                    continue
                delta = cur - prev
                row = {**p, "impressions_prev": prev, "impressions_delta": delta}
                if delta >= 3:
                    growth_pages.append(row)
                elif delta <= -3:
                    decay_pages.append(row)
            growth_pages = sorted(growth_pages, key=lambda x: -float(x.get("impressions_delta") or 0))[:30]
            decay_pages = sorted(decay_pages, key=lambda x: float(x.get("impressions_delta") or 0))[:30]
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            growth_pages, decay_pages = [], []
    growth_payload: dict[str, Any] = {
        "status": "compared" if growth_pages or decay_pages else "awaiting_multi_day_series",
        "daily_snapshots": len(daily_files),
        "items": growth_pages,
        "note": (
            "Growth/decay compares the two most recent data/revops/gsc/daily/* snapshots. "
            "Run import-csv or pull-api on a schedule to populate."
            if not growth_pages and not decay_pages
            else "Compared two latest daily snapshots (impressions delta ±3)."
        ),
    }
    decay_payload: dict[str, Any] = {
        "status": growth_payload["status"],
        "daily_snapshots": len(daily_files),
        "items": decay_pages,
        "note": growth_payload["note"],
    }

    # 9/10 cohort analyses: page traffic vs local lead store (never query↔lead identity)
    lead_pages: dict[str, int] = defaultdict(int)
    leads_dir = Path(os.environ.get("LEAD_STORE_DIR") or (ROOT / ".leads"))
    if leads_dir.is_dir():
        for lf in leads_dir.glob("*.json"):
            try:
                rec = json.loads(lf.read_text(encoding="utf-8"))
                lp = rec.get("landing_page") or rec.get("page") or ""
                if lp:
                    path = urlparse(lp).path if str(lp).startswith("http") else str(lp)
                    lead_pages[path.rstrip("/") or "/"] += 1
            except (OSError, json.JSONDecodeError, TypeError):
                continue
    page_impr = {
        urlparse(p.get("page") or p.get("path") or "").path.rstrip("/") or "/": float(
            p.get("impressions") or 0
        )
        for p in pages
        if p.get("page") or p.get("path")
    }
    # by cluster traffic without leads
    cluster_impr: dict[str, float] = defaultdict(float)
    cluster_leads: dict[str, int] = defaultdict(int)
    for p in pages:
        c = p.get("cluster") or "other"
        cluster_impr[c] += float(p.get("impressions") or 0)
    for path, n in lead_pages.items():
        enr = enrich_path(path)
        cluster_leads[enr.get("cluster") or "other"] += n
    traffic_no_leads = [
        {
            "cluster": c,
            "impressions": imp,
            "leads_observed": cluster_leads.get(c, 0),
            "note": "cohort only — not query-level attribution",
        }
        for c, imp in sorted(cluster_impr.items(), key=lambda x: -x[1])
        if imp >= 5 and cluster_leads.get(c, 0) == 0
    ][:20]
    leads_low_traffic = [
        {
            "path": path,
            "leads_observed": n,
            "impressions": page_impr.get(path, 0),
            "note": "cohort only — high commercial signal relative to GSC impressions",
        }
        for path, n in sorted(lead_pages.items(), key=lambda x: -x[1])
        if n >= 1 and page_impr.get(path, 0) < 10
    ][:20]

    # 12 competitor / content gap proxy: commercial queries without strong on-site page match
    known_paths = " ".join((p.get("page") or p.get("path") or "") for p in pages)
    competitor_gaps = []
    for q in queries:
        if q.get("intent") not in {"commercial", "commercial_investigation"}:
            continue
        if float(q.get("impressions") or 0) < 2:
            continue
        terms = [t for t in re.split(r"\W+", (q.get("query") or "").lower()) if len(t) > 3]
        hits = sum(1 for t in terms if t in known_paths.lower())
        if hits < max(1, len(terms) // 3):
            competitor_gaps.append(
                {
                    **q,
                    "gap_type": "commercial_query_weak_on_site_match",
                    "matched_path_tokens": hits,
                    "note": (
                        "Proxy gap vs SERP competitors (no third-party scrape). "
                        "Prioritize own content/tool that owns this intent."
                    ),
                }
            )
    competitor_gaps = sorted(
        competitor_gaps, key=lambda x: -float(x.get("impressions") or 0)
    )[:30]

    insights = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of": data.get("as_of"),
        "source": data.get("source_dir") or data.get("source"),
        "attribution_warning": (
            "Search Console is aggregate. Never claim that query X produced lead Y. "
            "Use cohort analysis (page → leads) only."
        ),
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "brand_classification_version": BRAND_CLASSIFICATION_VERSION,
        "synthetic": not is_live_gsc_payload(data),
        "fixture": not is_live_gsc_payload(data),
        "ready_for_product_decisions": is_live_gsc_payload(data),
        "live_baseline_invented": False,
        "counts": {
            "queries": len(queries),
            "pages": len(pages),
            "branded_queries": sum(1 for q in queries if q.get("branded")),
            "nonbranded_queries": sum(1 for q in queries if not q.get("branded")),
            "analysis_keys": 12,
            "lead_cohort_paths": len(lead_pages),
        },
        "analyses": {
            "1_high_impressions_low_ctr": sorted(low_ctr, key=lambda x: -float(x.get("impressions") or 0))[:30],
            "2_striking_distance_pos_4_20": sorted(
                striking_distance, key=lambda x: float(x.get("position") or 99)
            )[:30],
            "3_commercial_queries_without_page_join": commercial_no_page[:30],
            "4_cluster_page_competition": {
                k: sorted(v, key=lambda x: -float(x.get("impressions") or 0))[:5]
                for k, v in by_cluster.items()
                if len(v) > 1
            },
            "5_content_growing": growth_payload,
            "6_content_decaying": decay_payload,
            "7_indexed_without_impressions": zero_impr_indexable_note,
            "8_informational_to_offer": [
                p for p in pages if p.get("intent") == "informational" and float(p.get("clicks") or 0) > 0
            ][:20],
            "9_clusters_traffic_without_leads": {
                "status": "cohort_ready" if lead_pages else "awaiting_leads_or_empty_cohort",
                "items": traffic_no_leads,
                "note": (
                    "Cohort only (cluster impressions vs landing_page lead counts). "
                    "Set LEAD_STORE_DIR or use .leads/ for local join; never query↔lead."
                ),
            },
            "10_pages_leads_low_traffic": {
                "status": "cohort_ready" if lead_pages else "awaiting_leads_or_empty_cohort",
                "items": leads_low_traffic,
                "note": "Cohort only — pages/paths with leads despite low GSC impressions.",
            },
            "11_emerging_terms": sorted(queries, key=lambda x: -float(x.get("impressions") or 0))[:15],
            "12_competitor_content_gaps": competitor_gaps,
            "legacy_entity_queries_still_ranking": legacy_entity,
        },
        "priority_actions": [],
    }

    # Priority actions from data — CTR optimization refused below 100 impressions.
    for q in insights["analyses"]["1_high_impressions_low_ctr"][:5]:
        decision = q.get("ctr_decision") or ctr_optimization_decision(q.get("impressions")).get("decision")
        insights["priority_actions"].append(
            {
                "type": "ctr_title_meta",
                "query": q.get("query"),
                "impressions": q.get("impressions"),
                "position": q.get("position"),
                "ctr_decision": decision,
                "optimize_ctr": decision == "ALLOWED",
                "why": (
                    "impressions with CTR below expected curve"
                    if decision == "ALLOWED"
                    else "INSUFFICIENT_EVIDENCE: denominator below 100 impressions — data preserved, no CTR change"
                ),
            }
        )
    for p in insights["analyses"]["2_striking_distance_pos_4_20"][:5]:
        insights["priority_actions"].append(
            {
                "type": "content_refresh",
                "page": p.get("page") or p.get("path"),
                "position": p.get("position"),
                "impressions": p.get("impressions"),
                "why": "page in positions 4–20 with room to gain",
            }
        )
    for q in legacy_entity[:5]:
        insights["priority_actions"].append(
            {
                "type": "entity_cleanup_gsc",
                "query": q.get("query"),
                "why": "legacy entity query still receiving impressions — reinforce 410 + GSC removal",
            }
        )

    out = DATA / "insights_latest.json"
    out.write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
    # Private ops copies only — never publish as static public (auth via ops?action=gsc_insights)
    private_targets = [
        ROOT / "data" / "ops" / "gsc-insights.json",
        ROOT / "netlify" / "functions" / "data" / "gsc-insights.json",
    ]
    for ops_out in private_targets:
        ops_out.parent.mkdir(parents=True, exist_ok=True)
        ops_out.write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
    # Remove legacy public static path if present
    legacy = ROOT / "ops" / "data" / "gsc-insights.json"
    if legacy.is_file():
        try:
            legacy.unlink()
        except OSError:
            pass
    return insights


def _gsc_credentials():
    """Resolve GSC credentials from env. Returns (creds, error_dict)."""
    site = os.environ.get("GSC_SITE_URL", "sc-domain:confenge.com.br")
    sa = os.environ.get("GSC_CREDENTIALS_JSON")
    secrets = os.environ.get("GSC_CLIENT_SECRETS_JSON")
    token_path = os.environ.get("GSC_TOKEN_JSON")

    if not sa and not (secrets and token_path):
        return None, {
            "ok": False,
            "error": "missing_credentials",
            "required_env": [
                "GSC_SITE_URL",
                "GSC_CREDENTIALS_JSON (service account path or JSON) OR (GSC_CLIENT_SECRETS_JSON + GSC_TOKEN_JSON)",
            ],
            "fallback": "python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-YYYY-MM-DD",
            "site": site,
        }

    try:
        from google.oauth2 import service_account
    except ImportError:
        return None, {
            "ok": False,
            "error": "google_api_client_not_installed",
            "install": "pip install google-api-python-client google-auth",
        }

    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    if sa:
        # Allow raw JSON content in env (CI secret) or file path
        if sa.strip().startswith("{"):
            import tempfile

            tmp = Path(tempfile.gettempdir()) / "gsc-sa-inline.json"
            tmp.write_text(sa, encoding="utf-8")
            sa_path = str(tmp)
        else:
            sa_path = sa
        creds = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
        return (creds, site), None
    return None, {
        "ok": False,
        "error": "oauth_flow_not_automated_here",
        "note": "Use service account GSC_CREDENTIALS_JSON for unattended pull",
    }


def pull_api(days: int = 28, *, reprocess_days: int = 3, row_limit: int = 25000) -> dict[str, Any]:
    """Pull Search Analytics via Google API when credentials exist.

    Incremental features:
      - reprocess last N days to absorb GSC lag
      - pagination via startRow
      - dedupe by (date, query, page, country, device)
      - history under data/revops/gsc/daily/
      - gap detection vs previous last_sync window
      - last_sync timestamp written to last_sync.json
    """
    resolved, err = _gsc_credentials()
    if err:
        return err
    creds, site = resolved

    try:
        from googleapiclient.discovery import build
    except ImportError:
        return {
            "ok": False,
            "error": "google_api_client_not_installed",
            "install": "pip install google-api-python-client google-auth",
        }

    end = date.today() - timedelta(days=3)  # GSC lag
    start = end - timedelta(days=max(days, reprocess_days))
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    started = time.monotonic()

    dimensions = ["date", "query", "page", "country", "device"]
    rows_out: list[dict[str, Any]] = []
    start_row = 0
    pages_fetched = 0
    while True:
        body = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": dimensions,
            "rowLimit": row_limit,
            "startRow": start_row,
        }
        resp = service.searchanalytics().query(siteUrl=site, body=body).execute()
        batch = resp.get("rows") or []
        pages_fetched += 1
        for row in batch:
            keys = row.get("keys") or []
            q = keys[1] if len(keys) > 1 else ""
            page = keys[2] if len(keys) > 2 else ""
            enr = enrich_path(page or q)
            rows_out.append(
                {
                    "date": keys[0] if keys else None,
                    "query": q,
                    "page": page,
                    "country": keys[3] if len(keys) > 3 else None,
                    "device": keys[4] if len(keys) > 4 else None,
                    "impressions": row.get("impressions", 0),
                    "clicks": row.get("clicks", 0),
                    "ctr": row.get("ctr", 0),
                    "position": row.get("position", 0),
                    "branded": branded(q),
                    "brand_class": classify_query(q),
                    **enr,
                    "source": "search_analytics_api",
                }
            )
        if len(batch) < row_limit:
            break
        start_row += row_limit
        if pages_fetched > 40:  # hard safety
            break

    # Dedupe
    seen: set[tuple] = set()
    deduped: list[dict[str, Any]] = []
    for r in rows_out:
        key = (r.get("date"), r.get("query"), r.get("page"), r.get("country"), r.get("device"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    ensure_dirs()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    latency_ms = int((time.monotonic() - started) * 1000)
    provider_dates = [r.get("date") for r in deduped if r.get("date")]
    max_date = max(provider_dates) if provider_dates else end.isoformat()
    last_sync_at = datetime.now(timezone.utc).isoformat()
    windows = complete_windows(
        today=date.today(),
        provider_max_date=date.fromisoformat(str(max_date)),
    )
    manifest = snapshot_manifest(
        source="search_analytics_api",
        rows=deduped,
        max_date=str(max_date),
        latency_ms=latency_ms,
        ready_for_product_decisions=True,
        synthetic=False,
    )
    payload = {
        "imported_at": last_sync_at,
        "as_of": end.isoformat(),
        "source": "search_analytics_api",
        "site": site,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "reprocess_days": reprocess_days,
        "queries": deduped,
        "pages": [],
        "query_count": len(deduped),
        "page_count": 0,
        "pages_fetched": pages_fetched,
        "is_current": True,
        "max_date": max_date,
        "latency_ms": latency_ms,
        "windows": windows,
        "manifest": manifest,
        "ready_for_product_decisions": True,
        "synthetic": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "note": "API pull is current. July CSV snapshot is historical only.",
    }
    (DATA / "latest_import.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    day_path = DATA / "daily" / f"{end.isoformat()}.json"
    day_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    # Gap detection: missing calendar days in daily/ history
    gaps = detect_gsc_gaps(start, end)
    last_sync = {
        "last_sync_at": last_sync_at,
        "as_of": end.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "rows": len(deduped),
        "pages_fetched": pages_fetched,
        "gaps": gaps,
        "site": site,
        "source": "search_analytics_api",
        "max_date": max_date,
        "latency_ms": latency_ms,
        "ready_for_product_decisions": True,
        "synthetic": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
    }
    (DATA / "last_sync.json").write_text(json.dumps(last_sync, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Refresh private ops insights from latest import (analyze writes private copies)
    try:
        analyze(payload)
    except Exception as exc:  # noqa: BLE001
        last_sync["analyze_error"] = str(exc)[:200]
        (DATA / "last_sync.json").write_text(
            json.dumps(last_sync, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    (PRIVATE_DIR / "latest-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "ok": True,
        "rows": len(deduped),
        "path": str(day_path.relative_to(ROOT)),
        "last_sync": last_sync_at,
        "gaps": gaps,
        "pages_fetched": pages_fetched,
        "max_date": max_date,
        "latency_ms": latency_ms,
        "ready_for_product_decisions": True,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
    }


def detect_gsc_gaps(start: date, end: date) -> list[str]:
    """List dates in [start, end] with no daily history file."""
    ensure_dirs()
    daily = DATA / "daily"
    gaps: list[str] = []
    cur = start
    while cur <= end:
        if not (daily / f"{cur.isoformat()}.json").is_file():
            gaps.append(cur.isoformat())
        cur += timedelta(days=1)
    return gaps


def sync_incremental(
    days: int = 28,
    reprocess_days: int = 3,
    *,
    allow_missing_creds: bool = False,
    use_fixture: bool = False,
) -> dict[str, Any]:
    """Primary scheduled entry: pull API or fixture; never invent series."""
    ensure_dirs()
    if use_fixture or os.environ.get("GSC_USE_FIXTURE") == "1":
        return sync_from_fixture()
    result = pull_api(days=days, reprocess_days=reprocess_days)
    if result.get("error") == "missing_credentials" and allow_missing_creds:
        # Record blocked state without fabricating metrics
        blocked = {
            "last_sync_at": None,
            "blocked": True,
            "error": "missing_credentials",
            "required_env": result.get("required_env"),
            "ready_for_product_decisions": False,
            "synthetic": False,
            "live_baseline_invented": False,
            "note": "July 2026 CSV snapshot is historical only — not continuous current data.",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        (DATA / "last_sync.json").write_text(
            json.dumps(blocked, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return result
    return result


def sync_from_fixture() -> dict[str, Any]:
    """Validate sync pipeline with committed fixture (no invented live metrics)."""
    ensure_dirs()
    fixture = ROOT / "data" / "revops" / "gsc" / "fixtures" / "sample_rows.json"
    if not fixture.is_file():
        return {"ok": False, "error": "fixture_missing", "path": str(fixture.relative_to(ROOT))}
    rows = json.loads(fixture.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        return {"ok": False, "error": "fixture_invalid"}
    # Dedupe + store like API path
    seen: set[tuple] = set()
    deduped = []
    for r in rows:
        key = (r.get("date"), r.get("query"), r.get("page"), r.get("country"), r.get("device"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    as_of = max((r.get("date") or "1970-01-01") for r in deduped) if deduped else date.today().isoformat()
    last_sync_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    classified = []
    for row in deduped:
        item = dict(row)
        item["branded"] = branded(str(row.get("query") or ""))
        item["brand_class"] = classify_query(str(row.get("query") or ""))
        classified.append(item)
    latency_ms = int((time.monotonic() - started) * 1000)
    windows = complete_windows(
        today=date.today(),
        provider_max_date=date.fromisoformat(str(as_of)),
    )
    manifest = snapshot_manifest(
        source="fixture",
        rows=classified,
        max_date=str(as_of),
        latency_ms=latency_ms,
        ready_for_product_decisions=False,
        synthetic=True,
    )
    payload = {
        "imported_at": last_sync_at,
        "as_of": as_of,
        "source": "fixture",
        "synthetic": True,
        "fixture": True,
        "ready_for_product_decisions": False,
        "live_baseline_invented": False,
        "max_date": as_of,
        "latency_ms": latency_ms,
        "windows": windows,
        "manifest": manifest,
        "queries": classified,
        "query_count": len(classified),
        "is_current": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "note": "Fixture for pipeline validation only — not production GSC data.",
    }
    (DATA / "latest_import.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "last_sync.json").write_text(
        json.dumps(
            {
                "last_sync_at": last_sync_at,
                "as_of": as_of,
                "rows": len(classified),
                "source": "fixture",
                "synthetic": True,
                "ready_for_product_decisions": False,
                "max_date": as_of,
                "latency_ms": latency_ms,
                "gaps": [],
                "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
                "manifest_sha256": manifest["content_sha256"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "ok": True,
        "rows": len(classified),
        "last_sync": last_sync_at,
        "source": "fixture",
        "synthetic": True,
        "ready_for_product_decisions": False,
        "max_date": as_of,
        "latency_ms": latency_ms,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CONFENGE Search Demand Observatory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_imp = sub.add_parser("import-csv", help="Import GSC UI CSV export directory")
    p_imp.add_argument("--dir", required=True, type=Path)
    p_imp.add_argument("--as-of", default=None)

    sub.add_parser("analyze", help="Run automatic analyses on latest import")
    p_api = sub.add_parser("pull-api", help="Pull Search Analytics API (needs credentials)")
    p_api.add_argument("--days", type=int, default=28)
    p_api.add_argument("--reprocess-days", type=int, default=3)
    p_api.add_argument(
        "--smoke",
        action="store_true",
        help="Print a one-line status without dumping JSON or secrets",
    )

    p_inspect = sub.add_parser("inspect-urls", help="Read-only URL Inspection (never Indexing API)")
    p_inspect.add_argument("--url", action="append", default=[], help="canonical URL (repeatable)")
    p_inspect.add_argument("--smoke", action="store_true")

    p_sync = sub.add_parser("sync", help="Incremental GSC sync (scheduled entry)")
    p_sync.add_argument("--days", type=int, default=28)
    p_sync.add_argument("--reprocess-days", type=int, default=3)
    p_sync.add_argument(
        "--allow-missing-creds",
        action="store_true",
        help="Exit 0 with blocked state when GSC_CREDENTIALS_JSON missing",
    )
    p_sync.add_argument(
        "--fixture",
        action="store_true",
        help="Run pipeline against committed fixture (no live API)",
    )
    p_sync.add_argument(
        "--smoke",
        action="store_true",
        help="Print a one-line status without dumping JSON or secrets",
    )

    p_cand = sub.add_parser(
        "candidates",
        help="Emit demand-engine candidate/rejection registry from a versioned snapshot",
    )
    p_cand.add_argument("--dir", default=None, help="GSC CSV snapshot directory")
    p_cand.add_argument("--rows", default=None, help="JSON 5-tuple dump")
    p_cand.add_argument("--out", type=Path, default=DATA / "demand-candidates.json")

    p_dash = sub.add_parser("dashboard", help="Write ops dashboard JSON")
    p_dash.add_argument("--out", type=Path, default=ROOT / "data" / "ops" / "gsc-insights.json")

    sub.add_parser(
        "stamp-snapshots",
        help="Mark committed GSC snapshots synthetic/fixture and not product-ready",
    )

    args = parser.parse_args(argv)

    if args.cmd == "import-csv":
        src = args.dir if args.dir.is_absolute() else ROOT / args.dir
        if not src.exists():
            print(json.dumps({"ok": False, "error": "dir_not_found", "dir": str(src)}))
            return 1
        payload = import_csv_dir(src, args.as_of)
        insights = analyze(payload)
        print(
            json.dumps(
                {
                    "ok": True,
                    "queries": payload["query_count"],
                    "pages": payload["page_count"],
                    "priority_actions": len(insights["priority_actions"]),
                    "legacy_entity_queries": len(
                        insights["analyses"]["legacy_entity_queries_still_ranking"]
                    ),
                },
                ensure_ascii=False,
            )
        )
        return 0

    if args.cmd == "analyze":
        insights = analyze()
        print(
            json.dumps(
                {
                    "ok": True,
                    "counts": insights["counts"],
                    "priority_actions": insights["priority_actions"][:10],
                    "legacy": insights["analyses"]["legacy_entity_queries_still_ranking"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if args.cmd == "pull-api":
        result = pull_api(args.days, reprocess_days=getattr(args, "reprocess_days", 3))
        if getattr(args, "smoke", False):
            print(
                "GSC_SMOKE ok={ok} error={err} site={site} rows={rows} max_date={max_date} "
                "ready_for_product_decisions={ready}".format(
                    ok=str(bool(result.get("ok"))).lower(),
                    err=result.get("error") or "none",
                    site=result.get("site") or os.environ.get("GSC_SITE_URL", "sc-domain:confenge.com.br"),
                    rows=result.get("rows", 0),
                    max_date=result.get("max_date") or "none",
                    ready=str(bool(result.get("ready_for_product_decisions"))).lower(),
                )
            )
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get("ok"):
            return 0
        return 2  # soft external blocker

    if args.cmd == "inspect-urls":
        from scripts.discovery.url_inspection import inspect_urls

        urls = list(args.url or [])
        result = inspect_urls(urls)
        if getattr(args, "smoke", False):
            print(
                "GSC_INSPECT_SMOKE ok={ok} error={err} inspected={n} indexing_api_called=false".format(
                    ok=str(bool(result.get("ok"))).lower(),
                    err=result.get("error") or "none",
                    n=len(result.get("inspections") or []),
                )
            )
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("ok") or result.get("error") == "missing_credentials" else 2

    if args.cmd == "sync":
        result = sync_incremental(
            days=args.days,
            reprocess_days=args.reprocess_days,
            allow_missing_creds=args.allow_missing_creds,
            use_fixture=args.fixture,
        )
        if getattr(args, "smoke", False):
            print(
                "GSC_SMOKE ok={ok} error={err} source={src} max_date={max_date} "
                "ready_for_product_decisions={ready} synthetic={syn}".format(
                    ok=str(bool(result.get("ok"))).lower(),
                    err=result.get("error") or "none",
                    src=result.get("source") or "api",
                    max_date=result.get("max_date") or "none",
                    ready=str(bool(result.get("ready_for_product_decisions"))).lower(),
                    syn=str(bool(result.get("synthetic"))).lower(),
                )
            )
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get("ok"):
            return 0
        if args.allow_missing_creds and result.get("error") == "missing_credentials":
            return 0  # external blocker recorded; schedule continues
        return 2

    if args.cmd == "candidates":
        from scripts.organic.demand_engine import run_demand_engine, write_document

        gsc_dir = Path(args.dir) if args.dir else None
        if gsc_dir and not gsc_dir.is_absolute():
            gsc_dir = ROOT / gsc_dir
        rows = None
        if args.rows:
            payload = json.loads(Path(args.rows).read_text(encoding="utf-8"))
            rows = payload if isinstance(payload, list) else payload.get("rows")
        if gsc_dir is None and rows is None:
            gsc_dir = ROOT / "seo" / "gsc-2026-07-30"
        doc = run_demand_engine(gsc_dir=gsc_dir, rows=rows)
        write_document(doc, args.out, generated_at=datetime.now(timezone.utc).isoformat())
        print(
            json.dumps(
                {
                    "ok": True,
                    "out": str(args.out),
                    "snapshot_id": doc["snapshot_id"],
                    "join_status": doc["join_status"],
                    "counts": doc["counts"],
                    "authorized_pages": doc["authorized_pages"],
                },
                ensure_ascii=False,
            )
        )
        return 0

    if args.cmd == "dashboard":
        insights = analyze()
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"ok": True, "out": str(args.out)}))
        return 0

    if args.cmd == "stamp-snapshots":
        stamped = stamp_committed_gsc_snapshots()
        manifest = write_last_fixture_manifest()
        print(
            "GSC_STAMP stamped={n} manifest={path} ready_for_product_decisions=false".format(
                n=len(stamped.get("stamped") or []),
                path=manifest.get("path"),
            )
        )
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
