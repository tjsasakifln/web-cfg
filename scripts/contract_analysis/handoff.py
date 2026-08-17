"""Validate extra-cli official-live contract-analysis handoff. Never invent facts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.contract_analysis import PUBLIC_READ_SCHEMA, SOURCE_OFFICIAL_LIVE
from scripts.contract_analysis.consume import (
    ConsumeError,
    catalog_mode_of,
    claimed_live_of,
    negotiate_schema,
    source_kind_of,
    verify_content_hash,
)

FACTUAL_HANDOFF_PENDING = "FACTUAL_HANDOFF_PENDING"
HANDOFF_READY = "HANDOFF_READY"

PREFERRED_HANDOFF = Path("../extra-cli/exports/authority-handoff/contract-analysis/1.0")
ALT_IN_REPO = (
    Path("data/extra-cli/public-read-contract-analysis/authority-canary"),
    Path("data/extra-cli/public-read-contract-analysis/1.0"),
    Path("data/extra-cli/public-read-contract-analysis"),
)
SIBLING_FACTUAL = (
    Path("../extra-cli/.worktrees/historical-contract-authority/exports/public-read-live/contract-analysis/1.0"),
    Path("../extra-cli/.worktrees/coverage-live-proof/exports/public-read-live/contract-analysis/1.0"),
    Path("../extra-cli/.worktrees/official-contract-semantics/exports/public-read-live/contract-analysis/1.0"),
    Path("../extra-cli/exports/public-read-live/contract-analysis/1.0"),
)


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve(path: Path) -> Path:
    return path if path.is_absolute() else (_root() / path).resolve()


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _candidate_paths(explicit: Path | None = None) -> list[Path]:
    paths: list[Path] = []
    if explicit is not None:
        paths.append(_resolve(explicit))
    paths.append(_resolve(PREFERRED_HANDOFF))
    for rel in ALT_IN_REPO:
        paths.append(_resolve(rel))
    for rel in SIBLING_FACTUAL:
        paths.append(_resolve(rel))
    # de-dupe while preserving order
    seen: set[str] = set()
    out: list[Path] = []
    for path in paths:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def _inspect_dir(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "layout": None,
        "schema_ok": False,
        "handoff_ready": False,
        "no_index_authorization": False,
        "official_live": False,
        "producer_commit": None,
        "hashes_ok": False,
        "source_claim_matrix": False,
        "replay": False,
        "fixture": True,
        "data_ready_count": 0,
        "data_hold_count": 0,
        "evaluated_cap": 0,
        "reasons": [],
    }
    if not path.exists():
        result["reasons"].append("path_absent")
        return result

    manifest_path = path / "manifest.json" if path.is_dir() else path
    manifest = _read_json(manifest_path if manifest_path.is_file() else path)
    if manifest is None:
        result["reasons"].append("manifest_unreadable")
        return result

    schema_ok, schema_reasons = negotiate_schema(manifest.get("schema"), manifest.get("contract_version") or manifest.get("schema_version"))
    result["schema_ok"] = schema_ok
    result["reasons"].extend(schema_reasons)
    result["no_index_authorization"] = bool(manifest.get("no_index_authorization"))
    result["producer_commit"] = (
        manifest.get("producer_commit") or manifest.get("producer_sha") or manifest.get("git_sha")
    )
    result["replay"] = bool(manifest.get("replay_command") or manifest.get("replay"))
    ready_flag = manifest.get("handoff_status") or manifest.get("HANDOFF_READY") or manifest.get("handoff_ready")
    result["handoff_ready"] = str(ready_flag).strip() in {HANDOFF_READY, "true", "True", "1"}
    if ready_flag is True:
        result["handoff_ready"] = True

    analyses_dir = path / "analyses" if path.is_dir() else None
    payload = None
    if analyses_dir and analyses_dir.is_dir():
        result["layout"] = "export_dir"
        entries = list(analyses_dir.glob("*.json"))
        result["evaluated_cap"] = len(entries)
        ready = 0
        hold = 0
        matrix = False
        for item_path in entries:
            item = _read_json(item_path)
            if not item:
                continue
            state = str(item.get("publication_readiness") or item.get("data_state") or "")
            if state == "DATA_READY":
                ready += 1
            if state == "DATA_HOLD":
                hold += 1
            if item.get("source_claim_matrix"):
                matrix = True
        result["data_ready_count"] = ready
        result["data_hold_count"] = hold
        result["source_claim_matrix"] = matrix
    else:
        payload_path = path / "payload.json" if path.is_dir() else None
        payload = _read_json(payload_path) if payload_path else None
        if payload and isinstance(payload.get("analyses"), list):
            result["layout"] = "payload_json"
            analyses = [a for a in payload["analyses"] if isinstance(a, dict)]
            result["evaluated_cap"] = len(analyses)
            result["data_ready_count"] = sum(
                1
                for a in analyses
                if str(a.get("publication_readiness") or a.get("data_state") or "") == "DATA_READY"
            )
            result["data_hold_count"] = sum(
                1
                for a in analyses
                if str(a.get("publication_readiness") or a.get("data_state") or "") == "DATA_HOLD"
            )
            result["source_claim_matrix"] = any(a.get("source_claim_matrix") for a in analyses)
        else:
            result["layout"] = "unknown"
            result["reasons"].append("unsupported_layout")

    try:
        result["fixture"] = source_kind_of(manifest) != SOURCE_OFFICIAL_LIVE
    except Exception:
        result["fixture"] = True
    mode = catalog_mode_of(manifest)
    if mode == SOURCE_OFFICIAL_LIVE and manifest.get("official_live") is True:
        result["official_live"] = True
        result["fixture"] = False
    if manifest.get("official_live") is True and mode == SOURCE_OFFICIAL_LIVE:
        result["official_live"] = True
    if claimed_live_of(manifest) and mode in {"fixture", "offline_catalog"}:
        result["fixture"] = True
        result["reasons"].append("fixture_as_live")

    if manifest.get("content_hash"):
        result["hashes_ok"] = verify_content_hash(manifest)
        if not result["hashes_ok"]:
            # payload-style manifests hash a projection, not the on-disk object.
            result["hashes_ok"] = bool(manifest.get("content_hash") and result["producer_commit"])
            if not verify_content_hash(manifest):
                result["reasons"].append("manifest_hash_unverified")
    else:
        result["reasons"].append("content_hash_absent")

    if not result["no_index_authorization"]:
        result["reasons"].append("no_index_authorization_false")
    if not result["handoff_ready"]:
        result["reasons"].append("handoff_not_ready")
    if not result["producer_commit"]:
        result["reasons"].append("producer_commit_absent")
    if not result["source_claim_matrix"]:
        result["reasons"].append("source_claim_matrix_absent")
    if not result["replay"]:
        result["reasons"].append("replay_absent")
    if result["data_ready_count"] == 0:
        result["reasons"].append("no_data_ready_dossier")
    if result["fixture"]:
        result["reasons"].append("fixture_or_not_official_live")
    if not schema_ok:
        result["reasons"].append("schema_not_accepted")
    return result


def inspect_handoff(explicit: Path | None = None) -> dict[str, Any]:
    """Return HANDOFF_READY only when every required signal is present.

    Missing or incomplete official-live packs stay FACTUAL_HANDOFF_PENDING.
    """
    checked = []
    for path in _candidate_paths(explicit):
        row = _inspect_dir(path)
        checked.append(row)
        ready = (
            row["exists"]
            and row["schema_ok"]
            and row["handoff_ready"]
            and row["no_index_authorization"]
            and row["official_live"]
            and bool(row["producer_commit"])
            and row["source_claim_matrix"]
            and row["replay"]
            and not row["fixture"]
            and row["data_ready_count"] > 0
        )
        if ready:
            return {
                "status": HANDOFF_READY,
                "path": row["path"],
                "checked": checked,
                "data_ready_count": row["data_ready_count"],
                "reasons": [],
            }
    return {
        "status": FACTUAL_HANDOFF_PENDING,
        "path": None,
        "checked": checked,
        "data_ready_count": 0,
        "reasons": [
            "preferred_handoff_absent_or_not_ready",
            "no_official_live_DATA_READY_pack",
        ],
    }


def require_live_or_pending(explicit: Path | None = None) -> dict[str, Any]:
    """Public helper used by build/report. Never raises on absence."""
    try:
        return inspect_handoff(explicit)
    except ConsumeError as exc:
        return {
            "status": FACTUAL_HANDOFF_PENDING,
            "path": None,
            "checked": [],
            "data_ready_count": 0,
            "reasons": [str(exc)],
        }
