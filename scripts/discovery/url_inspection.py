"""Read-only Google URL Inspection. Never calls the Google Indexing API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from scripts.revops.search_demand_observatory import _gsc_credentials, credential_presence

INSPECTION_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
INDEXING_API_CALLED = False


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def inspect_one(url: str, *, inspected_at: str | None = None) -> dict[str, Any]:
    """Inspect one URL. Missing creds or API errors become UNKNOWN, never invented."""
    stamp = inspected_at or _utc_now()
    presence = credential_presence()
    if not presence["present"]:
        return {
            "url": url,
            "ok": False,
            "error": "missing_credentials",
            "index_state": "UNKNOWN",
            "coverage_state": "UNKNOWN",
            "inspected_at": stamp,
            "indexing_api_called": False,
            "provider_response": None,
            "source": "url_inspection_api",
        }
    resolved, err = _gsc_credentials()
    if err:
        return {
            "url": url,
            "ok": False,
            "error": err.get("error") or "credential_error",
            "index_state": "UNKNOWN",
            "coverage_state": "UNKNOWN",
            "inspected_at": stamp,
            "indexing_api_called": False,
            "provider_response": None,
            "source": "url_inspection_api",
        }
    creds, site = resolved
    try:
        from googleapiclient.discovery import build
    except ImportError:
        return {
            "url": url,
            "ok": False,
            "error": "google_api_client_not_installed",
            "index_state": "UNKNOWN",
            "coverage_state": "UNKNOWN",
            "inspected_at": stamp,
            "indexing_api_called": False,
            "provider_response": None,
            "source": "url_inspection_api",
        }
    try:
        service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
        body = {"inspectionUrl": url, "siteUrl": site}
        resp = service.urlInspection().index().inspect(body=body).execute()
    except Exception as exc:  # noqa: BLE001 — preserve UNKNOWN, never invent index
        return {
            "url": url,
            "ok": False,
            "error": type(exc).__name__,
            "index_state": "UNKNOWN",
            "coverage_state": "UNKNOWN",
            "inspected_at": stamp,
            "indexing_api_called": False,
            "provider_response": None,
            "source": "url_inspection_api",
        }
    result = (resp or {}).get("inspectionResult") or {}
    index_status = (result.get("indexStatusResult") or {})
    return {
        "url": url,
        "ok": True,
        "error": None,
        "index_state": index_status.get("coverageState") or "UNKNOWN",
        "coverage_state": index_status.get("coverageState") or "UNKNOWN",
        "verdict": index_status.get("verdict") or "UNKNOWN",
        "last_crawl": index_status.get("lastCrawlTime") or "UNKNOWN",
        "inspected_at": stamp,
        "indexing_api_called": False,
        "provider_response": resp,
        "source": "url_inspection_api",
        "site": site,
    }


def inspect_urls(urls: list[str], *, inspected_at: str | None = None) -> dict[str, Any]:
    stamp = inspected_at or _utc_now()
    presence = credential_presence()
    inspections = [inspect_one(url, inspected_at=stamp) for url in urls]
    any_ok = any(row.get("ok") for row in inspections)
    first_err = next((row.get("error") for row in inspections if row.get("error")), None)
    return {
        "ok": any_ok,
        "error": None if any_ok else (first_err or "missing_credentials"),
        "inspected_at": stamp,
        "indexing_api_called": INDEXING_API_CALLED,
        "credential_present": presence["present"],
        "scope": INSPECTION_SCOPE,
        "inspections": inspections,
        "note": (
            "URL Inspection is read-only. The Google Indexing API is not the authorized "
            "mechanism for ordinary CONFENGE pages. UNKNOWN is preserved when the provider "
            "does not answer."
        ),
    }


def founder_manual_checklist(
    urls: list[dict[str, Any]],
    *,
    inspected_at: str | None = None,
) -> str:
    """One-screen founder checklist. Manual 'Solicitar indexação' only."""
    stamp = inspected_at or _utc_now()
    date_label = stamp[:10]
    lines = [
        "FOUNDER GSC MANUAL — 4 URLS",
        f"date: {date_label}",
        "property: sc-domain:confenge.com.br  OR  https://confenge.com.br/",
        "tool: Search Console → Inspeção de URL",
        "do_not_use: Google Indexing API (not authorized for these ordinary pages)",
        "",
    ]
    for idx, row in enumerate(urls, start=1):
        url = row.get("url")
        tech = row.get("technical_state") or "UNKNOWN"
        field = row.get("inspection_field") or "UNKNOWN"
        lines.extend(
            [
                f"{idx}. {url}",
                f"   technical_state: {tech}",
                f"   inspection_field: {field}",
                "   action: paste the URL → wait for the inspection card → click "
                "“Solicitar indexação” if Google reports the live URL is not indexed "
                "or the last crawl is stale.",
                f"   date: {date_label}",
                "",
            ]
        )
    lines.extend(
        [
            "After the four requests, record the inspection card screenshot privately.",
            "Do not treat the request as INDEX. Appearance still needs Search Analytics.",
            "",
        ]
    )
    return "\n".join(lines)
