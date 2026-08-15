"""I/O adapter for the extra-cli #400 research_aggregate_v1 read model.

Loads a versioned export when present. Does not copy a datalake. Fail-closed
onto the existing 4-UF snapshot as preview when the export is absent,
unreadable, insufficient or stale.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from scripts.research.contract import (
    SCHEMA_ID,
    NationalClaimGate,
    evaluate_national_claim_gate,
)

DEFAULT_EXPORT_PATH = Path("data/extra-cli/research-aggregate-v1/export.json")


class ReadModelError(ValueError):
    """Export was requested but cannot be read as the #400 contract."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_research_read_model(
    path: Path | None = None,
    *,
    search_default: bool = True,
) -> dict[str, Any] | None:
    """Return the parsed #400 export, or None if no export is present.

    An explicit `path` that does not exist raises ReadModelError (the caller
    asked for a file). The default well-known path is optional.
    """
    if path is not None:
        resolved = path if path.is_absolute() else (_repo_root() / path)
        if not resolved.is_file():
            raise ReadModelError(f"research read model missing: {resolved}")
        return _parse_export(resolved)
    if not search_default:
        return None
    default = _repo_root() / DEFAULT_EXPORT_PATH
    if not default.is_file():
        return None
    return _parse_export(default)


def _parse_export(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReadModelError(f"research read model unreadable: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ReadModelError(f"research read model is not an object: {path}")
    payload.setdefault("_source_path", str(path))
    return payload


def adapt_research_aggregate_to_snapshot(export: dict[str, Any]) -> dict[str, Any]:
    """Project a passing #400 export into the snapshot shape metrics already use.

    Does not invent cells. Null series values stay null. This is a view over
    the versioned export, not a copy of extra-cli internals.
    """
    coverage = export.get("coverage") or {}
    provenance = export.get("provenance") or {}
    freshness = export.get("freshness") or {}
    series = list(export.get("series") or [])
    prices = list(export.get("prices") or [])
    markets = []
    for row in series:
        if not isinstance(row, dict):
            continue
        markets.append(
            {
                "id": row.get("id")
                or f"market-{row.get('archetype_id')}-{row.get('uf')}".lower(),
                "slug": row.get("slug")
                or f"{row.get('archetype_id')}-{str(row.get('uf') or '').lower()}",
                "region": row.get("uf"),
                "archetype_id": row.get("archetype_id"),
                "segment": row.get("segment") or row.get("archetype_id"),
                "contract_count": row.get("contract_count"),
                "total_value": row.get("total_value_brl")
                if "total_value_brl" in row
                else row.get("total_value"),
                "buyer_count": row.get("buyer_count"),
                "supplier_count": row.get("supplier_count"),
                "period_start": row.get("period_start"),
                "period_end": row.get("period_end"),
                "value_by_year": row.get("value_by_year") or [],
                "privacy": row.get("privacy") or {},
                "top_buyers": row.get("top_buyers") or [],
                "reason_codes": list(row.get("reason_codes") or []),
            }
        )
    price_rows = []
    for row in prices:
        if not isinstance(row, dict):
            continue
        price_rows.append(
            {
                "slug": row.get("slug"),
                "region": row.get("uf"),
                "object_label": row.get("object_label") or row.get("segment"),
                "n": row.get("n"),
                "p25_value": row.get("p25"),
                "median_value": row.get("median"),
                "p75_value": row.get("p75"),
                "min_value": row.get("min"),
                "max_value": row.get("max"),
                "reason_codes": list(row.get("reason_codes") or []),
            }
        )
    dataset_hash = export.get("dataset_hash")
    data_as_of = export.get("data_as_of") or freshness.get("as_of")
    manifest = {
        "dataset_hash": dataset_hash,
        "data_as_of": data_as_of,
        "generated_at": export.get("generated_at"),
        "source_repository": export.get("producer") or "extra-cli",
        "source_commit_sha": provenance.get("source_commit_sha"),
        "source_run_id": provenance.get("source_run_id"),
        "export_version": export.get("schema_version"),
        "export_entrypoint": provenance.get("method"),
        "tables": provenance.get("tables"),
        "query_versions": provenance.get("query_versions") or {},
        "limitations": list(export.get("limitations") or []),
        "freshness": freshness,
        "denominators": {
            "aec_confirmed_contracts": (export.get("denominators") or {}).get(
                "aec_confirmed_contracts"
            ),
            "contracts_total_loaded": (export.get("denominators") or {}).get(
                "contracts_total_loaded"
            ),
        },
    }
    return {
        "manifest": manifest,
        "markets": markets,
        "prices": price_rows,
        "competition": list(export.get("competition") or []),
        "agencies": list(export.get("agencies") or []),
        "opportunities": list(export.get("opportunities") or []),
        "archetypes": list(export.get("archetypes") or []),
        "icp_methodology": export.get("icp_methodology") or {},
        "meta": {
            "snapshot_dir": export.get("_source_path") or DEFAULT_EXPORT_PATH.as_posix(),
            "dataset_hash": dataset_hash,
            "data_as_of": data_as_of,
            "generated_at": export.get("generated_at"),
            "source_repository": manifest["source_repository"],
            "source_commit_sha": manifest["source_commit_sha"],
            "source_run_id": manifest["source_run_id"],
            "export_version": manifest["export_version"],
            "checksums_verified": {},
            "dated_folder_dataset_hash": None,
            "dated_folder_is_live": False,
            "optional_present": {},
            "extra_cli_public_read_contract": SCHEMA_ID,
            "extra_cli_public_read_export_consumed": True,
            "extra_cli_public_read_note": (
                f"Consumed versioned {SCHEMA_ID} export as the edition source."
            ),
            "coverage_ufs": list(coverage.get("ufs") or []),
            "national_universe_complete": coverage.get("national_universe_complete")
            is True,
        },
    }


def resolve_edition_source(
    snapshot: dict[str, Any],
    export: dict[str, Any] | None,
    *,
    now: date | datetime | None = None,
    gate: NationalClaimGate | None = None,
) -> dict[str, Any]:
    """Choose the edition source. National export only if the gate passes."""
    evaluated = gate or evaluate_national_claim_gate(export, now=now)
    if evaluated.passed and export is not None:
        adapted = adapt_research_aggregate_to_snapshot(export)
        return {
            "source": "research_aggregate_v1",
            "snapshot": adapted,
            "gate": evaluated,
            "extra_cli_public_read_export_consumed": True,
            "extra_cli_public_read_note": adapted["meta"]["extra_cli_public_read_note"],
        }

    meta = dict(snapshot.get("meta") or {})
    meta["extra_cli_public_read_export_consumed"] = False
    if not evaluated.present:
        meta["extra_cli_public_read_note"] = (
            "No versioned extra-cli #400 research_aggregate_v1 export is present. "
            "This pack consumes the web-cfg `data/pseo` snapshot only, as preview."
        )
    else:
        meta["extra_cli_public_read_note"] = (
            "A versioned extra-cli #400 export was present but failed the "
            "national claim gate ("
            + ", ".join(evaluated.reason_codes)
            + "). Preview stays on the 4-UF snapshot."
        )
    preview = dict(snapshot)
    preview["meta"] = meta
    return {
        "source": "pseo_snapshot_4uf_preview",
        "snapshot": preview,
        "gate": evaluated,
        "extra_cli_public_read_export_consumed": False,
        "extra_cli_public_read_note": meta["extra_cli_public_read_note"],
    }
