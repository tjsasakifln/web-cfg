"""Validate pSEO snapshot schema, checksums, freshness and forbidden fields."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSIONS_OK = frozenset({"1.0.0", "1.1.0"})
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

DATASET_BODY_KEYS = (
    "archetypes",
    "markets",
    "agencies",
    "prices",
    "competition",
    "opportunities",
    "problem_service",
    "icp_methodology",
)


class SnapshotError(Exception):
    """Fail-closed validation error."""


def _sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _canonical_json(data: Any) -> str:
    return json.dumps(
        data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    )


def recompute_dataset_hash(data_dir: Path) -> str:
    body: dict[str, Any] = {}
    for key in DATASET_BODY_KEYS:
        path = data_dir / f"{key}.json"
        if path.exists():
            body[key] = load_json(path)
    return _sha256_text(_canonical_json(body))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_snapshot(
    data_dir: Path,
    *,
    max_age_days: int | None = None,
    now: datetime | None = None,
    require_hash_match: bool = True,
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
    sv = manifest.get("schema_version")
    if not sv:
        errors.append("manifest.schema_version missing")
    elif sv not in SCHEMA_VERSIONS_OK:
        errors.append(f"unsupported schema_version: {sv}")

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

    # Recompose dataset_hash from body files
    if require_hash_match and manifest.get("dataset_hash"):
        recomputed = recompute_dataset_hash(data_dir)
        # v1.0.0 snapshots may have used a different body composition;
        # if checksums all match, allow soft mismatch only when schema is 1.0.0
        if recomputed != manifest.get("dataset_hash"):
            if sv == "1.1.0":
                errors.append(
                    f"dataset_hash mismatch: manifest={manifest.get('dataset_hash')} "
                    f"recomputed={recomputed}"
                )
            # for 1.0.0: still recompute and surface as soft error if no checksums? hard check
            # Prefer hard check always for integrity
            else:
                # try alternate body without icp_methodology
                body_alt = {
                    k: load_json(data_dir / f"{k}.json")
                    for k in DATASET_BODY_KEYS
                    if k != "icp_methodology" and (data_dir / f"{k}.json").exists()
                }
                alt = _sha256_text(_canonical_json(body_alt))
                if alt != manifest.get("dataset_hash") and recomputed != manifest.get("dataset_hash"):
                    # keep fail-closed: hash must match one known composition
                    errors.append(
                        f"dataset_hash not recomposable: manifest={manifest.get('dataset_hash')}"
                    )

    # freshness — prefer data ages, not only generated_at
    max_age = max_age_days
    if max_age is None:
        max_age = int(
            (manifest.get("freshness") or {}).get("max_age_days_policy")
            or MAX_AGE_DAYS_DEFAULT
        )
    generated_at = manifest.get("generated_at") or ""
    try:
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

    # forbidden fields across all json (except registry)
    for path in sorted(data_dir.glob("*.json")):
        if path.name == "registry.json":
            continue
        text = path.read_text(encoding="utf-8")
        for pat in FORBIDDEN_PATTERNS:
            if pat.search(text):
                errors.append(f"forbidden pattern in {path.name}: {pat.pattern}")

    if not manifest.get("dataset_hash"):
        errors.append("dataset_hash empty")

    if errors:
        raise SnapshotError("; ".join(errors))

    body: dict[str, Any] = {}
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

    return {
        "ok": True,
        "manifest": manifest,
        "data": body,
        "data_dir": str(data_dir),
        "recomputed_dataset_hash": recompute_dataset_hash(data_dir),
    }
