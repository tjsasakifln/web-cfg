#!/usr/bin/env python3
"""Ingest validated GSC / URL Inspection evidence. Rejects bare indexed=true.

Accepted evidence_origin:
  - url_inspection_api
  - structured_manual_export
  - signed_operator_record

Required fields depend on origin; all require per-URL inspection payload,
not a boolean.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.gsc_gate import (  # noqa: E402
    GSC_ACCESS_OK,
    GSC_ACCESS_PARTIAL,
    GSC_URL_STATES,
    build_gsc_state_by_url,
    normalize_url_record,
    seed_paths_from_registry,
)

ALLOWED_ORIGINS = frozenset(
    {
        "url_inspection_api",
        "structured_manual_export",
        "signed_operator_record",
    }
)

# Map common Inspection API coverage / verdict combos → typed state
def derive_state(row: dict[str, Any]) -> str:
    if row.get("state") in GSC_URL_STATES:
        return row["state"]
    verdict = str(row.get("verdict") or row.get("index_status_verdict") or "").upper()
    coverage = str(row.get("coverage") or row.get("coverage_state") or "").upper()
    robots = str(row.get("robots") or row.get("robots_txt_state") or "").upper()
    indexing = str(row.get("indexing_state") or "").upper()
    page_fetch = str(row.get("page_fetch_state") or "").upper()

    if "SOFT_404" in coverage or "SOFT_404" in verdict or row.get("soft_404") is True:
        return "SOFT_404"
    if "BLOCKED" in robots or "BLOCKED_BY_ROBOTS" in coverage:
        return "BLOCKED_BY_ROBOTS"
    if row.get("noindex") is True or "NOINDEX" in coverage:
        return "NOINDEX_DETECTED"
    if "DUPLICATE" in coverage or "GOOGLE_CHOSE_DIFFERENT" in str(row.get("canonical_state") or "").upper():
        return "DUPLICATE_GOOGLE_CANONICAL"
    if "INDEXED" in verdict or indexing == "INDEXING_ALLOWED" and "SUBMITTED_AND_INDEXED" in coverage:
        return "INDEXED"
    if "CRAWLED" in coverage or "CRAWLED_CURRENTLY_NOT_INDEXED" in coverage:
        return "CRAWLED_NOT_INDEXED"
    if "DISCOVERED" in coverage or "DISCOVERED_CURRENTLY_NOT_INDEXED" in coverage:
        return "DISCOVERED_NOT_CRAWLED"
    if page_fetch and "SUCCESS" not in page_fetch and page_fetch not in {"", "UNSPECIFIED"}:
        return "UNKNOWN_ERROR"
    if verdict or coverage:
        return "UNKNOWN_ERROR"
    return "NOT_INSPECTED"


def validate_inspection_row(row: dict[str, Any], *, origin: str) -> list[str]:
    errors: list[str] = []
    url = row.get("url") or row.get("inspectionUrl") or row.get("path")
    if not url:
        errors.append("missing_url")
    # Reject bare booleans
    if set(row.keys()) <= {"url", "indexed", "path"} and "indexed" in row:
        errors.append("bare_indexed_boolean_rejected")
    if row.get("indexed") is True and not (
        row.get("verdict")
        or row.get("index_status_verdict")
        or row.get("coverage")
        or row.get("coverage_state")
        or row.get("inspectionResult")
        or row.get("state") in GSC_URL_STATES - {"NOT_INSPECTED"}
    ):
        errors.append("indexed_true_without_inspection_fields")

    if origin == "url_inspection_api":
        # Accept nested inspectionResult (Google API shape) or flattened
        ir = row.get("inspectionResult") or row
        idx = ir.get("indexStatusResult") or ir
        if not (
            idx.get("verdict")
            or idx.get("coverageState")
            or idx.get("indexingState")
            or row.get("verdict")
            or row.get("coverage")
        ):
            errors.append("url_inspection_api_missing_index_status_fields")
    elif origin == "structured_manual_export":
        for f in ("captured_at", "verdict"):
            if not row.get(f) and not row.get("coverage"):
                if f == "verdict" and row.get("coverage"):
                    continue
                if f == "captured_at" and row.get("capture_date"):
                    continue
                if not row.get(f) and f == "captured_at":
                    errors.append("structured_export_missing_captured_at")
        if not row.get("verdict") and not row.get("coverage") and not row.get("state"):
            errors.append("structured_export_missing_verdict_or_coverage_or_state")
    elif origin == "signed_operator_record":
        if not row.get("operator") and not row.get("signed_by"):
            errors.append("signed_record_missing_operator")
        if not row.get("captured_at") and not row.get("capture_date"):
            errors.append("signed_record_missing_captured_at")
        if not row.get("state") and not row.get("verdict") and not row.get("coverage"):
            errors.append("signed_record_missing_state_or_verdict")
        if not row.get("evidence_notes") and not row.get("notes"):
            errors.append("signed_record_missing_notes")
    return errors


def flatten_api_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize Google URL Inspection API response into flat fields."""
    out = dict(row)
    ir = row.get("inspectionResult") or {}
    idx = ir.get("indexStatusResult") or {}
    if idx:
        out.setdefault("verdict", idx.get("verdict"))
        out.setdefault("coverage", idx.get("coverageState"))
        out.setdefault("indexing_state", idx.get("indexingState"))
        out.setdefault("page_fetch_state", idx.get("pageFetchState"))
        out.setdefault("robots", idx.get("robotsTxtState"))
        out.setdefault("last_crawl_at", idx.get("lastCrawlTime"))
        out.setdefault("google_canonical", idx.get("googleCanonical"))
        out.setdefault("declared_canonical", idx.get("userCanonical"))
    if row.get("inspectionUrl") and not out.get("url"):
        out["url"] = row["inspectionUrl"]
    return out


def ingest(
    payload: dict[str, Any],
    *,
    seed_urls: list[str] | None = None,
    out_path: Path | None = None,
) -> dict[str, Any]:
    origin = payload.get("evidence_origin") or payload.get("origin")
    if origin not in ALLOWED_ORIGINS:
        raise ValueError(
            f"evidence_origin must be one of {sorted(ALLOWED_ORIGINS)}; got {origin!r}"
        )

    rows = payload.get("urls") or payload.get("inspections") or payload.get("results") or []
    if not isinstance(rows, list) or not rows:
        raise ValueError("input must include non-empty urls/inspections list")

    errors: list[str] = []
    normalized: dict[str, dict[str, Any]] = {}
    for i, raw in enumerate(rows):
        if not isinstance(raw, dict):
            errors.append(f"row[{i}]_not_object")
            continue
        flat = flatten_api_row(raw)
        row_errs = validate_inspection_row(flat, origin=origin)
        if row_errs:
            errors.extend(f"row[{i}]:{e}" for e in row_errs)
            continue
        url = flat.get("url") or flat.get("path")
        path = url
        if str(url).startswith("http"):
            path = "/" + "/".join(str(url).split("/")[3:])
            if not path.endswith("/"):
                path += "/"
        state = derive_state(flat)
        rec = normalize_url_record(
            {
                "url": path,
                "state": state,
                "evidence_origin": origin,
                "captured_at": flat.get("captured_at")
                or flat.get("capture_date")
                or payload.get("captured_at"),
                "declared_canonical": flat.get("declared_canonical")
                or flat.get("userCanonical"),
                "google_canonical": flat.get("google_canonical")
                or flat.get("googleCanonical"),
                "last_crawl_at": flat.get("last_crawl_at") or flat.get("lastCrawlTime"),
                "coverage": flat.get("coverage") or flat.get("coverageState"),
                "verdict": flat.get("verdict") or flat.get("index_status_verdict"),
                "notes": flat.get("notes") or flat.get("evidence_notes") or [],
                "evidence_id": flat.get("evidence_id")
                or payload.get("evidence_id")
                or payload.get("batch_id"),
            },
            path,
        )
        if flat.get("operator") or flat.get("signed_by"):
            rec["operator"] = flat.get("operator") or flat.get("signed_by")
        normalized[path] = rec

    if errors:
        raise ValueError("ingest validation failed: " + "; ".join(errors))

    seeds = seed_urls if seed_urls is not None else seed_paths_from_registry()
    # Merge: seeds default NOT_INSPECTED, ingested overwrite
    by_url = build_gsc_state_by_url(seeds, normalized)
    for k, v in normalized.items():
        by_url[k] = v

    all_seeds_inspected = all(
        by_url.get(s, {}).get("state") not in {"NOT_INSPECTED", "INSPECTION_PENDING", None}
        for s in seeds
    )
    gsc_access = GSC_ACCESS_OK if all_seeds_inspected and seeds else GSC_ACCESS_PARTIAL

    result = {
        "schema_version": "2.0.0",
        "gsc_access": gsc_access,
        "evidence_origin": origin,
        "ingested_count": len(normalized),
        "urls": by_url,
        "gsc_state_by_url": by_url,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_input_note": payload.get("note"),
    }

    out_path = out_path or (ROOT / "seo" / "pseo-indexation-status.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Ingest validated GSC inspection evidence")
    ap.add_argument("--input", required=True, help="Path to structured evidence JSON")
    ap.add_argument(
        "--out",
        default=str(ROOT / "seo" / "pseo-indexation-status.json"),
        help="Output indexation status path",
    )
    args = ap.parse_args(argv)
    path = Path(args.input)
    if not path.exists():
        print(f"ERROR: input not found: {path}", file=sys.stderr)
        return 2
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        result = ingest(payload, out_path=Path(args.out))
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "gsc_access": result["gsc_access"], "ingested_count": result["ingested_count"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
