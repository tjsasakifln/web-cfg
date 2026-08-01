#!/usr/bin/env python3
"""Typed GSC URL states and calculated next_wave_gate (never hand-edited true).

Rules (fail-closed):
  index,follow ≠ discovered
  NOT_INSPECTED ≠ gate approved
  bare indexed=true is never accepted as evidence (see gsc_ingest)
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

# Per-URL typed states (mission vocabulary)
GSC_URL_STATES = frozenset(
    {
        "NOT_INSPECTED",
        "INSPECTION_PENDING",
        "DISCOVERED_NOT_CRAWLED",
        "CRAWLED_NOT_INDEXED",
        "INDEXED",
        "SOFT_404",
        "DUPLICATE_GOOGLE_CANONICAL",
        "BLOCKED_BY_ROBOTS",
        "NOINDEX_DETECTED",
        "UNKNOWN_ERROR",
    }
)

# States that count as "discovered or crawled" for the 75% threshold
DISCOVERED_OR_CRAWLED = frozenset(
    {
        "DISCOVERED_NOT_CRAWLED",
        "CRAWLED_NOT_INDEXED",
        "INDEXED",
    }
)

BLOCKING_STATES = frozenset(
    {
        "SOFT_404",
        "DUPLICATE_GOOGLE_CANONICAL",
        "BLOCKED_BY_ROBOTS",
        "NOINDEX_DETECTED",
    }
)

GSC_ACCESS_NO_CREDS = "NOT_INSPECTED_NO_CREDENTIALS"
GSC_ACCESS_OK = "INSPECTED_WITH_EVIDENCE"
GSC_ACCESS_PARTIAL = "PARTIAL_INSPECTION"

AUDITOR_VERSION = "wave0-closure-02"


def empty_url_record(url: str) -> dict[str, Any]:
    return {
        "url": url,
        "state": "NOT_INSPECTED",
        "evidence_origin": None,
        "inspection_source": None,
        "inspection_timestamp": None,
        "captured_at": None,
        "declared_canonical": None,
        "user_canonical": None,
        "google_canonical": None,
        "last_crawl_at": None,
        "last_crawl_time": None,
        "coverage": None,
        "coverage_state": None,
        "indexing_state": None,
        "robots_txt_state": None,
        "page_fetch_state": None,
        "referring_urls": [],
        "verdict": None,
        "notes": [],
        "evidence_id": None,
    }


def normalize_url_record(raw: dict[str, Any], url: str | None = None) -> dict[str, Any]:
    base = empty_url_record(url or raw.get("url") or "")
    state = raw.get("state") or raw.get("status") or "NOT_INSPECTED"
    # Map legacy labels
    if state in {
        "NOT_INSPECTED_NO_CREDENTIALS",
        "NOT_INSPECTED",
        None,
        "",
    }:
        state = "NOT_INSPECTED"
    if state not in GSC_URL_STATES:
        state = "UNKNOWN_ERROR"
    user_can = (
        raw.get("user_canonical")
        or raw.get("declared_canonical")
        or raw.get("userCanonical")
    )
    last_crawl = raw.get("last_crawl_at") or raw.get("last_crawl_time") or raw.get("lastCrawlTime")
    coverage = raw.get("coverage") or raw.get("coverage_state") or raw.get("coverageState")
    origin = raw.get("evidence_origin") or raw.get("origin") or raw.get("inspection_source")
    base.update(
        {
            "url": url or raw.get("url") or base["url"],
            "state": state,
            "evidence_origin": origin,
            "inspection_source": raw.get("inspection_source") or origin,
            "inspection_timestamp": raw.get("inspection_timestamp")
            or raw.get("captured_at")
            or raw.get("capture_date"),
            "captured_at": raw.get("captured_at") or raw.get("capture_date"),
            "declared_canonical": user_can,
            "user_canonical": user_can,
            "google_canonical": raw.get("google_canonical") or raw.get("googleCanonical"),
            "last_crawl_at": last_crawl,
            "last_crawl_time": last_crawl,
            "coverage": coverage,
            "coverage_state": coverage,
            "indexing_state": raw.get("indexing_state") or raw.get("indexingState"),
            "robots_txt_state": raw.get("robots_txt_state")
            or raw.get("robots")
            or raw.get("robotsTxtState"),
            "page_fetch_state": raw.get("page_fetch_state") or raw.get("pageFetchState"),
            "referring_urls": list(
                raw.get("referring_urls") or raw.get("referringUrls") or []
            ),
            "verdict": raw.get("verdict") or raw.get("index_status_verdict"),
            "notes": list(raw.get("notes") or []),
            "evidence_id": raw.get("evidence_id") or raw.get("evidence_file"),
        }
    )
    return base


def load_indexation_status(path: Path | None = None) -> dict[str, Any]:
    path = path or (ROOT / "seo" / "pseo-indexation-status.json")
    if not path.exists():
        return {
            "gsc_access": GSC_ACCESS_NO_CREDS,
            "urls": {},
            "generated_at": None,
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    # Support both map and list shapes
    urls_raw = data.get("urls") or data.get("gsc_state_by_url") or data.get("pages") or {}
    urls: dict[str, dict[str, Any]] = {}
    if isinstance(urls_raw, dict):
        for k, v in urls_raw.items():
            if isinstance(v, str):
                urls[k] = normalize_url_record({"state": v, "url": k}, k)
            elif isinstance(v, dict):
                urls[k] = normalize_url_record(v, k)
    elif isinstance(urls_raw, list):
        for row in urls_raw:
            if not isinstance(row, dict):
                continue
            u = row.get("url") or row.get("path") or ""
            urls[u] = normalize_url_record(row, u)
    return {
        "gsc_access": data.get("gsc_access") or GSC_ACCESS_NO_CREDS,
        "urls": urls,
        "generated_at": data.get("generated_at"),
        "raw": data,
    }


def seed_paths_from_registry(reg: dict[str, Any] | None = None) -> list[str]:
    if reg is None:
        reg_path = ROOT / "data" / "pseo" / "registry.json"
        if reg_path.exists():
            reg = json.loads(reg_path.read_text(encoding="utf-8"))
        else:
            reg = {"pages": []}
    out = []
    for p in reg.get("pages") or []:
        if p.get("status") == "publish" and p.get("url"):
            out.append(p["url"])
    return sorted(set(out))


def compute_next_wave_gate(
    *,
    seed_urls: list[str],
    gsc_access: str,
    gsc_by_url: dict[str, dict[str, Any]],
    production_audit_ok: bool,
    production_audit_is_current: bool,
    extra_cli_on_main: bool,
    reexport_without_undue_invalidation: bool = False,
    snapshot_source_on_main: bool = False,
    min_discovered_ratio: float = 0.75,
    new_pages_published: int = 0,
    pages_added: list[str] | None = None,
) -> dict[str, Any]:
    """Return {allowed: bool, reasons: [...], metrics: {...}} — never invent true."""
    reasons: list[str] = []
    n = len(seed_urls)
    if n == 0:
        reasons.append("no_indexable_seeds")

    inspected = 0
    discovered = 0
    blocking: list[str] = []
    uninspected: list[str] = []

    for url in seed_urls:
        rec = gsc_by_url.get(url) or gsc_by_url.get(url.rstrip("/")) or empty_url_record(url)
        # also try path-only keys
        if rec["state"] == "NOT_INSPECTED" and url.startswith("http"):
            path = "/" + "/".join(url.split("/")[3:])
            if not path.endswith("/"):
                path += "/"
            rec = gsc_by_url.get(path) or rec
        state = rec.get("state") or "NOT_INSPECTED"
        if state == "NOT_INSPECTED" or state == "INSPECTION_PENDING":
            uninspected.append(url)
        else:
            inspected += 1
        if state in DISCOVERED_OR_CRAWLED:
            discovered += 1
        if state in BLOCKING_STATES:
            blocking.append(f"{url}:{state}")

    if gsc_access == GSC_ACCESS_NO_CREDS or gsc_access == "NOT_INSPECTED_NO_CREDENTIALS":
        reasons.append("gsc_access_NOT_INSPECTED_NO_CREDENTIALS")

    if uninspected:
        reasons.append(f"uninspected_seeds={len(uninspected)}")

    need = math.ceil(min_discovered_ratio * n) if n else 0
    if discovered < need:
        reasons.append(f"discovered_or_crawled={discovered}<{need}")

    if blocking:
        reasons.append(f"blocking_states={blocking}")

    if not production_audit_ok:
        reasons.append("production_audit_not_ok")
    if not production_audit_is_current:
        reasons.append("production_audit_stale_or_mismatch")
    if not extra_cli_on_main:
        reasons.append("extra_cli_exporter_not_on_main")
    if not snapshot_source_on_main:
        reasons.append("snapshot_source_commit_not_on_extra_cli_main")
    if not reexport_without_undue_invalidation:
        reasons.append("reexport_without_undue_invalidation_not_proven")

    # Campaign freeze: any new public page path blocks Wave 1 expansion
    added = list(pages_added or [])
    if int(new_pages_published or 0) > 0:
        reasons.append(f"new_pages_published={int(new_pages_published)}")
    if added:
        reasons.append(f"pages_added={added}")

    allowed = len(reasons) == 0 and n > 0

    return {
        "allowed": allowed,
        # Mission: next_wave_gate is calculated; expose both shapes
        "next_wave_gate": allowed,
        "gsc_discovery_or_crawl_without_soft404": (
            discovered >= need
            and not any(b.endswith(":SOFT_404") for b in blocking)
            and gsc_access not in {GSC_ACCESS_NO_CREDS, "NOT_INSPECTED_NO_CREDENTIALS"}
            and not uninspected
        ),
        "reasons": reasons,
        "metrics": {
            "indexable_seed_count": n,
            "inspected_count": inspected,
            "discovered_or_crawled_count": discovered,
            "required_discovered": need,
            "uninspected": uninspected,
            "blocking": blocking,
            "new_pages_published": int(new_pages_published or 0),
            "pages_added": added,
        },
        "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "auditor_version": AUDITOR_VERSION,
    }


def build_gsc_state_by_url(
    seed_urls: list[str],
    existing: dict[str, dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    existing = existing or {}
    out: dict[str, dict[str, Any]] = {}
    for url in seed_urls:
        path = url
        if url.startswith("http"):
            path = "/" + "/".join(url.split("/")[3:])
            if not path.endswith("/"):
                path += "/"
        rec = (
            existing.get(url)
            or existing.get(path)
            or existing.get(url.rstrip("/"))
            or empty_url_record(path)
        )
        out[path] = normalize_url_record(rec, path)
    return out


def default_not_inspected_status(seed_urls: list[str]) -> dict[str, Any]:
    by_url = build_gsc_state_by_url(seed_urls, {})
    return {
        "schema_version": "2.0.0",
        "gsc_access": GSC_ACCESS_NO_CREDS,
        "note": (
            "No URL Inspection API credentials or validated ingest evidence. "
            "States are NOT_INSPECTED. next_wave_gate cannot be true."
        ),
        "urls": by_url,
        "gsc_state_by_url": by_url,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "auditor_version": AUDITOR_VERSION,
    }
