"""Read-only loader for the versioned extra-cli/web-cfg pSEO snapshot."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

REQUIRED_FILES = (
    "manifest.json",
    "markets.json",
    "prices.json",
    "competition.json",
    "agencies.json",
    "opportunities.json",
    "archetypes.json",
    "icp_methodology.json",
    "export-descriptor.json",
)

OPTIONAL_FILES = (
    "national-candidate-inventory.json",
    "problem_service.json",
    "schema.json",
)

# Live published snapshot is the authority. The dated folder may lag.
DEFAULT_SNAPSHOT_DIR = Path("data/pseo")


class SnapshotError(ValueError):
    """Snapshot is missing, checksum-invalid, or not a public-read export."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_snapshot(snapshot_dir: Path | None = None) -> dict[str, Any]:
    """Load and checksum-verify the versioned public snapshot.

    Returns a dict with file payloads plus `meta` (paths, hashes, as_of).
    Does not copy or mutate the snapshot tree.
    """
    root = _repo_root()
    directory = (snapshot_dir or (root / DEFAULT_SNAPSHOT_DIR)).resolve()
    if not directory.is_dir():
        raise SnapshotError(f"snapshot directory missing: {directory}")

    missing = [name for name in REQUIRED_FILES if not (directory / name).is_file()]
    if missing:
        raise SnapshotError(f"snapshot missing required files: {missing}")

    manifest = _read_json(directory / "manifest.json")
    checksums = manifest.get("checksums") or {}
    verified: dict[str, str] = {}
    mismatches: list[str] = []
    for name, expected in checksums.items():
        path = directory / name
        if not path.is_file():
            mismatches.append(f"{name}: listed in checksums but absent")
            continue
        digest = file_sha256(path)
        verified[name] = digest
        if digest != expected:
            mismatches.append(f"{name}: checksum mismatch")
    if mismatches:
        raise SnapshotError("snapshot checksum failed: " + "; ".join(mismatches))

    files: dict[str, Any] = {"manifest": manifest}
    for name in REQUIRED_FILES:
        if name == "manifest.json":
            continue
        files[name.replace(".json", "").replace("-", "_")] = _read_json(directory / name)
    optional_present: dict[str, bool] = {}
    for name in OPTIONAL_FILES:
        path = directory / name
        optional_present[name] = path.is_file()
        if path.is_file():
            files[name.replace(".json", "").replace("-", "_")] = _read_json(path)

    dated = root / "data/pseo/snapshots/pre-national-2026-07-31" / "manifest.json"
    dated_hash = None
    if dated.is_file():
        dated_hash = _read_json(dated).get("dataset_hash")

    extra_cli_contract = root.parent / "extra-cli/docs/contracts/public-read-v1.md"
    # Also accept sibling checkout at /mnt/d/extra-cli
    extra_candidates = [
        extra_cli_contract,
        Path("/mnt/d/extra-cli/docs/contracts/public-read-v1.md"),
    ]
    extra_contract_path = next((p for p in extra_candidates if p.is_file()), None)

    try:
        snapshot_dir_meta = directory.relative_to(root).as_posix()
    except ValueError:
        snapshot_dir_meta = str(directory)

    files["meta"] = {
        "snapshot_dir": snapshot_dir_meta,
        "dataset_hash": manifest.get("dataset_hash"),
        "data_as_of": manifest.get("data_as_of"),
        "generated_at": manifest.get("generated_at"),
        "source_repository": manifest.get("source_repository"),
        "source_commit_sha": manifest.get("source_commit_sha"),
        "source_run_id": manifest.get("source_run_id"),
        "export_version": manifest.get("export_version"),
        "checksums_verified": verified,
        "dated_folder_dataset_hash": dated_hash,
        "dated_folder_is_live": dated_hash == manifest.get("dataset_hash"),
        "optional_present": optional_present,
        "extra_cli_public_read_contract": (
            str(extra_contract_path) if extra_contract_path else None
        ),
        "extra_cli_public_read_export_consumed": False,
        "extra_cli_public_read_note": (
            "No versioned public_read_v1 query export is present locally. "
            "This pack consumes the web-cfg `data/pseo` snapshot only. "
            "The extra-cli contract at docs/contracts/public-read-v1.md was "
            "read as documentation, not as a live SELECT."
        ),
    }
    return files
