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
import subprocess
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.revops.gsc_history import (  # noqa: E402
    GSC_READINESS_CONTRACT,
    HistoryStateError,
    build_observation,
    merge_observation,
    read_history,
    record_failed_attempt,
    write_history,
)

DATA = ROOT / "data" / "revops" / "gsc"
PRIVATE_DIR = DATA / "private"
HISTORY_PATH = DATA / "history.json"
BRAND_CLASSIFICATION_VERSION = "brand-class/v1"
WINDOW_POLICY_VERSION = "complete-days/v1"
PROPERTY_TZ = ZoneInfo("America/Sao_Paulo")
CTR_MIN_IMPRESSIONS = 100
SEARCH_ANALYTICS_LIMITATION = (
    "Search Analytics may return top rows only and is not an exhaustive total. "
    "Row counts describe the returned set, not the property universe."
)


def load_host_leads(store_dir: Path) -> list[dict[str, Any]]:
    """Read via the canonical adapter so filenames and envelopes remain opaque."""
    if not store_dir.is_dir():
        return []
    script = r"""
const path = require('path');
const { FileStore } = require(path.join(process.cwd(), 'netlify/functions/lib/lead-store.cjs'));
(async () => process.stdout.write(JSON.stringify(await new FileStore(path.resolve(process.argv[1])).list())))()
  .catch((error) => { process.stderr.write(String(error && (error.code || error.message) || error)); process.exit(1); });
"""
    result = subprocess.run(
        ["node", "-e", script, str(store_dir.resolve())],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"lead store unavailable: {(result.stderr or 'unknown error')[:200]}")
    payload = json.loads(result.stdout or "[]")
    return payload if isinstance(payload, list) else []
SNAPSHOT_SOURCE_KINDS = (
    "search_analytics_api",
    "historical_csv_export",
    "fixture",
    "absence",
    "credential_failure",
    "search_analytics_top_row_truncation",
)
LIVE_SOURCE_KINDS = frozenset(
    {"search_analytics_api", "search_analytics_top_row_truncation"}
)
URL_FUNNEL_STATUSES = (
    "ELIGIBLE",
    "APPEARED",
    "CLICKED",
    "ENGAGED",
    "LEAD",
    "PIPELINE",
    "UNKNOWN",
)
QUEUE_MAX = 3
QUEUE_OWNER = "tiago.sasaki"
REQUIRED_GSC_ENV = (
    "GSC_SITE_URL",
    "GSC_CREDENTIALS_JSON",
    "GSC_CLIENT_SECRETS_JSON",
    "GSC_TOKEN_JSON",
)
CREDENTIAL_BLOCKER_ACTION = (
    "Set GitHub Actions secrets GSC_CREDENTIALS_JSON (Search Console service-account JSON) "
    "and GSC_SITE_URL=sc-domain:confenge.com.br (or https://confenge.com.br/). "
    "Grant that service account Search Console read on the property. "
    "Do not paste the JSON into the repository."
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


# Paths/families that must not appear as change-now (active experiments + excluded products).
CHANGE_NOW_EXCLUSIONS: tuple[tuple[str, str], ...] = (
    ("/conteudos/sinapi-desonerado-nao-desonerado/", "#126"),
    ("/conteudos/chuva-prorrogacao-prazo-obra-publica/", "#127"),
    ("/conteudos/aditivo-qualitativo-quantitativo/", "#127"),
    ("/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/", "#127"),
    ("/aditivos-obras-publicas/", "#128"),
    ("/medicoes-glosas-obras-publicas/", "#128"),
    ("/reequilibrio-obras-publicas/", "#128"),
    ("/auditoria-orcamento-licitacao/", "#128"),
    ("/diagnostico-b2g-360/", "#128"),
    ("/diagnostico-pre-licitacao/", "#128"),
    ("/ferramentas/diagnostico-defesa-margem/", "#60"),
    ("/analises-contratos-publicos/", "#83"),
    ("/inteligencia/valor-tipico-contratos-pavimentacao/", "#84"),
    ("/inteligencia/cenarios/", "#84"),
    ("/internal/data-desk/", "#89"),
    ("/ofertas/", "checkout"),
    ("/checkout", "checkout"),
    ("smartlic", "SmartLic"),
)


def env_nonempty(name: str) -> str | None:
    """GitHub Actions injects unset secrets as empty strings. Empty is absent."""
    raw = os.environ.get(name)
    if raw is None:
        return None
    stripped = raw.strip()
    return stripped or None


def property_today() -> date:
    return datetime.now(PROPERTY_TZ).date()


def optional_metric(row: dict[str, Any], key: str) -> float | None:
    """Missing metrics stay None. Presence of numeric zero is preserved."""
    if key not in row or row.get(key) is None:
        return None
    try:
        return float(row[key])
    except (TypeError, ValueError):
        return None


def exclusion_for_url(url_or_path: str) -> str | None:
    blob = (url_or_path or "").lower()
    path = _path_of(url_or_path)
    for prefix, reason in CHANGE_NOW_EXCLUSIONS:
        if prefix.startswith("/") and (path.startswith(prefix) or prefix.rstrip("/") in path):
            return reason
        if not prefix.startswith("/") and prefix in blob:
            return reason
    return None


def classify_snapshot_source(payload: dict[str, Any] | None) -> str:
    """Exactly one of SNAPSHOT_SOURCE_KINDS. Fixture/CSV/history is never live API."""
    data = payload or {}
    explicit = data.get("source_kind")
    if explicit in SNAPSHOT_SOURCE_KINDS:
        if explicit in LIVE_SOURCE_KINDS and (
            data.get("synthetic") is True or data.get("fixture") is True or data.get("historical") is True
        ):
            return "fixture" if data.get("fixture") is True else "historical_csv_export"
        return str(explicit)
    err = data.get("error")
    if err in {"missing_credentials", "invalid_credentials", "credential_failure"}:
        return "credential_failure"
    if data.get("blocked") is True and not data.get("ok"):
        return "credential_failure"
    if data.get("truncated") is True or data.get("top_row_truncation") is True:
        if data.get("synthetic") is True or data.get("fixture") is True:
            return "fixture"
        return "search_analytics_top_row_truncation"
    if data.get("source") == "fixture" or data.get("fixture") is True:
        return "fixture"
    if data.get("historical") is True or data.get("source") in {
        "csv_export",
        "csv",
        "historical_csv_export",
    }:
        return "historical_csv_export"
    src = str(data.get("source") or data.get("source_dir") or "")
    if src.startswith("seo/gsc"):
        return "historical_csv_export"
    if data.get("source") == "search_analytics_api" and data.get("synthetic") is not True:
        return "search_analytics_api"
    if not data or (data.get("ok") is False and not data.get("queries") and not data.get("pages")):
        return "absence"
    if data.get("queries") is None and data.get("pages") is None and data.get("row_count") is None:
        return "absence"
    return "absence"


def snapshot_freshness(
    payload: dict[str, Any] | None,
    *,
    today: date | None = None,
) -> str:
    """CURRENT | STALE | BLOCKED | NOT_CURRENT. Stale live is not a current decision source."""
    data = payload or {}
    kind = classify_snapshot_source(data)
    if kind == "credential_failure" or data.get("blocked") is True:
        return "BLOCKED"
    if kind in {"fixture", "historical_csv_export", "absence"}:
        return "NOT_CURRENT"
    today = today or property_today()
    provider_max = data.get("max_date") or data.get("as_of") or data.get("end")
    if not provider_max:
        return "STALE"
    try:
        max_day = date.fromisoformat(str(provider_max)[:10])
    except ValueError:
        return "STALE"
    # Search Analytics typically lags ~2–3 days. Compare snapshot max to expected complete day.
    expected_end = today - timedelta(days=3)
    if max_day < expected_end - timedelta(days=1):
        return "STALE"
    return "CURRENT"


def credential_blocker_record(*, site: str | None = None) -> dict[str, Any]:
    """Exact external blocker. No invented metrics. Absence is not zero."""
    site_value = site or env_nonempty("GSC_SITE_URL")
    return {
        "ok": False,
        "blocked": True,
        "error": "missing_credentials",
        "source_kind": "credential_failure",
        "source": "credential_failure",
        "synthetic": False,
        "fixture": False,
        "historical": False,
        "ready_for_product_decisions": False,
        "live_baseline_invented": False,
        "performance_status": "UNKNOWN",
        "last_sync_at": None,
        "rows": None,
        "impressions": None,
        "clicks": None,
        "query_count": None,
        "site": site_value,
        "required_env": list(REQUIRED_GSC_ENV),
        "required_secret": "GSC_CREDENTIALS_JSON",
        "required_secret_alt": "GSC_CLIENT_SECRETS_JSON + GSC_TOKEN_JSON",
        "required_site": "GSC_SITE_URL",
        "scope": "https://www.googleapis.com/auth/webmasters.readonly",
        "printed_secret": False,
        "env_presence": {name: bool(env_nonempty(name)) for name in REQUIRED_GSC_ENV},
        "consequence": (
            "Search Analytics live loop cannot run. Historical CSV and fixtures stay "
            "non-live. Product decisions from GSC remain blocked."
        ),
        "external_action": CREDENTIAL_BLOCKER_ACTION,
        "fallback": "python3 scripts/revops/search_demand_observatory.py import-csv --dir seo/gsc-YYYY-MM-DD",
        "note": "July/August 2026 CSV snapshots are historical only — not continuous current data.",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "America/Sao_Paulo",
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
    }


def write_blocked_last_sync(record: dict[str, Any] | None = None) -> dict[str, Any]:
    ensure_dirs()
    payload = dict(record or credential_blocker_record())
    attempted_at = payload.get("last_sync_at") or payload.get("recorded_at") or datetime.now(timezone.utc).isoformat()
    payload.update(
        {
            "schema_version": "gsc-sync-state/v1",
            "manifest_schema_version": "gsc_snapshot_manifest_v1",
            "last_sync_at": attempted_at,
            "source": "search_analytics_api",
            "source_freshness": {
                "status": "UNKNOWN",
                "as_of": payload.get("as_of"),
                "evaluated_at": attempted_at,
                "max_age_days": 14,
            },
        }
    )
    (DATA / "last_sync.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


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
    """Refuse CTR optimization below 100 impressions. Missing denominator is not zero."""
    if impressions is None:
        return {
            "decision": "INSUFFICIENT_EVIDENCE",
            "impressions": None,
            "threshold": CTR_MIN_IMPRESSIONS,
            "optimize_ctr": False,
            "data_preserved": True,
            "note": "missing_denominator_is_not_zero",
        }
    imps = float(impressions)
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
        page = (row.get("page") or "").strip()
        if not page:
            continue
        if row_brand_label(row) != "non_brand":
            continue
        query = _row_query_text(row) or _row_query_hash(row)
        if not query:
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


DETECTION_CLASSES = (
    "striking_distance",
    "wrong_landing",
    "cannibalization",
    "impressions_without_adequate_answer",
    "indexable_without_impressions",
    "clicks_weak_cta",
)

# Operational intended landings for known non-brand questions. Not a demand claim.
DEFAULT_INTENDED_LANDINGS = {
    "sinapi desonerado": "/conteudos/sinapi-desonerado-nao-desonerado/",
    "sinapi desonerado ou nao": "/conteudos/sinapi-desonerado-nao-desonerado/",
    "desonerado e nao desonerado": "/conteudos/sinapi-desonerado-nao-desonerado/",
    "bdi diferenciado": "/conteudos/bdi-diferenciado-obra-publica/",
    "limite aditivo": "/conteudos/limite-aditivo-25-50-obra-publica/",
    "limite aditivo 25": "/conteudos/limite-aditivo-25-50-obra-publica/",
    "limite 25 50": "/conteudos/limite-aditivo-25-50-obra-publica/",
}

DEFAULT_ADEQUATE_PATHS = {
    "/conteudos/sinapi-desonerado-nao-desonerado/",
    "/conteudos/bdi-diferenciado-obra-publica/",
    "/conteudos/limite-aditivo-25-50-obra-publica/",
    "/aditivos-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/inteligencia/valor-tipico-contratos-pavimentacao/",
}


def _path_of(page: str) -> str:
    raw = (page or "").strip()
    if not raw:
        return ""
    path = urlparse(raw).path if raw.startswith("http") else raw
    if not path or path == "/":
        return "/"
    return path if path.endswith("/") else path + "/"


def _normalize_query(query: str) -> str:
    text = re.sub(r"\s+", " ", (query or "").strip().lower())
    text = (
        text.replace("ã", "a")
        .replace("á", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )
    return text


def _row_query_text(row: dict[str, Any]) -> str:
    """Raw query text only. A sha256 query_hash is not a query."""
    q = row.get("query")
    if isinstance(q, str) and q and not q.startswith("sha256:"):
        return q
    return ""


def _row_query_hash(row: dict[str, Any]) -> str:
    stored = row.get("query_hash")
    if isinstance(stored, str) and stored.startswith("sha256:"):
        return stored
    text = _row_query_text(row)
    return redact_query(text) if text else ""


def row_brand_label(row: dict[str, Any]) -> str:
    """Honor stored brand_class on git-safe rows. Never classify a query_hash."""
    allowed = {"brand", "legacy_brand", "non_brand"}
    raw = row.get("brand_class")
    if isinstance(raw, dict) and raw.get("label") in allowed:
        return str(raw["label"])
    if isinstance(raw, str) and raw in allowed:
        return raw
    text = _row_query_text(row)
    if text:
        return classify_query(text).get("label") or "non_brand"
    if row.get("branded") is True:
        return "brand"
    return "non_brand"


def brand_class_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"brand": 0, "non_brand": 0, "legacy_brand": 0}
    for row in rows:
        label = row_brand_label(row)
        if label in counts:
            counts[label] += 1
    return counts


def dedupe_gsc_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Dedupe on the Search Analytics 5-tuple. First row wins."""
    seen: set[tuple] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = (
            row.get("date"),
            row.get("query"),
            row.get("page"),
            row.get("country"),
            row.get("device"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def detect_striking_distance(
    rows: list[dict[str, Any]],
    *,
    min_impressions: float = 3.0,
    pos_lo: float = 4.0,
    pos_hi: float = 20.0,
) -> dict[str, Any]:
    """Positions 4–20 with observed impressions. Missing position is not zero."""
    items: list[dict[str, Any]] = []
    for row in rows:
        if row.get("impressions") is None or row.get("position") is None:
            continue
        impressions = float(row.get("impressions"))
        position = float(row.get("position"))
        if impressions >= min_impressions and pos_lo <= position <= pos_hi:
            items.append(
                {
                    "page": row.get("page"),
                    "query_hash": _row_query_hash(row),
                    "impressions": impressions,
                    "position": position,
                    "clicks": row.get("clicks"),
                }
            )
    return {
        "class": "striking_distance",
        "status": "observed" if items else "none_in_returned_set",
        "zero_inferred_from_absence": False,
        "items": items,
        "note": SEARCH_ANALYTICS_LIMITATION,
    }


def detect_wrong_landing(
    rows: list[dict[str, Any]],
    intended_by_query: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Query landed on a page other than the intended operational URL."""
    mapping = intended_by_query if intended_by_query is not None else DEFAULT_INTENDED_LANDINGS
    if not mapping:
        return {
            "class": "wrong_landing",
            "status": "INSUFFICIENT_EVIDENCE",
            "reason": "no_intended_landing_map",
            "items": [],
        }
    hashed_exact = {
        redact_query(key): path for key, path in mapping.items()
    }
    hashed_exact.update(
        {redact_query(_normalize_query(key)): path for key, path in mapping.items()}
    )
    items: list[dict[str, Any]] = []
    for row in rows:
        page = str(row.get("page") or "")
        if not page:
            continue
        query = _row_query_text(row)
        intended = None
        if query:
            norm = _normalize_query(query)
            for key, path in mapping.items():
                if key in norm:
                    intended = path
                    break
        if intended is None:
            qh = _row_query_hash(row)
            if qh:
                intended = hashed_exact.get(qh)
        if not intended:
            continue
        landed = _path_of(page)
        if landed and intended.rstrip("/") not in landed.rstrip("/"):
            items.append(
                {
                    "query_hash": _row_query_hash(row) or redact_query(query),
                    "landed": landed,
                    "intended": intended,
                    "impressions": row.get("impressions"),
                }
            )
    return {
        "class": "wrong_landing",
        "status": "observed" if items else "none_in_returned_set",
        "items": items,
        "zero_inferred_from_absence": False,
    }


def detect_impressions_without_adequate_answer(
    rows: list[dict[str, Any]],
    adequate_paths: set[str] | None = None,
) -> dict[str, Any]:
    """Non-brand queries with impressions whose landing is missing or inadequate."""
    paths = adequate_paths if adequate_paths is not None else DEFAULT_ADEQUATE_PATHS
    if not paths:
        return {
            "class": "impressions_without_adequate_answer",
            "status": "INSUFFICIENT_EVIDENCE",
            "reason": "adequate_answer_map_required",
            "items": [],
        }
    items: list[dict[str, Any]] = []
    for row in rows:
        if row.get("impressions") is None:
            continue
        if float(row.get("impressions") or 0) <= 0:
            continue
        if row_brand_label(row) != "non_brand":
            continue
        page = str(row.get("page") or "")
        if not page:
            items.append(
                {
                    "query_hash": _row_query_hash(row),
                    "status": "join_absent",
                    "impressions": row.get("impressions"),
                    "note": "missing_page_join_is_not_zero",
                }
            )
            continue
        landed = _path_of(page)
        if landed not in paths:
            items.append(
                {
                    "query_hash": _row_query_hash(row),
                    "landed": landed,
                    "status": "landing_not_in_adequate_set",
                    "impressions": row.get("impressions"),
                }
            )
    return {
        "class": "impressions_without_adequate_answer",
        "status": "observed" if items else "none_in_returned_set",
        "items": items,
        "zero_inferred_from_absence": False,
    }


def detect_indexable_without_impressions(
    indexable_urls: list[str],
    observed_by_url: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    """Indexable URLs missing from a performance export stay ABSENT, never 0."""
    observed = observed_by_url if observed_by_url is not None else {}
    items: list[dict[str, Any]] = []
    for url in indexable_urls:
        key = url.rstrip("/") + "/"
        obs = observed.get(url) or observed.get(key) or observed.get(_path_of(url))
        if obs is None:
            items.append(
                {
                    "url": url,
                    "status": "ABSENT",
                    "impressions": None,
                    "note": "missing_is_not_zero",
                }
            )
            continue
        if obs.get("impressions") is None:
            items.append(
                {
                    "url": url,
                    "status": "ABSENT",
                    "impressions": None,
                    "note": "missing_is_not_zero",
                }
            )
            continue
        if float(obs.get("impressions") or 0) == 0:
            items.append(
                {
                    "url": url,
                    "status": "observed_zero",
                    "impressions": 0.0,
                    "note": "zero_was_present_in_returned_set",
                }
            )
    return {
        "class": "indexable_without_impressions",
        "status": "observed" if any(i.get("status") == "observed_zero" for i in items) else "ABSENT_OR_EMPTY",
        "items": items,
        "zero_inferred_from_absence": False,
        "note": (
            "A URL missing from Search Analytics is ABSENT. "
            "Inspection, indexation, impression and click stay independent."
        ),
    }


def detect_clicks_weak_cta(
    rows: list[dict[str, Any]],
    cta_by_path: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Pages with observed clicks whose CTA map is weak or missing."""
    if cta_by_path is None:
        return {
            "class": "clicks_weak_cta",
            "status": "INSUFFICIENT_EVIDENCE",
            "reason": "cta_strength_map_required",
            "items": [],
        }
    items: list[dict[str, Any]] = []
    for row in rows:
        if row.get("clicks") is None:
            continue
        if float(row.get("clicks") or 0) <= 0:
            continue
        path = _path_of(str(row.get("page") or ""))
        if not path:
            continue
        strength = cta_by_path.get(path) or cta_by_path.get(path.rstrip("/"))
        if strength in {None, "weak", "missing"}:
            items.append(
                {
                    "page": path,
                    "clicks": row.get("clicks"),
                    "impressions": row.get("impressions"),
                    "cta_strength": strength or "missing",
                }
            )
    return {
        "class": "clicks_weak_cta",
        "status": "observed" if items else "none_in_returned_set",
        "items": items,
        "zero_inferred_from_absence": False,
    }


def detect_all(
    rows: list[dict[str, Any]],
    *,
    indexable_urls: list[str] | None = None,
    intended_by_query: dict[str, str] | None = None,
    adequate_paths: set[str] | None = None,
    cta_by_path: dict[str, str] | None = None,
    reviewed_semantic_overlap: bool = False,
) -> dict[str, Any]:
    """Bundle the campaign detection classes over a query×page×date×country×device set."""
    deduped = dedupe_gsc_rows(rows)
    observed_pages: dict[str, dict[str, Any]] = {}
    for row in deduped:
        path = _path_of(str(row.get("page") or ""))
        if not path:
            continue
        prev = observed_pages.get(path)
        if prev is None:
            observed_pages[path] = {
                "impressions": row.get("impressions"),
                "clicks": row.get("clicks"),
                "position": row.get("position"),
            }
            continue
        if row.get("impressions") is not None:
            prev["impressions"] = float(prev.get("impressions") or 0) + float(row.get("impressions") or 0)
        if row.get("clicks") is not None:
            prev["clicks"] = float(prev.get("clicks") or 0) + float(row.get("clicks") or 0)
    return {
        "grain": ["date", "query", "page", "country", "device"],
        "row_count": len(deduped),
        "brand_classes": brand_class_counts(deduped),
        "striking_distance": detect_striking_distance(deduped),
        "wrong_landing": detect_wrong_landing(deduped, intended_by_query),
        "cannibalization": cannibalization_verdict(
            deduped, reviewed_semantic_overlap=reviewed_semantic_overlap
        ),
        "impressions_without_adequate_answer": detect_impressions_without_adequate_answer(
            deduped, adequate_paths
        ),
        "indexable_without_impressions": detect_indexable_without_impressions(
            list(indexable_urls or []), observed_pages
        ),
        "clicks_weak_cta": detect_clicks_weak_cta(deduped, cta_by_path),
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "zero_inferred_from_absence": False,
        "inspection_is_not_indexation": True,
        "indexation_is_not_impression": True,
        "impression_is_not_click": True,
    }


def gsc_performance_status(pull_result: dict[str, Any] | None) -> str:
    """Live performance is UNKNOWN unless a non-synthetic API pull succeeded."""
    data = pull_result or {}
    kind = classify_snapshot_source(data)
    if kind == "credential_failure" or data.get("error") == "missing_credentials":
        return "UNKNOWN"
    if kind in {"fixture", "historical_csv_export"}:
        return "UNKNOWN"
    if data.get("ok") is True and data.get("ready_for_product_decisions") is True and data.get("synthetic") is not True:
        return "LIVE"
    return "UNKNOWN"


def label_historical_export(payload: dict[str, Any]) -> dict[str, Any]:
    """Stamp a CSV/historical snapshot so it cannot be confused with a live pull."""
    stamped = stamp_non_live_snapshot(payload)
    stamped["historical"] = True
    stamped["historical_neq_live"] = True
    stamped["source_kind"] = "historical_csv_export"
    stamped["performance_status"] = "UNKNOWN"
    return stamped


def git_safe_aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Minimized aggregates with hashed queries. No raw query/PII."""
    branded_n = 0
    legacy_n = 0
    nonbrand_n = 0
    impressions = 0.0
    clicks = 0.0
    hashed: list[dict[str, Any]] = []
    for row in rows:
        cls_label = row_brand_label(row)
        if cls_label == "brand":
            branded_n += 1
        elif cls_label == "legacy_brand":
            legacy_n += 1
        else:
            nonbrand_n += 1
        impressions += float(row.get("impressions") or 0) if row.get("impressions") is not None else 0.0
        clicks += float(row.get("clicks") or 0) if row.get("clicks") is not None else 0.0
        hashed.append(
            {
                "date": row.get("date"),
                "query_hash": _row_query_hash(row) or redact_query(_row_query_text(row)),
                "page": redact_sensitive_url(row.get("page")),
                "country": row.get("country"),
                "device": row.get("device"),
                "impressions": row.get("impressions"),
                "clicks": row.get("clicks"),
                "ctr": row.get("ctr"),
                "position": row.get("position"),
                "brand_class": cls_label,
                "brand_class_version": BRAND_CLASSIFICATION_VERSION,
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


def git_safe_live_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Replace live raw queries with hashed, page-level-safe rows for git."""
    out = dict(payload)
    aggregate = git_safe_aggregate(list(payload.get("queries") or []))
    out["queries"] = aggregate["rows"]
    out["git_safe_aggregate"] = {k: v for k, v in aggregate.items() if k != "rows"}
    out["query_text_redacted"] = True
    out["raw_query_rows_in_git"] = False
    return out


def redact_live_query_fields(value: Any) -> Any:
    """Recursively hash queries and strip sensitive URL components."""
    if isinstance(value, list):
        return [redact_live_query_fields(item) for item in value]
    if not isinstance(value, dict):
        return value
    out: dict[str, Any] = {}
    for key, item in value.items():
        if key == "query" and isinstance(item, str):
            out["query_hash"] = redact_query(item)
        elif key in {
            "page",
            "url",
            "path",
            "landing_page",
            "current_landing",
            "intended_landing",
        } and isinstance(item, str):
            out[key] = redact_sensitive_url(item)
        else:
            out[key] = redact_live_query_fields(item)
    return out


def redact_sensitive_url(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    raw = value.strip()
    if not raw:
        return raw
    if raw.startswith("/"):
        return raw.split("?", 1)[0].split("#", 1)[0]
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        return raw
    hostname = (parsed.hostname or "").lower()
    if hostname not in {"confenge.com.br", "www.confenge.com.br"}:
        return "[external-url-redacted]"
    path = parsed.path or "/"
    return f"https://confenge.com.br{path}"


def snapshot_manifest(
    *,
    source: str,
    rows: list[dict[str, Any]],
    max_date: str | None,
    latency_ms: int | None,
    ready_for_product_decisions: bool,
    synthetic: bool,
) -> dict[str, Any]:
    stable_rows = [
        {
            "date": row.get("date"),
            "query_hash": redact_query(str(row.get("query") or "")),
            "page": row.get("page"),
            "country": row.get("country"),
            "device": row.get("device"),
            "impressions": row.get("impressions"),
            "clicks": row.get("clicks"),
        }
        for row in rows
    ]
    stable_rows.sort(key=lambda row: _canonical_snapshot_row(row))
    payload = json.dumps(
        stable_rows,
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


def _canonical_snapshot_row(row: dict[str, Any]) -> str:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


FIXTURE_MANIFEST_REL = Path("data/revops/gsc/fixtures/last_fixture_manifest.json")
COMMITTED_GSC_SNAPSHOT_RELS = (
    Path("data/revops/gsc/latest_import.json"),
    Path("data/revops/gsc/imports/import-2026-07-30.json"),
    Path("data/revops/gsc/insights_latest.json"),
    Path("data/ops/gsc-insights.json"),
    Path("netlify/functions/data/gsc-insights.json"),
)


def is_live_gsc_payload(data: dict[str, Any] | None) -> bool:
    """True only for a labeled live Search Analytics payload. Does not imply freshness."""
    data = data or {}
    kind = classify_snapshot_source(data)
    return (
        kind in LIVE_SOURCE_KINDS
        and data.get("synthetic") is not True
        and data.get("fixture") is not True
        and data.get("historical") is not True
        and data.get("ready_for_product_decisions") is not False
    )


def stamp_non_live_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    """Historical CSV / fixture payloads cannot drive product decisions."""
    out = dict(payload)
    kind = classify_snapshot_source(out)
    if kind in LIVE_SOURCE_KINDS and out.get("synthetic") is not True and out.get("fixture") is not True:
        out["source_kind"] = kind
        out["synthetic"] = False
        out["fixture"] = False
        out["historical"] = False
        out["live_baseline_invented"] = False
        if "ready_for_product_decisions" not in out:
            out["ready_for_product_decisions"] = True
        return out
    if kind == "credential_failure":
        out["source_kind"] = "credential_failure"
        out["synthetic"] = False
        out["fixture"] = False
        out["ready_for_product_decisions"] = False
        out["live_baseline_invented"] = False
        return out
    out["synthetic"] = True
    out["fixture"] = True
    out["historical"] = kind == "historical_csv_export" or bool(out.get("historical"))
    out["source_kind"] = kind if kind in SNAPSHOT_SOURCE_KINDS else "historical_csv_export"
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
    sa = env_nonempty("GSC_CREDENTIALS_JSON")
    secrets = env_nonempty("GSC_CLIENT_SECRETS_JSON")
    token_path = env_nonempty("GSC_TOKEN_JSON")
    site = env_nonempty("GSC_SITE_URL") or "sc-domain:confenge.com.br"
    sa_present = bool(sa)
    oauth_present = bool(secrets and token_path)
    return {
        "present": sa_present or oauth_present,
        "mode": "service_account" if sa_present else ("oauth" if oauth_present else None),
        "site": site,
        "site_env_present": bool(env_nonempty("GSC_SITE_URL")),
        "env_names": list(REQUIRED_GSC_ENV),
        "env_presence": {name: bool(env_nonempty(name)) for name in REQUIRED_GSC_ENV},
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
        "source_kind": "historical_csv_export",
        "synthetic": True,
        "fixture": True,
        "historical": True,
        "ready_for_product_decisions": False,
        "live_baseline_invented": False,
        "queries": query_rows,
        "pages": page_rows,
        "query_count": len(query_rows),
        "page_count": len(page_rows),
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
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
    leads_store = os.environ.get("CONFENGE_STORAGE_DIR") or os.environ.get("LEAD_STORE_DIR")
    lead_records = load_host_leads(Path(leads_store).resolve()) if leads_store else []
    for rec in lead_records:
        lp = rec.get("landing_page") or rec.get("page") or ""
        if lp:
            lead_path = urlparse(lp).path if str(lp).startswith("http") else str(lp)
            lead_pages[lead_path.rstrip("/") or "/"] += 1
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
        "readiness_status": data.get("readiness_status") or "UNKNOWN",
        "readiness_access_mode": data.get("readiness_access_mode") or "NONE",
        "readiness_reason_codes": list(data.get("readiness_reasons") or []),
        "reason_codes": list(data.get("reason_codes") or data.get("readiness_reasons") or []),
        "readiness_contract_version": data.get("readiness_contract_version"),
        "history_state_sha256": data.get("history_state_sha256"),
        "snapshot_sha256": (data.get("manifest") or {}).get("content_sha256")
        or data.get("manifest_sha256"),
        "live_baseline_invented": False,
        "counts": {
            "queries": len(queries),
            "pages": len(pages),
            "branded_queries": sum(1 for q in queries if q.get("branded")),
            "nonbranded_queries": sum(1 for q in queries if not q.get("branded")),
            "brand_classes": brand_class_counts(queries),
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
            "detection_classes": detect_all(
                list(queries) + list(pages),
                indexable_urls=sorted(DEFAULT_ADEQUATE_PATHS),
            ),
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

    persisted_insights = insights
    if is_live_gsc_payload(data):
        PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
        (PRIVATE_DIR / "insights_latest.json").write_text(
            json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        persisted_insights = redact_live_query_fields(insights)
        persisted_insights["query_text_redacted"] = True
        persisted_insights["raw_query_rows_in_git"] = False

    out = DATA / "insights_latest.json"
    out.write_text(json.dumps(persisted_insights, ensure_ascii=False, indent=2), encoding="utf-8")
    # Private ops copies only — never publish as static public (auth via ops?action=gsc_insights)
    private_targets = [
        ROOT / "data" / "ops" / "gsc-insights.json",
        ROOT / "netlify" / "functions" / "data" / "gsc-insights.json",
    ]
    for ops_out in private_targets:
        ops_out.parent.mkdir(parents=True, exist_ok=True)
        ops_out.write_text(
            json.dumps(persisted_insights, ensure_ascii=False, indent=2), encoding="utf-8"
        )
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
    site = env_nonempty("GSC_SITE_URL") or "sc-domain:confenge.com.br"
    sa = env_nonempty("GSC_CREDENTIALS_JSON")
    secrets = env_nonempty("GSC_CLIENT_SECRETS_JSON")
    token_path = env_nonempty("GSC_TOKEN_JSON")

    if not sa and not (secrets and token_path):
        blocker = credential_blocker_record(site=site if env_nonempty("GSC_SITE_URL") else None)
        return None, blocker

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


def pull_api(
    days: int = 28,
    *,
    reprocess_days: int = 3,
    row_limit: int = 25000,
    history_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pull Search Analytics via Google API when credentials exist.

    Incremental features:
      - reprocess last N days to absorb GSC lag
      - pagination via startRow
      - dedupe by (date, query, page, country, device)
      - versioned/hash-verified history restored from the authenticated store
      - observed/missing dates derived from the durable 28-day window
      - gitignored run evidence under data/revops/gsc/
    """
    if history_state is None:
        try:
            history_state = read_history(HISTORY_PATH)
        except HistoryStateError as exc:
            return {
                "ok": False,
                "error": exc.code,
                "reason_codes": [exc.code],
                "ready_for_product_decisions": False,
            }
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

    today = property_today()
    end = last_complete_day(today=today, provider_max_date=today - timedelta(days=3))
    start = end - timedelta(days=max(days, reprocess_days) - 1)
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    started = time.monotonic()

    dimensions = ["date", "query", "page", "country", "device"]
    rows_out: list[dict[str, Any]] = []
    start_row = 0
    pages_fetched = 0
    last_batch_size = 0
    truncated = False
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
        last_batch_size = len(batch)
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
                    "impressions": row["impressions"] if "impressions" in row else None,
                    "clicks": row["clicks"] if "clicks" in row else None,
                    "ctr": row["ctr"] if "ctr" in row else None,
                    "position": row["position"] if "position" in row else None,
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
            truncated = True
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
    if last_batch_size >= row_limit:
        truncated = True
    source_kind = (
        "search_analytics_top_row_truncation" if truncated else "search_analytics_api"
    )
    windows = complete_windows(
        today=today,
        provider_max_date=date.fromisoformat(str(max_date)),
    )
    manifest = snapshot_manifest(
        source=source_kind,
        rows=deduped,
        max_date=str(max_date),
        latency_ms=latency_ms,
        ready_for_product_decisions=False,
        synthetic=False,
    )
    run_id = os.environ.get("GSC_RUN_ID") or os.environ.get("GITHUB_RUN_ID") or "local"
    run_attempt = os.environ.get("GITHUB_RUN_ATTEMPT")
    if run_attempt:
        run_id = f"{run_id}:{run_attempt}"
    if truncated:
        history_state = record_failed_attempt(
            history_state,
            "top_row_truncation",
            run_id=run_id,
        )
        history_result = {
            "event": "RUN_FAILED",
            "promote_insights": False,
            "reason_codes": list(history_state["readiness"]["reason_codes"]),
            "readiness": history_state["readiness"],
        }
    else:
        observation = build_observation(
            as_of=end,
            start=start,
            end=end,
            snapshot_sha256=manifest["content_sha256"],
            observed_at=datetime.fromisoformat(last_sync_at),
            run_id=run_id,
            reprocess_days=reprocess_days,
        )
        history_state, history_result = merge_observation(history_state, observation)
    write_history(HISTORY_PATH, history_state)
    readiness = history_state["readiness"]
    gaps = list(readiness["missing_dates"])
    readiness_reasons = list(readiness["reason_codes"])
    ready_for_product_decisions = readiness["ready_for_product_decisions"] is True
    manifest["ready_for_product_decisions"] = ready_for_product_decisions
    manifest["readiness_contract_version"] = GSC_READINESS_CONTRACT
    manifest["history_state_sha256"] = history_state["state_sha256"]
    coverage = {
        "kind": "durable_observed_dates",
        "start": readiness["window_start"],
        "end": readiness["window_end"],
        "complete": not gaps,
        "observed_dates": len(readiness["observed_dates"]),
        "missing_dates": len(gaps),
        "distinct_as_of": readiness["distinct_as_of"],
    }
    payload = {
        "imported_at": last_sync_at,
        "as_of": end.isoformat(),
        "source": "search_analytics_api",
        "source_kind": source_kind,
        "truncated": truncated,
        "top_row_truncation": truncated,
        "site": site,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "reprocess_days": reprocess_days,
        "timezone": "America/Sao_Paulo",
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
        "coverage": coverage,
        "coverage_gaps": gaps,
        "readiness_reasons": readiness_reasons,
        "reason_codes": readiness_reasons,
        "readiness_status": readiness["status"],
        "readiness_access_mode": readiness["access_mode"],
        "readiness_contract_version": GSC_READINESS_CONTRACT,
        "history_state_sha256": history_state["state_sha256"],
        "history_event": history_result["event"],
        "ready_for_product_decisions": ready_for_product_decisions,
        "synthetic": False,
        "fixture": False,
        "live_baseline_invented": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "note": "API pull is current. July CSV snapshot is historical only.",
    }
    (PRIVATE_DIR / "latest_import.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    safe_payload = git_safe_live_payload(payload)
    (DATA / "latest_import.json").write_text(
        json.dumps(safe_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    day_path = DATA / "daily" / f"{end.isoformat()}.json"
    day_path.write_text(json.dumps(safe_payload, ensure_ascii=False), encoding="utf-8")
    (PRIVATE_DIR / "daily" / f"{end.isoformat()}.json").parent.mkdir(parents=True, exist_ok=True)
    (PRIVATE_DIR / "daily" / f"{end.isoformat()}.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )

    last_sync = {
        "schema_version": "gsc-sync-state/v1",
        "manifest_schema_version": manifest["schema"],
        "last_sync_at": last_sync_at,
        "as_of": end.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "rows": len(deduped),
        "pages_fetched": pages_fetched,
        "gaps": gaps,
        "coverage": coverage,
        "readiness_reasons": readiness_reasons,
        "reason_codes": readiness_reasons,
        "readiness_status": readiness["status"],
        "readiness_access_mode": readiness["access_mode"],
        "readiness_contract_version": GSC_READINESS_CONTRACT,
        "history_state_sha256": history_state["state_sha256"],
        "history_event": history_result["event"],
        "promote_insights": history_result["promote_insights"],
        "site": site,
        "source": "search_analytics_api",
        "source_kind": source_kind,
        "truncated": truncated,
        "timezone": "America/Sao_Paulo",
        "max_date": max_date,
        "latency_ms": latency_ms,
        "ready_for_product_decisions": ready_for_product_decisions,
        "synthetic": False,
        "fixture": False,
        "live_baseline_invented": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
        "source_freshness": {
            "status": "CURRENT" if ready_for_product_decisions else readiness["status"],
            "as_of": end.isoformat(),
            "evaluated_at": last_sync_at,
            "max_age_days": 14,
        },
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
        "source": "search_analytics_api",
        "source_kind": source_kind,
        "truncated": truncated,
        "synthetic": False,
        "fixture": False,
        "live_baseline_invented": False,
        "readiness_reasons": readiness_reasons,
        "reason_codes": readiness_reasons,
        "readiness_status": readiness["status"],
        "readiness_access_mode": readiness["access_mode"],
        "readiness_contract_version": GSC_READINESS_CONTRACT,
        "history_state_sha256": history_state["state_sha256"],
        "history_event": history_result["event"],
        "promote_insights": history_result["promote_insights"],
        "ready_for_product_decisions": ready_for_product_decisions,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
    }


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
    run_id = os.environ.get("GSC_RUN_ID") or os.environ.get("GITHUB_RUN_ID") or "local"
    run_attempt = os.environ.get("GITHUB_RUN_ATTEMPT")
    if run_attempt:
        run_id = f"{run_id}:{run_attempt}"
    try:
        history_state = read_history(HISTORY_PATH)
    except HistoryStateError as exc:
        result = {
            "ok": False,
            "error": exc.code,
            "reason_codes": [exc.code],
            "ready_for_product_decisions": False,
            "readiness_status": "UNKNOWN",
            "readiness_access_mode": "NONE",
        }
        write_blocked_last_sync(result)
        return result

    if os.environ.get("GSC_DEPENDENCY_UNAVAILABLE") == "1":
        result = {"ok": False, "error": "dependency_unavailable"}
    else:
        try:
            result = pull_api(
                days=days,
                reprocess_days=reprocess_days,
                history_state=history_state,
            )
        except Exception:  # noqa: BLE001 -- never leak provider/credential details to logs
            result = {"ok": False, "error": "dependency_unavailable"}
    if result.get("ok"):
        return result

    error = str(result.get("error") or "dependency_unavailable")
    reason_code = {
        "missing_credentials": "missing_credentials",
        "oauth_flow_not_automated_here": "credential_failure",
        "google_api_client_not_installed": "dependency_unavailable",
    }.get(error, error if error.startswith("gsc_history_") else "dependency_unavailable")
    history_state = record_failed_attempt(history_state, reason_code, run_id=run_id)
    write_history(HISTORY_PATH, history_state)
    readiness = history_state["readiness"]
    safe_result = {
        **result,
        "error": reason_code,
        "reason_codes": list(readiness["reason_codes"]),
        "ready_for_product_decisions": False,
        "readiness_status": readiness["status"],
        "readiness_access_mode": readiness["access_mode"],
        "readiness_contract_version": GSC_READINESS_CONTRACT,
        "history_state_sha256": history_state["state_sha256"],
        "promote_insights": False,
    }
    # Always persist a redacted blocker receipt. Absence is not numeric zero.
    write_blocked_last_sync(safe_result)
    if allow_missing_creds and reason_code == "missing_credentials":
        safe_result["allowed_external_blocker"] = True
    return safe_result


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
        today=property_today(),
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
        "source_kind": "fixture",
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
    # Persist gitignored last_sync as fixture (not live). Never overwrite latest_import.json.
    (DATA / "last_sync.json").write_text(
        json.dumps(
            {
                "schema_version": "gsc-sync-state/v1",
                "manifest_schema_version": manifest["schema"],
                "last_sync_at": last_sync_at,
                "as_of": as_of,
                "rows": len(classified),
                "source": "fixture",
                "source_kind": "fixture",
                "synthetic": True,
                "fixture": True,
                "ready_for_product_decisions": False,
                "max_date": as_of,
                "latency_ms": latency_ms,
                "gaps": [],
                "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
                "manifest_sha256": manifest["content_sha256"],
                "source_freshness": {
                    "status": "UNKNOWN",
                    "as_of": as_of,
                    "evaluated_at": last_sync_at,
                    "max_age_days": 14,
                },
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
        "source_kind": "fixture",
        "synthetic": True,
        "ready_for_product_decisions": False,
        "max_date": as_of,
        "latency_ms": latency_ms,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "manifest_sha256": manifest["content_sha256"],
    }


def url_funnel_status(
    *,
    eligible: str | bool | None,
    appeared: str | bool | None,
    clicked: str | bool | None,
    engaged: str | bool | None,
    lead: str | bool | None,
    pipeline: str | bool | None,
) -> str:
    """Highest confirmed stage. Cells stay independent; UNKNOWN is not FALSE."""

    def _true(value: str | bool | None) -> bool:
        return value is True or value == "TRUE" or value == "observed"

    if _true(pipeline):
        return "PIPELINE"
    if _true(lead):
        return "LEAD"
    if _true(engaged):
        return "ENGAGED"
    if _true(clicked):
        return "CLICKED"
    if _true(appeared):
        return "APPEARED"
    if _true(eligible):
        return "ELIGIBLE"
    return "UNKNOWN"


def _read_snapshot_dict(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def analysis_import_payload() -> dict[str, Any]:
    """Prefer private raw Search Analytics rows; fall back to git-safe public snapshot."""
    private = _read_snapshot_dict(PRIVATE_DIR / "latest_import.json")
    public = _read_snapshot_dict(DATA / "latest_import.json")
    if private.get("queries"):
        private["source_kind"] = classify_snapshot_source(private)
        private["analysis_source"] = "private_raw"
        return private
    if public:
        public["source_kind"] = classify_snapshot_source(public)
        public["analysis_source"] = "git_safe"
        return public
    return {}


def load_labeled_snapshot(path: Path | None = None) -> dict[str, Any]:
    if path is not None:
        target = path
        if not target.is_file():
            return {"source_kind": "absence", "queries": [], "pages": [], "ok": False}
        payload = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {"source_kind": "absence", "queries": [], "pages": [], "ok": False}
        payload["source_kind"] = classify_snapshot_source(payload)
        return payload
    last_payload = _read_snapshot_dict(DATA / "last_sync.json")
    analysis = analysis_import_payload()
    last_kind = classify_snapshot_source(last_payload) if last_payload else "absence"
    if last_kind == "credential_failure":
        merged = dict(last_payload)
        merged["source_kind"] = "credential_failure"
        if analysis:
            merged["last_live_snapshot"] = {
                "source_kind": classify_snapshot_source(analysis),
                "as_of": analysis.get("as_of"),
                "max_date": analysis.get("max_date"),
                "freshness": snapshot_freshness(analysis),
                "query_count": analysis.get("query_count") or len(analysis.get("queries") or []),
                "analysis_source": analysis.get("analysis_source"),
                "ready_for_product_decisions": False,
            }
        merged.setdefault("queries", [])
        merged.setdefault("pages", [])
        return merged
    if analysis:
        return analysis
    if last_payload:
        last_payload["source_kind"] = last_kind
        return last_payload
    return {"source_kind": "absence", "queries": [], "pages": [], "ok": False}


def _window_totals(
    rows: list[dict[str, Any]], days: list[str]
) -> dict[str, Any]:
    day_set = set(days)
    present_days: set[str] = set()
    brand_imps: dict[str, float | None] = {"brand": None, "legacy_brand": None, "non_brand": None}
    brand_clicks: dict[str, float | None] = {"brand": None, "legacy_brand": None, "non_brand": None}
    devices: dict[str, dict[str, float]] = {}
    countries: dict[str, dict[str, float]] = {}
    any_metric = False
    for row in rows:
        day = str(row.get("date") or "")
        if day and day in day_set:
            present_days.add(day)
        if day and day not in day_set:
            continue
        label = row_brand_label(row)
        if label not in brand_imps:
            label = "non_brand"
        imps = optional_metric(row, "impressions")
        clicks = optional_metric(row, "clicks")
        if imps is not None:
            any_metric = True
            brand_imps[label] = (brand_imps[label] or 0.0) + imps
        if clicks is not None:
            any_metric = True
            brand_clicks[label] = (brand_clicks[label] or 0.0) + clicks
        device = str(row.get("device") or "UNKNOWN")
        country = str(row.get("country") or "UNKNOWN")
        if imps is not None:
            devices.setdefault(device, {"impressions": 0.0, "clicks": 0.0})
            devices[device]["impressions"] += imps
            if clicks is not None:
                devices[device]["clicks"] += clicks
            countries.setdefault(country, {"impressions": 0.0, "clicks": 0.0})
            countries[country]["impressions"] += imps
            if clicks is not None:
                countries[country]["clicks"] += clicks
    expected = set(days)
    missing_days = sorted(expected - present_days) if expected else []
    return {
        "brand": {
            "impressions": brand_imps["brand"],
            "clicks": brand_clicks["brand"],
        },
        "legacy_brand": {
            "impressions": brand_imps["legacy_brand"],
            "clicks": brand_clicks["legacy_brand"],
        },
        "non_brand": {
            "impressions": brand_imps["non_brand"],
            "clicks": brand_clicks["non_brand"],
        },
        "devices": devices or None,
        "countries": countries or None,
        "days_expected": len(days),
        "days_present": len(present_days),
        "missing_days": missing_days,
        "coverage": (
            "observed"
            if any_metric and not missing_days
            else ("partial" if any_metric else "ABSENT")
        ),
        "value": None if not any_metric else True,
        "zero_inferred_from_absence": False,
    }


def _page_status_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_page: dict[str, dict[str, Any]] = {}
    for row in rows:
        page = str(row.get("page") or "")
        if not page:
            continue
        path = _path_of(page)
        slot = by_page.setdefault(
            path,
            {
                "url": page,
                "path": path,
                "impressions": None,
                "clicks": None,
                "cluster": enrich_path(path).get("cluster"),
                "exclusion": exclusion_for_url(path),
            },
        )
        imps = optional_metric(row, "impressions")
        clicks = optional_metric(row, "clicks")
        if imps is not None:
            slot["impressions"] = (slot["impressions"] or 0.0) + imps
        if clicks is not None:
            slot["clicks"] = (slot["clicks"] or 0.0) + clicks
    out = []
    for slot in by_page.values():
        appeared = slot["impressions"] is not None and slot["impressions"] > 0
        clicked = slot["clicks"] is not None and slot["clicks"] > 0
        slot["status"] = url_funnel_status(
            eligible=True,
            appeared=appeared,
            clicked=clicked,
            engaged=None,
            lead=None,
            pipeline=None,
        )
        slot["stages"] = {
            "ELIGIBLE": {"status": "TRUE", "authority": "local_inspect", "value": None},
            "APPEARED": {
                "status": "TRUE" if appeared else ("ABSENT" if slot["impressions"] is None else "FALSE"),
                "authority": "gsc_search_analytics",
                "value": slot["impressions"],
            },
            "CLICKED": {
                "status": "TRUE" if clicked else ("ABSENT" if slot["clicks"] is None else "FALSE"),
                "authority": "gsc_search_analytics",
                "value": slot["clicks"],
            },
            "ENGAGED": {"status": "UNKNOWN", "authority": "analytics", "value": None},
            "LEAD": {"status": "UNKNOWN", "authority": "warmbly", "value": None},
            "PIPELINE": {"status": "UNKNOWN", "authority": "warmbly", "value": None},
        }
        out.append(slot)
    out.sort(key=lambda r: (-(r["impressions"] or -1), r["path"]))
    return out


def build_operational_baseline(
    snapshot: dict[str, Any] | None = None,
    *,
    today: date | None = None,
    versions: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Machine-readable 7/28/prior-28/90 baseline. Absence is null, never zero."""
    today = today or property_today()
    payload = dict(snapshot or load_labeled_snapshot())
    kind = classify_snapshot_source(payload)
    rows = list(payload.get("queries") or [])
    provider_max = None
    dates = [str(r.get("date")) for r in rows if r.get("date")]
    if dates:
        provider_max = date.fromisoformat(max(dates))
    elif payload.get("max_date"):
        try:
            provider_max = date.fromisoformat(str(payload["max_date"])[:10])
        except ValueError:
            provider_max = None
    windows = complete_windows(today=today, provider_max_date=provider_max)
    freshness = snapshot_freshness(payload, today=today)
    ready = (
        kind in LIVE_SOURCE_KINDS
        and payload.get("synthetic") is not True
        and freshness == "CURRENT"
        and payload.get("ready_for_product_decisions") is not False
    )
    detections = detect_all(rows) if rows else detect_all([])
    pages = _page_status_rows(rows)
    blocker = payload if kind == "credential_failure" else None
    if kind == "credential_failure" and not blocker:
        blocker = credential_blocker_record()
    return {
        "schema": "organic_demand_control_baseline/v1",
        "campaign": "CONFENGE-WEB-SEO-DEMAND-CONTROL-02",
        "as_of": windows["last_complete_day"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "America/Sao_Paulo",
        "versions": versions
        or {
            "brand_classification": BRAND_CLASSIFICATION_VERSION,
            "window_policy": WINDOW_POLICY_VERSION,
            "baseline": "organic_demand_control_baseline/v1",
        },
        "source_kind": kind,
        "source": payload.get("source") or kind,
        "synthetic": payload.get("synthetic") is True or kind in {"fixture", "historical_csv_export"},
        "fixture": kind == "fixture",
        "historical": kind == "historical_csv_export",
        "truncated": kind == "search_analytics_top_row_truncation" or bool(payload.get("truncated")),
        "ready_for_product_decisions": ready,
        "freshness": freshness,
        "live": is_live_gsc_payload(payload) and freshness == "CURRENT",
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "zero_inferred_from_absence": False,
        "windows": {
            "pulse_7": {
                **windows["pulse"],
                "totals": _window_totals(rows, windows["pulse"]["days"]),
            },
            "trend_28": {
                **windows["trend"]["current"],
                "totals": _window_totals(rows, windows["trend"]["current"]["days"]),
            },
            "prior_28": {
                **windows["trend"]["prior"],
                "totals": _window_totals(rows, windows["trend"]["prior"]["days"]),
            },
            "context_90": {
                **windows["context"],
                "totals": _window_totals(rows, windows["context"]["days"]),
            },
        },
        "brand_classes": detections.get("brand_classes"),
        "grain": ["date", "query", "page", "country", "device"],
        "authorities": {
            "appearance": "gsc_search_analytics",
            "click": "gsc_search_analytics",
            "session_referral": "analytics_UNKNOWN",
            "engagement": "analytics_UNKNOWN",
            "lead": "warmbly_UNKNOWN",
            "pipeline": "warmbly_UNKNOWN",
        },
        "priority_urls": pages[:25],
        "detections": {
            "wrong_landing": detections.get("wrong_landing"),
            "cannibalization": detections.get("cannibalization"),
            "striking_distance": detections.get("striking_distance"),
            "indexable_without_impressions": detections.get("indexable_without_impressions"),
        },
        "defects": _technical_defects(kind, freshness, payload),
        "coverage_limits": {
            "search_analytics_top_rows_only": True,
            "not_in_top_rows_is_not_zero": True,
            "query_not_joined_to_lead": True,
            "row_count": len(rows),
            "note": SEARCH_ANALYTICS_LIMITATION,
        },
        "blocker": {
            "secret": "GSC_CREDENTIALS_JSON",
            "required_env": list(REQUIRED_GSC_ENV),
            "env_presence": (blocker or payload).get("env_presence"),
            "consequence": (blocker or payload).get("consequence"),
            "external_action": CREDENTIAL_BLOCKER_ACTION,
        }
        if kind == "credential_failure"
        else None,
        "recommendation_enum_context": "NEEDS_EXTERNAL_SECRET"
        if kind == "credential_failure"
        else ("MERGE_CANDIDATE" if ready else "NEEDS_EXTERNAL_SECRET" if freshness == "BLOCKED" else "MERGE_CANDIDATE"),
    }


def _technical_defects(kind: str, freshness: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    defects: list[dict[str, Any]] = []
    if kind == "credential_failure":
        defects.append(
            {
                "id": "gsc_credentials_missing",
                "severity": "blocker",
                "cause": "GSC_CREDENTIALS_JSON and/or GSC_SITE_URL unset or empty in the runtime env",
                "evidence": payload.get("env_presence") or credential_presence()["env_presence"],
                "action": CREDENTIAL_BLOCKER_ACTION,
            }
        )
    if freshness == "STALE":
        defects.append(
            {
                "id": "gsc_snapshot_stale",
                "severity": "warning",
                "cause": "latest labeled Search Analytics snapshot is older than the expected complete-day window",
                "max_date": payload.get("max_date") or payload.get("as_of"),
                "action": "Re-run live pull after secrets are present. Do not treat the snapshot as current.",
            }
        )
    if kind in {"fixture", "historical_csv_export"}:
        defects.append(
            {
                "id": "non_live_snapshot",
                "severity": "info",
                "cause": f"source_kind={kind} is not Search Analytics live",
                "action": "Do not promote this snapshot to product decisions.",
            }
        )
    return defects


def _queue_candidate(
    *,
    rank: int,
    diagnosis: str,
    query_job: str,
    current_url: str,
    intended_url: str,
    evidence: dict[str, Any],
    hypothesis: str,
    impact: str,
    change: str,
    first_test: str,
    earliest: str,
    observe_only: bool,
    exclusion: str | None,
) -> dict[str, Any]:
    return {
        "rank": rank,
        "action": "observe_only" if observe_only else "recommend_change",
        "diagnosis": diagnosis,
        "query_job_intent": query_job,
        "current_landing": current_url,
        "intended_landing": intended_url,
        "evidence": evidence,
        "falsifiable_hypothesis": hypothesis,
        "probable_commercial_impact": impact,
        "cannibalization_risk": evidence.get("cannibalization_risk") or "UNKNOWN",
        "minimal_suggested_change": change if not observe_only else "none_this_cycle_observe_only",
        "first_test": first_test,
        "earliest_safe_action_at": earliest,
        "owner": QUEUE_OWNER,
        "kill_revert_gate": (
            "Revert if the next two complete GSC windows show no lift on the named query "
            "while position is stable, or if a sibling URL cannibalizes the same non-brand intent."
        ),
        "observe_only": observe_only,
        "exclusion": exclusion,
        "authorizes_html_edit": False,
        "invented_revenue": False,
    }


def build_next_action_queue(
    snapshot: dict[str, Any] | None = None,
    *,
    today: date | None = None,
    max_items: int = QUEUE_MAX,
) -> dict[str, Any]:
    """At most three next actions. Active experiments are observe-only, never change-now."""
    today = today or property_today()
    payload = dict(snapshot or load_labeled_snapshot())
    kind = classify_snapshot_source(payload)
    rows = list(payload.get("queries") or [])
    detections = detect_all(rows)
    earliest = (today + timedelta(days=28)).isoformat()
    candidates: list[dict[str, Any]] = []

    # Always surface the three in-measurement families first as observe-only.
    observe_specs = [
        {
            "diagnosis": "ctr_gap",
            "query_job": "desonerado e não desonerado / sinapi desonerado (informational)",
            "current_url": "https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/",
            "intended_url": "https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/",
            "exclusion": "#126",
            "hypothesis": "Snippet rewrite already shipped; CTR on the named query moves vs 1.12% URL CTR after 14/28 complete days.",
            "impact": "Qualified clicks on the only URL with enough historical impressions to falsify a snippet hypothesis. No revenue invented.",
            "first_test": "Compare next complete 14d and 28d Search Analytics windows to seo/gsc-2026-08-09. Do not edit copy now.",
        },
        {
            "diagnosis": "observe_only",
            "query_job": "BOFU service-pillar commercial bridges (aditivos / reequilíbrio / auditoria)",
            "current_url": "https://confenge.com.br/aditivos-obras-publicas/",
            "intended_url": "https://confenge.com.br/aditivos-obras-publicas/",
            "exclusion": "#128",
            "hypothesis": "Post-deploy BOFU bridges change qualified next-action rate without a new editorial URL.",
            "impact": "Service-pillar discovery already in 14/28-day observation. No revenue invented.",
            "first_test": "Keep measurement. Do not restage title/H1/CTA in this cycle.",
        },
        {
            "diagnosis": "observe_only",
            "query_job": "striking-distance noindex canary (chuva prorrogação)",
            "current_url": "https://confenge.com.br/conteudos/chuva-prorrogacao-prazo-obra-publica/",
            "intended_url": "https://confenge.com.br/conteudos/chuva-prorrogacao-prazo-obra-publica/",
            "exclusion": "#127",
            "hypothesis": "Demand is a review signal, not an index warrant. approve_cli INDEXABLE remains the only robots flip.",
            "impact": "Avoid premature indexation of a thin/generic answer. No revenue invented.",
            "first_test": "Leave noindex in place until rewrite_complete and named human INDEXABLE.",
        },
    ]

    denom = None
    for row in rows:
        imps = optional_metric(row, "impressions")
        if imps is not None:
            denom = (denom or 0.0) + imps
    evidence_base = {
        "source_kind": kind,
        "denominator_impressions": denom,
        "denominator_status": "ABSENT" if denom is None else "observed",
        "row_count": len(rows),
        "zero_inferred_from_absence": False,
        "ready_for_product_decisions": False
        if kind != "search_analytics_api"
        else payload.get("ready_for_product_decisions"),
        "cannibalization_risk": detections.get("cannibalization", {}).get("status"),
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
    }

    change_now: list[dict[str, Any]] = []
    # Detectors may propose change-now only for non-excluded URLs with a real denominator.
    for item in detections.get("wrong_landing", {}).get("items") or []:
        landed = str(item.get("landed") or "")
        intended = str(item.get("intended") or "")
        if exclusion_for_url(landed) or exclusion_for_url(intended):
            continue
        if optional_metric(item, "impressions") is None:
            continue
        change_now.append(
            {
                "diagnosis": "wrong_landing",
                "query_job": "non-brand query landed off the intended operational URL",
                "current_url": landed,
                "intended_url": intended,
                "exclusion": None,
                "hypothesis": "Aligning internal signals to the intended URL increases qualified clicks without a new page.",
                "impact": "Wrong landing wastes existing impressions. No revenue invented.",
                "first_test": "Confirm query×page join on the next live complete-day window before any copy change.",
                "change": "Do not edit HTML in this PR. If later authorized: internal-link/canonical alignment only.",
            }
        )

    selected: list[dict[str, Any]] = []
    for spec in change_now:
        if len(selected) >= max_items:
            break
        selected.append({**spec, "observe_only": False})
    for spec in observe_specs:
        if len(selected) >= max_items:
            break
        selected.append({**spec, "observe_only": True, "change": "none_this_cycle_observe_only"})

    for i, spec in enumerate(selected[:max_items], start=1):
        candidates.append(
            _queue_candidate(
                rank=i,
                diagnosis=spec["diagnosis"],
                query_job=spec["query_job"],
                current_url=spec["current_url"],
                intended_url=spec["intended_url"],
                evidence=evidence_base,
                hypothesis=spec["hypothesis"],
                impact=spec["impact"],
                change=spec.get("change") or "none_this_cycle_observe_only",
                first_test=spec["first_test"],
                earliest=earliest,
                observe_only=spec["observe_only"],
                exclusion=spec.get("exclusion"),
            )
        )

    return {
        "schema": "organic_demand_control_queue/v1",
        "campaign": "CONFENGE-WEB-SEO-DEMAND-CONTROL-02",
        "as_of": today.isoformat(),
        "source_kind": kind,
        "ready_for_product_decisions": False,
        "max_items": max_items,
        "count": len(candidates),
        "authorizes_html_edit": False,
        "excluded_families": [
            "#126",
            "#127",
            "#128",
            "#60",
            "#83",
            "#84",
            "#89",
            "checkout",
            "SmartLic",
        ],
        "candidates": candidates,
        "zero_inferred_from_absence": False,
        "search_analytics_limitation": SEARCH_ANALYTICS_LIMITATION,
        "note": "Queue is a recommendation. It does not authorize HTML/copy/robots edits in this PR.",
    }


def render_human_report(baseline: dict[str, Any], queue: dict[str, Any]) -> str:
    """Human report that must reconcile with the machine baseline on as_of/source/queue."""
    windows = baseline.get("windows") or {}
    pulse = windows.get("pulse_7") or {}
    trend = windows.get("trend_28") or {}
    prior = windows.get("prior_28") or {}
    ctx = windows.get("context_90") or {}
    defects = baseline.get("defects") or []
    blocker = baseline.get("blocker")
    lines = [
        "# Organic demand-control report",
        "",
        f"- campaign: `{baseline.get('campaign')}`",
        f"- as_of (last complete day): `{baseline.get('as_of')}`",
        f"- timezone: `{baseline.get('timezone')}`",
        f"- source_kind: `{baseline.get('source_kind')}`",
        f"- freshness: `{baseline.get('freshness')}`",
        f"- ready_for_product_decisions: `{str(baseline.get('ready_for_product_decisions')).lower()}`",
        f"- live: `{str(baseline.get('live')).lower()}`",
        f"- synthetic/fixture/historical: `{baseline.get('synthetic')}` / `{baseline.get('fixture')}` / `{baseline.get('historical')}`",
        f"- truncated: `{baseline.get('truncated')}`",
        f"- versions: `{json.dumps(baseline.get('versions') or {}, sort_keys=True)}`",
        "",
        "## Complete-day windows",
        "",
        f"- pulse 7: `{pulse.get('start')}` → `{pulse.get('end')}` coverage `{ (pulse.get('totals') or {}).get('coverage') }`",
        f"- trend 28: `{trend.get('start')}` → `{trend.get('end')}` coverage `{ (trend.get('totals') or {}).get('coverage') }`",
        f"- prior 28: `{prior.get('start')}` → `{prior.get('end')}` coverage `{ (prior.get('totals') or {}).get('coverage') }`",
        f"- context 90: `{ctx.get('start')}` → `{ctx.get('end')}` coverage `{ (ctx.get('totals') or {}).get('coverage') }`",
        "",
        "Absence is ABSENT/UNKNOWN with null value — never numeric zero. Search Analytics top-row omission is not zero impressions.",
        "",
        "## Brand split (returned set only)",
        "",
    ]
    for window_name, blob in (("pulse_7", pulse), ("trend_28", trend), ("prior_28", prior), ("context_90", ctx)):
        totals = blob.get("totals") or {}
        lines.append(f"### {window_name}")
        for label in ("brand", "legacy_brand", "non_brand"):
            cell = totals.get(label) or {}
            lines.append(
                f"- {label}: impressions `{cell.get('impressions')}` clicks `{cell.get('clicks')}`"
            )
        lines.append("")
    lines.extend(
        [
            "## Authorities (uncollapsed)",
            "",
            "- appearance / click: Search Analytics",
            "- session / referral / engagement: analytics (UNKNOWN unless imported)",
            "- lead / pipeline: Warmbly (UNKNOWN; query is never joined to a person)",
            "",
            "## Technical defects",
            "",
        ]
    )
    if not defects:
        lines.append("- none recorded")
    for defect in defects:
        lines.append(
            f"- `{defect.get('id')}` ({defect.get('severity')}): {defect.get('cause')}"
        )
    if blocker:
        lines.extend(
            [
                "",
                "## External blocker",
                "",
                f"- secret: `{blocker.get('secret')}`",
                f"- required_env: `{', '.join(blocker.get('required_env') or [])}`",
                f"- consequence: {blocker.get('consequence')}",
                f"- one external action: {blocker.get('external_action')}",
            ]
        )
    lines.extend(["", "## Next-action queue (max 3, recommendation only)", ""])
    cands = queue.get("candidates") or []
    lines.append(f"- queue_length: `{len(cands)}`")
    lines.append(f"- authorizes_html_edit: `{str(queue.get('authorizes_html_edit')).lower()}`")
    for cand in cands:
        lines.extend(
            [
                "",
                f"### {cand.get('rank')}. {cand.get('diagnosis')} ({cand.get('action')})",
                f"- query/job/intent: {cand.get('query_job_intent')}",
                f"- current landing: `{cand.get('current_landing')}`",
                f"- intended landing: `{cand.get('intended_landing')}`",
                f"- evidence denominator: `{ (cand.get('evidence') or {}).get('denominator_impressions') }` "
                f"status `{(cand.get('evidence') or {}).get('denominator_status')}`",
                f"- hypothesis: {cand.get('falsifiable_hypothesis')}",
                f"- impact: {cand.get('probable_commercial_impact')}",
                f"- cannibalization risk: `{cand.get('cannibalization_risk')}`",
                f"- minimal change: {cand.get('minimal_suggested_change')}",
                f"- first test: {cand.get('first_test')}",
                f"- earliest_safe_action_at: `{cand.get('earliest_safe_action_at')}`",
                f"- owner: `{cand.get('owner')}`",
                f"- exclusion: `{cand.get('exclusion')}`",
                f"- kill/revert: {cand.get('kill_revert_gate')}",
            ]
        )
    lines.extend(
        [
            "",
            "## Coverage limits",
            "",
            f"- {SEARCH_ANALYTICS_LIMITATION}",
            "- Individual queries are hashed in git-safe output and are never joined to a lead.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def write_demand_control_artifacts(
    *,
    snapshot: dict[str, Any] | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Write reconciling JSON + markdown under data/organic and docs/ops."""
    baseline = build_operational_baseline(snapshot, today=today)
    queue = build_next_action_queue(snapshot, today=today)
    report = render_human_report(baseline, queue)
    json_path = ROOT / "data" / "organic" / "demand-control-baseline.json"
    queue_path = ROOT / "data" / "organic" / "demand-control-queue.json"
    md_path = ROOT / "docs" / "ops" / "ORGANIC-DEMAND-CONTROL-REPORT.md"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    queue_path.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(report, encoding="utf-8")
    return {
        "ok": True,
        "as_of": baseline.get("as_of"),
        "source_kind": baseline.get("source_kind"),
        "queue_length": queue.get("count"),
        "baseline_path": str(json_path.relative_to(ROOT)),
        "queue_path": str(queue_path.relative_to(ROOT)),
        "report_path": str(md_path.relative_to(ROOT)),
        "ready_for_product_decisions": baseline.get("ready_for_product_decisions"),
        "baseline": baseline,
        "queue": queue,
        "report": report,
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

    p_base = sub.add_parser(
        "baseline",
        help="Write reconciling machine baseline + human report + next-action queue",
    )
    p_base.add_argument("--snapshot", type=Path, default=None)
    p_base.add_argument("--dry-run", action="store_true")

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
            rows = result.get("rows")
            print(
                "GSC_SMOKE ok={ok} error={err} source_kind={kind} site={site} rows={rows} max_date={max_date} "
                "ready_for_product_decisions={ready}".format(
                    ok=str(bool(result.get("ok"))).lower(),
                    err=result.get("error") or "none",
                    kind=classify_snapshot_source(result),
                    site=result.get("site") or env_nonempty("GSC_SITE_URL") or "unset",
                    rows="none" if rows is None else rows,
                    max_date=result.get("max_date") or "none",
                    ready=str(bool(result.get("ready_for_product_decisions"))).lower(),
                )
            )
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get("ok") and result.get("ready_for_product_decisions") is True:
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
            rows = result.get("rows")
            print(
                "GSC_SMOKE ok={ok} error={err} source_kind={kind} source={src} max_date={max_date} "
                "ready_for_product_decisions={ready} synthetic={syn} rows={rows}".format(
                    ok=str(bool(result.get("ok"))).lower(),
                    err=result.get("error") or "none",
                    kind=classify_snapshot_source(result),
                    src=result.get("source") or classify_snapshot_source(result),
                    max_date=result.get("max_date") or "none",
                    ready=str(bool(result.get("ready_for_product_decisions"))).lower(),
                    syn=str(bool(result.get("synthetic"))).lower(),
                    rows="none" if rows is None else rows,
                )
            )
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get("ok") and (
            result.get("ready_for_product_decisions") is True or args.fixture
        ):
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

    if args.cmd == "baseline":
        snapshot = None
        if args.snapshot:
            path = args.snapshot if args.snapshot.is_absolute() else ROOT / args.snapshot
            snapshot = load_labeled_snapshot(path)
        if args.dry_run:
            baseline = build_operational_baseline(snapshot)
            queue = build_next_action_queue(snapshot)
            print(
                json.dumps(
                    {
                        "ok": True,
                        "dry_run": True,
                        "as_of": baseline.get("as_of"),
                        "source_kind": baseline.get("source_kind"),
                        "freshness": baseline.get("freshness"),
                        "ready_for_product_decisions": baseline.get("ready_for_product_decisions"),
                        "queue_length": queue.get("count"),
                        "windows": {
                            "pulse": (baseline.get("windows") or {}).get("pulse_7", {}).get("start"),
                            "trend": (baseline.get("windows") or {}).get("trend_28", {}).get("start"),
                            "prior": (baseline.get("windows") or {}).get("prior_28", {}).get("start"),
                            "context": (baseline.get("windows") or {}).get("context_90", {}).get("start"),
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        written = write_demand_control_artifacts(snapshot=snapshot)
        print(
            json.dumps(
                {k: v for k, v in written.items() if k not in {"baseline", "queue", "report"}},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
