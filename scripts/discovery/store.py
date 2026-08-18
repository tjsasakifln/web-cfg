"""Append-only, replay-safe observation store (NDJSON)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.discovery.observation import (
    ObservationError,
    compute_record_hash,
    fact_identity,
    validate_observation,
)
from scripts.discovery.registry import repo_root

DEFAULT_SNAPSHOTS_REL = Path("data/discovery/snapshots/observations.ndjson")


def default_store_path(root: Path | None = None) -> Path:
    return (root or repo_root()) / DEFAULT_SNAPSHOTS_REL


def load_observations(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            row = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise ObservationError(f"corrupt_observation_store:{path}") from exc
        if isinstance(row, dict):
            rows.append(row)
    return rows


def existing_hashes(path: Path) -> set[str]:
    hashes: set[str] = set()
    for row in load_observations(path):
        digest = row.get("record_hash")
        if isinstance(digest, str):
            hashes.add(digest)
    return hashes


def existing_fact_identities(path: Path) -> set[str]:
    keys: set[str] = set()
    for row in load_observations(path):
        identity = fact_identity(row)
        if identity:
            keys.add(identity)
    return keys


def append_observation(path: Path, record: dict[str, Any]) -> dict[str, Any]:
    """Append one validated record. Replay of the same hash or fact key is a no-op."""
    validated = dict(record)
    if not validated.get("record_hash"):
        validated["record_hash"] = compute_record_hash(validated)
    validate_observation(validated)
    path.parent.mkdir(parents=True, exist_ok=True)
    identity = fact_identity(validated)
    if validated["record_hash"] in existing_hashes(path) or (
        identity is not None and identity in existing_fact_identities(path)
    ):
        return {**validated, "appended": False, "replay": True, "store_path": str(path)}
    line = json.dumps(validated, ensure_ascii=False, sort_keys=True) + "\n"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return {**validated, "appended": True, "replay": False, "store_path": str(path)}


def append_observations(path: Path, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [append_observation(path, record) for record in records]


def write_snapshot_json(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path
