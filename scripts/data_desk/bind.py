"""SELECT-only bind to the approved SC Market Answer. Never recompute quartiles."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.data_desk.schema import SchemaError
from scripts.discovery.registry import repo_root

CANONICAL_SOURCE = (
    "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
)
APPROVED_PAYLOAD_HASH = "568880b7eacf30e2adaf7481945fa50cfc77039be10b27ffc6af0959bf6c6d9d"
APPROVED_RENDERED_HASH = "185dcd038951689ef1482973c7bdc51d858c01b77bfeb460a2d05e2ece8d39fa"
EXPORT_REL = Path("data/extra-cli/public-read-market-answer-pavimentacao/1.0/export.json")
APPROVALS_REL = Path("data/editorial/market-answers/approvals.json")
LKG_REL = Path("data/editorial/market-answers/lkg.json")


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SchemaError(f"expected_object:{path}")
    return data


def load_approved_source(root: Path | None = None) -> dict[str, Any]:
    """Read committed extra-cli stats + editorial approval hashes. SELECT-only."""
    root = root or repo_root()
    export = _load_json(root / EXPORT_REL)
    approvals = _load_json(root / APPROVALS_REL)
    lkg = _load_json(root / LKG_REL)
    rows = approvals.get("approvals") or []
    approval = next((row for row in rows if row.get("url") == CANONICAL_SOURCE), None)
    if not approval:
        raise SchemaError("approved_market_answer_missing")
    payload_hash = approval.get("payload_content_hash")
    rendered_hash = approval.get("rendered_content_hash")
    if payload_hash != APPROVED_PAYLOAD_HASH:
        raise SchemaError("payload_content_hash_drift")
    if rendered_hash != APPROVED_RENDERED_HASH:
        raise SchemaError("rendered_content_hash_drift")
    if lkg.get("payload_content_hash") != payload_hash:
        raise SchemaError("lkg_payload_hash_mismatch")
    if lkg.get("rendered_content_hash") != rendered_hash:
        raise SchemaError("lkg_rendered_hash_mismatch")
    stats = export.get("stats") or {}
    coverage = export.get("coverage") or {}
    missingness = export.get("missingness") or {}
    period = export.get("period") or {}
    geography = export.get("geography") or {}
    if geography.get("code") != "SC":
        raise SchemaError("geography_must_be_sc")
    if not stats or stats.get("n") is None:
        raise SchemaError("approved_stats_missing")
    return {
        "canonical_source": CANONICAL_SOURCE,
        "payload_content_hash": payload_hash,
        "rendered_content_hash": rendered_hash,
        "method_version": approval.get("method_version"),
        "source_schema_version": approval.get("schema_version"),
        "as_of": export.get("as_of"),
        "stats": {
            "p25": stats["p25"],
            "median": stats["median"],
            "p75": stats["p75"],
            "n": stats["n"],
            "unit": stats.get("unit") or export.get("grain"),
        },
        "coverage": coverage,
        "missingness": missingness,
        "period": period,
        "geography": geography,
        "grain": export.get("grain"),
        "grain_not": list(export.get("grain_not") or []),
        "currency": export.get("currency") or "BRL",
        "limitations": list(export.get("limitations") or []),
        "typology_id": export.get("typology_id"),
        "question": export.get("question"),
        "producer_status": export.get("producer_status"),
        "claim_authorization": export.get("claim_authorization") or {},
        # extra-cli content_hash is NOT the Market Answer approval hash.
        "extra_cli_content_hash": export.get("content_hash"),
        "invalidation_keys": list(approval.get("invalidation_keys") or []),
        "refresh_owner": "CONFENGE / market-answers",
    }


def assert_asset_matches_approved(asset: dict[str, Any], source: dict[str, Any]) -> None:
    """Fail closed if the registry drifted from the approved payload."""
    stats = asset.get("stats") or {}
    src_stats = source["stats"]
    for key in ("p25", "median", "p75", "n"):
        if stats.get(key) != src_stats.get(key):
            raise SchemaError(f"stats_mismatch:{key}")
    if asset.get("payload_content_hash") != source["payload_content_hash"]:
        raise SchemaError("asset_payload_hash_mismatch")
    if asset.get("rendered_content_hash") != source["rendered_content_hash"]:
        raise SchemaError("asset_rendered_hash_mismatch")
    if (asset.get("canonical_source") or asset.get("public_canonical")) != source["canonical_source"]:
        raise SchemaError("canonical_source_mismatch")
    geo = (asset.get("geography") or {})
    if geo.get("code") != "SC" and asset.get("geography_code") != "SC":
        raise SchemaError("asset_geography_must_be_sc")
    missing = asset.get("missingness") or {}
    src_missing = source["missingness"]
    if missing.get("unknown_or_nonpositive") != src_missing.get("unknown_or_nonpositive"):
        raise SchemaError("missingness_mismatch")
    if missing.get("unknown_or_nonpositive") in (0, "0"):
        raise SchemaError("missingness_must_not_be_zero")
    if asset.get("fixture") or asset.get("watermark") == "FIXTURE_ONLY":
        raise SchemaError("approved_asset_must_not_be_fixture")
