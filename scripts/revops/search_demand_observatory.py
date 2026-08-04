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
  python3 scripts/revops/search_demand_observatory.py dashboard --out ops/data/gsc-insights.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "revops" / "gsc"
BRAND_TERMS = re.compile(
    r"\b(confenge|coenge|consenge|conenge|smartenge|tiago\s*sasaki)\b",
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


def branded(query: str) -> bool:
    return bool(BRAND_TERMS.search(query or ""))


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
            low_ctr.append({**q, "expected_ctr": exp, "gap": exp - ctr})

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

    # Priority actions from data
    for q in insights["analyses"]["1_high_impressions_low_ctr"][:5]:
        insights["priority_actions"].append(
            {
                "type": "ctr_title_meta",
                "query": q.get("query"),
                "impressions": q.get("impressions"),
                "position": q.get("position"),
                "why": "impressions with CTR below expected curve",
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
    # Public-safe ops copy (no secrets)
    ops_out = ROOT / "ops" / "data" / "gsc-insights.json"
    ops_out.parent.mkdir(parents=True, exist_ok=True)
    ops_out.write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
    return insights


def pull_api(days: int = 28) -> dict[str, Any]:
    """Pull Search Analytics via Google API when credentials exist."""
    site = os.environ.get("GSC_SITE_URL", "sc-domain:confenge.com.br")
    sa = os.environ.get("GSC_CREDENTIALS_JSON")
    secrets = os.environ.get("GSC_CLIENT_SECRETS_JSON")
    token_path = os.environ.get("GSC_TOKEN_JSON")

    if not sa and not (secrets and token_path):
        return {
            "ok": False,
            "error": "missing_credentials",
            "required_env": [
                "GSC_SITE_URL",
                "GSC_CREDENTIALS_JSON (service account) OR (GSC_CLIENT_SECRETS_JSON + GSC_TOKEN_JSON)",
            ],
            "fallback": "python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-YYYY-MM-DD",
        }

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        return {
            "ok": False,
            "error": "google_api_client_not_installed",
            "install": "pip install google-api-python-client google-auth",
        }

    end = date.today() - timedelta(days=3)  # GSC lag
    start = end - timedelta(days=days)
    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]

    if sa:
        creds = service_account.Credentials.from_service_account_file(sa, scopes=scopes)
    else:
        return {
            "ok": False,
            "error": "oauth_flow_not_automated_here",
            "note": "Use service account GSC_CREDENTIALS_JSON for unattended pull",
        }

    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    body = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "dimensions": ["date", "query", "page", "country", "device"],
        "rowLimit": 25000,
    }
    resp = service.searchanalytics().query(siteUrl=site, body=body).execute()
    rows_out = []
    for row in resp.get("rows") or []:
        keys = row.get("keys") or []
        # date, query, page, country, device
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
                **enr,
                "source": "search_analytics_api",
            }
        )

    ensure_dirs()
    payload = {
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "as_of": end.isoformat(),
        "source": "search_analytics_api",
        "site": site,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "queries": rows_out,  # full grain rows
        "pages": [],
        "query_count": len(rows_out),
        "page_count": 0,
    }
    (DATA / "latest_import.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    day_path = DATA / "daily" / f"{end.isoformat()}.json"
    day_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "rows": len(rows_out), "path": str(day_path.relative_to(ROOT))}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CONFENGE Search Demand Observatory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_imp = sub.add_parser("import-csv", help="Import GSC UI CSV export directory")
    p_imp.add_argument("--dir", required=True, type=Path)
    p_imp.add_argument("--as-of", default=None)

    sub.add_parser("analyze", help="Run automatic analyses on latest import")
    p_api = sub.add_parser("pull-api", help="Pull Search Analytics API (needs credentials)")
    p_api.add_argument("--days", type=int, default=28)

    p_dash = sub.add_parser("dashboard", help="Write ops dashboard JSON")
    p_dash.add_argument("--out", type=Path, default=ROOT / "ops" / "data" / "gsc-insights.json")

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
        result = pull_api(args.days)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get("ok"):
            analyze()
            return 0
        return 2  # soft external blocker

    if args.cmd == "dashboard":
        insights = analyze()
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"ok": True, "out": str(args.out)}))
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
