"""Validate extra-cli official-live contract-analysis handoff. Never invent facts."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from scripts.contract_analysis import SOURCE_OFFICIAL_LIVE
from scripts.contract_analysis.consume import (
    ConsumeError,
    catalog_mode_of,
    claimed_live_of,
    negotiate_schema,
    official_live_declared,
    source_kind_of,
    verify_content_hash,
)

FACTUAL_HANDOFF_PENDING = "FACTUAL_HANDOFF_PENDING"
HANDOFF_READY = "HANDOFF_READY"
HANDOFF_BLOCKED = "BLOCKED"

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
OFFICIAL_RENDEZVOUS_REL = Path("contract-analysis") / "official-live-01"


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve(path: Path) -> Path:
    return path if path.is_absolute() else (_root() / path).resolve()


def official_rendezvous_dir() -> Path:
    """Official extra-cli rendezvous. READY.json is the only live-ingest signal."""
    base = os.environ.get("CONFENGE_HANDOFF_DIR")
    root = Path(base) if base else Path.home() / ".local" / "share" / "confenge" / "handoffs"
    return root / OFFICIAL_RENDEZVOUS_REL


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_sha256sums(directory: Path) -> tuple[bool, list[str]]:
    sums = directory / "SHA256SUMS"
    if not sums.is_file():
        return False, ["sha256sums_absent"]
    reasons: list[str] = []
    for raw in sums.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            reasons.append("sha256sums_malformed")
            continue
        digest, rel = parts
        rel = rel[1:] if rel.startswith("*") else rel
        target = directory / rel
        if not target.is_file():
            reasons.append(f"sha256sums_missing:{rel}")
            continue
        actual = file_sha256(target)
        if actual != digest.lower():
            reasons.append(f"sha256sums_mismatch:{rel}")
    return not reasons, reasons


def verify_ready_document(directory: Path, ready: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    status = str(ready.get("status") or "").strip().upper()
    if status != "READY":
        reasons.append("ready_status_not_ready")
    manifest_path = directory / "manifest.json"
    if not manifest_path.is_file():
        return False, reasons + ["manifest_absent"]
    manifest_sha = file_sha256(manifest_path)
    declared_sha = str(ready.get("manifest_sha") or ready.get("manifest_hash") or "").strip()
    if not declared_sha:
        reasons.append("ready_manifest_sha_absent")
    elif declared_sha != manifest_sha:
        reasons.append("ready_manifest_sha_mismatch")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False, reasons + ["manifest_unreadable"]
    if not isinstance(manifest, dict):
        return False, reasons + ["manifest_unreadable"]
    root_hash = str(ready.get("root_content_hash") or ready.get("content_hash") or "").strip()
    declared_root = str(manifest.get("content_hash") or "").strip()
    if not root_hash:
        reasons.append("ready_root_hash_absent")
    elif declared_root and root_hash != declared_root:
        reasons.append("ready_root_hash_mismatch")
    producer = (
        ready.get("producer_commit")
        or manifest.get("producer_commit")
        or manifest.get("producer_sha")
        or manifest.get("git_sha")
    )
    if not producer:
        reasons.append("producer_commit_absent")
    dossier_ids = list(ready.get("dossier_ids") or ready.get("ids") or manifest.get("selected_ids") or [])
    count = ready.get("dossier_count")
    if count is not None and int(count) != len(dossier_ids):
        reasons.append("dossier_count_mismatch")
    return not reasons, reasons


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
    paths.append(official_rendezvous_dir())
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
        "ready_json": False,
        "ready_status": None,
        "blocked_json": False,
        "blocked_reason": None,
        "sha256sums_ok": False,
        "manifest_sha_ok": False,
        "root_hash_ok": False,
        "dossier_ids_ok": False,
        "rendezvous_verified": False,
        "producer_index_authorization": False,
        "producer_publication_authorization": False,
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
    # Producer publication/index flags are informational. They never grant INDEX.
    result["no_index_authorization"] = bool(manifest.get("no_index_authorization"))
    result["producer_index_authorization"] = bool(manifest.get("index_authorization"))
    result["producer_publication_authorization"] = bool(manifest.get("publication_authorization"))
    result["producer_commit"] = (
        manifest.get("producer_commit") or manifest.get("producer_sha") or manifest.get("git_sha")
    )
    result["replay"] = bool(manifest.get("replay_command") or manifest.get("replay"))
    ready_flag = manifest.get("handoff_status") or manifest.get("HANDOFF_READY") or manifest.get("handoff_ready")
    if isinstance(ready_flag, dict):
        result["handoff_ready"] = any(
            bool(value) is True or str(value).strip() == HANDOFF_READY for value in ready_flag.values()
        )
    else:
        result["handoff_ready"] = str(ready_flag).strip() in {HANDOFF_READY, "true", "True", "1"}
    if ready_flag is True:
        result["handoff_ready"] = True
    states = manifest.get("states") if isinstance(manifest.get("states"), dict) else {}
    if any(str(value).strip() == HANDOFF_READY for value in states.values()):
        result["handoff_ready"] = True

    analyses_dir = path / "analyses" if path.is_dir() else None
    public_read_dir = path / "public-read" if path.is_dir() else None
    dossiers_dir = path / "dossiers" if path.is_dir() else None
    matrix_dir = path / "source-claim-matrix" if path.is_dir() else None
    payload = None
    if analyses_dir and analyses_dir.is_dir():
        result["layout"] = "export_dir"
        entries = list(analyses_dir.glob("*.json"))
        result["evaluated_cap"] = len(entries)
        ready = 0
        hold = 0
        matrix = bool(matrix_dir and matrix_dir.is_dir() and any(matrix_dir.glob("*.json")))
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
    elif public_read_dir and public_read_dir.is_dir():
        result["layout"] = "authority_handoff"
        entries = list(public_read_dir.glob("*.json"))
        result["evaluated_cap"] = len(entries)
        ready = 0
        hold = 0
        for item_path in entries:
            item = _read_json(item_path)
            if not item:
                continue
            state = str(item.get("publication_readiness") or item.get("data_state") or "")
            if state == "DATA_READY" or str(item.get("handoff_status") or "") == "HANDOFF_READY":
                ready += 1
            if state == "DATA_HOLD":
                hold += 1
        result["data_ready_count"] = ready
        result["data_hold_count"] = hold
        result["source_claim_matrix"] = bool(matrix_dir and matrix_dir.is_dir() and any(matrix_dir.glob("*.json")))
    elif dossiers_dir and dossiers_dir.is_dir():
        result["layout"] = "dossiers"
        entries = list(dossiers_dir.glob("*.json"))
        result["evaluated_cap"] = len(entries)
        result["data_ready_count"] = len(entries)
        result["source_claim_matrix"] = bool(matrix_dir and matrix_dir.is_dir() and any(matrix_dir.glob("*.json")))
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
    if official_live_declared(manifest) and mode == SOURCE_OFFICIAL_LIVE and not result["fixture"]:
        result["official_live"] = True
        result["fixture"] = False

    if manifest.get("content_hash"):
        result["hashes_ok"] = verify_content_hash(manifest)
        if not result["hashes_ok"]:
            # payload-style manifests hash a projection, not the on-disk object.
            result["hashes_ok"] = bool(manifest.get("content_hash") and result["producer_commit"])
            if not verify_content_hash(manifest):
                result["reasons"].append("manifest_hash_unverified")
    else:
        result["reasons"].append("content_hash_absent")

    ready_doc = _read_json(path / "READY.json") if path.is_dir() else None
    blocked_doc = _read_json(path / "BLOCKED.json") if path.is_dir() else None
    if blocked_doc:
        result["blocked_json"] = True
        result["blocked_reason"] = blocked_doc.get("reason") or blocked_doc.get("reason_codes")
    if ready_doc:
        result["ready_json"] = True
        result["ready_status"] = str(ready_doc.get("status") or "").strip().upper()
        sums_ok, sums_reasons = verify_sha256sums(path)
        result["sha256sums_ok"] = sums_ok
        result["reasons"].extend(sums_reasons)
        ready_ok, ready_reasons = verify_ready_document(path, ready_doc)
        result["manifest_sha_ok"] = "ready_manifest_sha_mismatch" not in ready_reasons and "ready_manifest_sha_absent" not in ready_reasons
        result["root_hash_ok"] = "ready_root_hash_mismatch" not in ready_reasons and "ready_root_hash_absent" not in ready_reasons
        result["dossier_ids_ok"] = "dossier_count_mismatch" not in ready_reasons
        result["reasons"].extend(ready_reasons)
        result["rendezvous_verified"] = sums_ok and ready_ok and result["ready_status"] == "READY"
        if ready_doc.get("producer_commit") and not result["producer_commit"]:
            result["producer_commit"] = ready_doc.get("producer_commit")

    # Producer no_index_authorization is recorded, never a readiness requirement.
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
    """Return HANDOFF_READY only from a verified official rendezvous.

    READY.json + SHA256SUMS + manifest/root hashes are the only live-ingest
    signal. Sibling packs and producer publication/index flags never grant
    INDEX or HANDOFF_READY. Missing or BLOCKED packs stay fail-closed.
    """
    checked = []
    blocked_row = None
    rendezvous = official_rendezvous_dir()
    for path in _candidate_paths(explicit):
        row = _inspect_dir(path)
        checked.append(row)
        is_rendezvous = path == rendezvous or explicit is not None and _resolve(explicit) == path
        if row.get("blocked_json") and not row.get("ready_json") and is_rendezvous:
            blocked_row = row
        ready = (
            is_rendezvous
            and row["exists"]
            and row["schema_ok"]
            and row["handoff_ready"]
            and row["official_live"]
            and bool(row["producer_commit"])
            and row["source_claim_matrix"]
            and row["replay"]
            and not row["fixture"]
            and row["data_ready_count"] > 0
            and row.get("rendezvous_verified")
        )
        if ready:
            return {
                "status": HANDOFF_READY,
                "path": row["path"],
                "checked": checked,
                "data_ready_count": row["data_ready_count"],
                "producer_commit": row.get("producer_commit"),
                "reasons": [],
            }
    if blocked_row is not None:
        return {
            "status": HANDOFF_BLOCKED,
            "path": blocked_row["path"],
            "checked": checked,
            "data_ready_count": 0,
            "blocker": blocked_row.get("blocked_reason"),
            "reasons": [
                "official_rendezvous_blocked",
                *(blocked_row.get("reasons") or []),
            ],
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
