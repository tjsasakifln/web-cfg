"""Honest GSC evidence: historical CSV is not live Search Analytics."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.bofu_dominance.core.constants import (
    GSC_LIVE_RECOMMENDATION,
    GSC_LIVE_STATE,
    HISTORICAL_GSC_AS_OF,
    HISTORICAL_GSC_DIR,
    LAST_SYNC_PATH,
)


def load_last_sync(path: Path | None = None) -> dict[str, Any]:
    target = path or LAST_SYNC_PATH
    if not target.is_file():
        return {
            "blocked": True,
            "error": "last_sync_missing",
            "gsc_live_state": GSC_LIVE_STATE,
            "recommendation": GSC_LIVE_RECOMMENDATION,
        }
    payload = json.loads(target.read_text(encoding="utf-8"))
    error = str(payload.get("error") or "")
    blocked = bool(payload.get("blocked"))
    if blocked or error in {"missing_credentials", "credential_failure"}:
        payload["gsc_live_state"] = GSC_LIVE_STATE
        payload["recommendation"] = GSC_LIVE_RECOMMENDATION
        payload["ready_for_product_decisions"] = False
    return payload


def gsc_live_record(last_sync: dict[str, Any] | None = None) -> dict[str, Any]:
    sync = last_sync or load_last_sync()
    return {
        "gsc_live_state": GSC_LIVE_STATE,
        "recommendation": GSC_LIVE_RECOMMENDATION,
        "ready_for_product_decisions": False,
        "last_sync_blocked": bool(sync.get("blocked", True)),
        "last_sync_error": sync.get("error") or "missing_credentials",
        "required_env": sync.get("required_env")
        or [
            "GSC_SITE_URL",
            "GSC_CREDENTIALS_JSON (service account path or JSON) OR (GSC_CLIENT_SECRETS_JSON + GSC_TOKEN_JSON)",
        ],
        "note": (
            "Absence of live Search Analytics is NEEDS_EXTERNAL_ACTION, "
            "not ranking zero. Historical CSV, redacted snapshots and SERP "
            "samples are not GSC live."
        ),
        "pr_159_role": "observability_candidate_not_merged_to_main",
    }


def _norm_path(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    path = parsed.path or raw
    if not path.startswith("/"):
        path = "/" + path
    if not path.endswith("/"):
        path += "/"
    return path


def _num(row: dict[str, str], *keys: str) -> float | None:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            raw = str(row[key]).strip().replace("%", "").replace(",", ".")
            try:
                return float(raw)
            except ValueError:
                continue
    return None


def load_historical_pages(gsc_dir: Path | None = None) -> list[dict[str, Any]]:
    directory = gsc_dir or HISTORICAL_GSC_DIR
    path = directory / "Paginas.csv"
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            url = (raw.get("Páginas principais") or raw.get("Paginas principais") or "").strip()
            if not url:
                continue
            rows.append(
                {
                    "url": url,
                    "path": _norm_path(url),
                    "clicks": _num(raw, "Cliques"),
                    "impressions": _num(raw, "Impressões", "Impressoes"),
                    "ctr": _num(raw, "CTR"),
                    "position": _num(raw, "Posição", "Posicao"),
                    "source": "historical_csv_not_live",
                    "source_kind": "historical_csv",
                    "date": HISTORICAL_GSC_AS_OF,
                    "geo": "UNKNOWN",
                    "device": "UNKNOWN",
                    "window": "gsc-export-last-7-days-as-of-2026-08-09",
                    "denominator": "impressions_in_export_row",
                    "is_gsc_live": False,
                }
            )
    return rows


def load_historical_queries(gsc_dir: Path | None = None) -> list[dict[str, Any]]:
    directory = gsc_dir or HISTORICAL_GSC_DIR
    path = directory / "Consultas.csv"
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            query = (raw.get("Top consultas") or "").strip()
            if not query:
                continue
            rows.append(
                {
                    "query": query,
                    "clicks": _num(raw, "Cliques"),
                    "impressions": _num(raw, "Impressões", "Impressoes"),
                    "ctr": _num(raw, "CTR"),
                    "position": _num(raw, "Posição", "Posicao"),
                    "source": "historical_csv_not_live",
                    "source_kind": "historical_csv",
                    "date": HISTORICAL_GSC_AS_OF,
                    "geo": "UNKNOWN",
                    "device": "UNKNOWN",
                    "denominator": "impressions_in_export_row",
                    "is_gsc_live": False,
                    "join": "query_page_join_unavailable",
                }
            )
    return rows


def evidence_for_path(
    path: str | None,
    pages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not path:
        return {
            "source": "none",
            "source_kind": "none",
            "date": None,
            "geo": "UNKNOWN",
            "device": "UNKNOWN",
            "denominator": None,
            "impressions": None,
            "clicks": None,
            "position": None,
            "is_gsc_live": False,
            "reason": "no_canonical_path",
        }
    for row in pages or load_historical_pages():
        if row["path"] == path:
            return {
                "source": row["source"],
                "source_kind": row["source_kind"],
                "date": row["date"],
                "geo": row["geo"],
                "device": row["device"],
                "denominator": row["denominator"],
                "impressions": row["impressions"],
                "clicks": row["clicks"],
                "position": row["position"],
                "url": row["url"],
                "is_gsc_live": False,
                "window": row["window"],
                "reason": "historical_csv_row",
            }
    return {
        "source": "historical_csv_not_live",
        "source_kind": "historical_csv",
        "date": HISTORICAL_GSC_AS_OF,
        "geo": "UNKNOWN",
        "device": "UNKNOWN",
        "denominator": "impressions_in_export_row",
        "impressions": None,
        "clicks": None,
        "position": None,
        "path": path,
        "is_gsc_live": False,
        "reason": "path_absent_from_historical_export_not_zero",
    }


def missing_credentials_is_not_zero(live: dict[str, Any] | None = None) -> bool:
    record = live or gsc_live_record()
    return (
        record["gsc_live_state"] == GSC_LIVE_STATE
        and record["recommendation"] == GSC_LIVE_RECOMMENDATION
        and record.get("ready_for_product_decisions") is False
    )
