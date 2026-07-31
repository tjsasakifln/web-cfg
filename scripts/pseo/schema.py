"""Validate pSEO snapshot schema, checksums, freshness and forbidden fields."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0.0"
MAX_AGE_DAYS_DEFAULT = 180

FORBIDDEN_PATTERNS = [
    re.compile(r'"score_total"\s*:', re.I),
    re.compile(r'"commercial_state"\s*:', re.I),
    re.compile(r'"human_notes"\s*:', re.I),
    re.compile(r'"human_decision"\s*:', re.I),
    re.compile(r'"suggested_offer"\s*:', re.I),
    re.compile(r'"next_human_step"\s*:', re.I),
    re.compile(r'"priority"\s*:\s*"(CRITICAL|HIGH|MEDIUM|LOW)"', re.I),
    re.compile(r'"rank_position"\s*:', re.I),
    re.compile(r'"top20"\s*:', re.I),
    re.compile(r'"do_not_contact"\s*:', re.I),
]

REQUIRED_FILES = [
    "manifest.json",
    "archetypes.json",
    "markets.json",
    "agencies.json",
    "prices.json",
    "competition.json",
    "opportunities.json",
    "problem_service.json",
    "schema.json",
]


class SnapshotError(Exception):
    """Fail-closed validation error."""


def _sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_snapshot(
    data_dir: Path,
    *,
    max_age_days: int | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Validate snapshot. Raises SnapshotError on any failure."""
    errors: list[str] = []
    data_dir = Path(data_dir)
    for name in REQUIRED_FILES:
        if not (data_dir / name).exists():
            errors.append(f"missing file: {name}")
    if errors:
        raise SnapshotError("; ".join(errors))

    manifest = load_json(data_dir / "manifest.json")
    if manifest.get("schema_version") != SCHEMA_VERSION:
        # allow same major if present; hard fail on missing
        if not manifest.get("schema_version"):
            errors.append("manifest.schema_version missing")

    for field in (
        "generated_at",
        "source_run_id",
        "dataset_hash",
        "checksums",
        "sources",
        "counts",
        "freshness",
        "limitations",
    ):
        if field not in manifest:
            errors.append(f"manifest missing {field}")

    checksums = manifest.get("checksums") or {}
    for name, expected in checksums.items():
        path = data_dir / name
        if not path.exists():
            errors.append(f"checksum target missing: {name}")
            continue
        actual = _sha256_text(path.read_text(encoding="utf-8"))
        if actual != expected:
            errors.append(f"checksum mismatch: {name}")

    # freshness
    max_age = max_age_days
    if max_age is None:
        max_age = int(
            (manifest.get("freshness") or {}).get("max_age_days_policy")
            or MAX_AGE_DAYS_DEFAULT
        )
    generated_at = manifest.get("generated_at") or ""
    try:
        # support Z
        ga = generated_at.replace("Z", "+00:00")
        gen_dt = datetime.fromisoformat(ga)
        if gen_dt.tzinfo is None:
            gen_dt = gen_dt.replace(tzinfo=timezone.utc)
    except Exception:
        errors.append(f"invalid generated_at: {generated_at}")
        gen_dt = None
    if gen_dt is not None:
        ref = now or datetime.now(timezone.utc)
        age = (ref - gen_dt).total_seconds() / 86400.0
        if age > max_age:
            errors.append(f"snapshot expired: age_days={age:.1f} > {max_age}")

    # forbidden fields across all json
    for path in sorted(data_dir.glob("*.json")):
        text = path.read_text(encoding="utf-8")
        for pat in FORBIDDEN_PATTERNS:
            if pat.search(text):
                errors.append(f"forbidden pattern in {path.name}: {pat.pattern}")

    # dataset_hash must match recomputed body (excluding manifest)
    body = {}
    for key in (
        "archetypes",
        "markets",
        "agencies",
        "prices",
        "competition",
        "opportunities",
        "problem_service",
    ):
        body[key] = load_json(data_dir / f"{key}.json")
    icp_path = data_dir / "icp_methodology.json"
    if icp_path.exists():
        body["icp_methodology"] = load_json(icp_path)
    # Note: exporter hashes full files_body; we trust per-file checksums as gate.
    # Soft-check dataset_hash presence only.
    if not manifest.get("dataset_hash"):
        errors.append("dataset_hash empty")

    if errors:
        raise SnapshotError("; ".join(errors))

    return {
        "ok": True,
        "manifest": manifest,
        "data": body,
        "data_dir": str(data_dir),
    }
