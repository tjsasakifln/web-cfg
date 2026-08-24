#!/usr/bin/env python3
"""Deploy-bound audit identity: never copy ok from a prior SHA report."""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
AUDITOR_VERSION = "wave0-closure-02"
STALE_CODE = "STALE_AUDIT_DEPLOY_MISMATCH"


def git_sha(repo: Path | None = None) -> str:
    repo = repo or ROOT
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip()
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return "unknown"


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_tree(base: Path) -> str | None:
    if not base.is_dir():
        return None
    items: list[str] = []
    for p in sorted(base.rglob("*")):
        if p.is_file():
            rel = p.relative_to(base).as_posix()
            items.append(f"{rel}:{sha256_file(p)}")
    return sha256_text("\n".join(items))


def seed_set_hash(seed_urls: list[str]) -> str:
    body = "\n".join(sorted(seed_urls))
    return sha256_text(body)


def snapshot_hash_from_manifest(root: Path | None = None) -> str | None:
    root = root or ROOT
    man = root / "data" / "pseo" / "manifest.json"
    if not man.exists():
        return None
    data = json.loads(man.read_text(encoding="utf-8"))
    return data.get("dataset_hash")


def public_artifact_hash(root: Path | None = None, dirname: str = "_site") -> str | None:
    root = root or ROOT
    return sha256_tree(root / dirname)


def identity_block(
    *,
    audit_target_sha: str,
    live_manifest_sha: str | None,
    snapshot_hash: str | None,
    public_artifact_hash_value: str | None,
    seed_urls: list[str],
    auditor_version: str = AUDITOR_VERSION,
) -> dict[str, Any]:
    return {
        "audit_generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "audit_target_sha": audit_target_sha,
        "live_manifest_sha": live_manifest_sha,
        "snapshot_hash": snapshot_hash,
        "public_artifact_hash": public_artifact_hash_value,
        "seed_set_hash": seed_set_hash(seed_urls),
        "auditor_version": auditor_version,
    }


def evaluate_audit_currency(
    identity: dict[str, Any],
    *,
    netlify_deployed_sha: str | None,
    live_snapshot_hash: str | None,
    current_seed_set_hash: str | None,
) -> dict[str, Any]:
    """production_audit.ok may be true only when all identities match."""
    mismatches: list[str] = []
    target = identity.get("audit_target_sha")
    live_man = identity.get("live_manifest_sha")
    snap = identity.get("snapshot_hash")
    seeds = identity.get("seed_set_hash")
    artifact = identity.get("public_artifact_hash")

    if not artifact:
        mismatches.append("public_artifact_hash_missing")

    if not netlify_deployed_sha:
        mismatches.append("netlify_deployed_sha_missing")
    else:
        if target != netlify_deployed_sha:
            mismatches.append("audit_target_sha!=netlify_deployed_sha")
        if live_man != netlify_deployed_sha:
            mismatches.append("live_manifest_sha!=netlify_deployed_sha")

    if live_snapshot_hash and snap and snap != live_snapshot_hash:
        # allow short vs full hash compare
        if not (
            str(snap).startswith(str(live_snapshot_hash))
            or str(live_snapshot_hash).startswith(str(snap)[:16])
        ):
            mismatches.append("snapshot_hash!=live")

    if current_seed_set_hash and seeds and seeds != current_seed_set_hash:
        mismatches.append("seed_set_hash!=current")

    is_current = len(mismatches) == 0
    return {
        "production_audit_is_current": is_current,
        "stale_code": None if is_current else STALE_CODE,
        "mismatches": mismatches,
        "netlify_deployed_sha": netlify_deployed_sha,
    }


def bind_ok_to_identity(
    technical_ok: bool,
    identity: dict[str, Any],
    currency: dict[str, Any],
) -> dict[str, Any]:
    """Never promote ok=true when identity is stale."""
    ok = bool(technical_ok) and bool(currency.get("production_audit_is_current"))
    return {
        "ok": ok,
        "technical_ok": bool(technical_ok),
        "production_audit_is_current": currency.get("production_audit_is_current"),
        "stale_code": currency.get("stale_code"),
        "mismatches": currency.get("mismatches") or [],
        **{k: identity.get(k) for k in (
            "audit_generated_at",
            "audit_target_sha",
            "live_manifest_sha",
            "snapshot_hash",
            "public_artifact_hash",
            "seed_set_hash",
            "auditor_version",
        )},
    }
