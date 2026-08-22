"""Content hashes for frozen pillars and forbidden surfaces."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import TypedDict

from scripts.bofu_dominance.frozen_specs.constants import FORBIDDEN_RELATIVE_PATHS, ROOT


class DriftHashes(TypedDict):
    baseline: str
    live: str


def content_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def forbidden_path_hashes(root: Path | None = None) -> dict[str, str]:
    base = root or ROOT
    out: dict[str, str] = {}
    for rel in FORBIDDEN_RELATIVE_PATHS:
        path = base / rel
        out[rel] = content_sha256(path) if path.is_file() else ""
    return out


def committed_forbidden_hashes(root: Path | None = None) -> dict[str, str]:
    """Load the reviewed baseline committed with the frozen specifications."""
    base = root or ROOT
    baseline_path = base / "data" / "bofu-dominance" / "frozen-specs" / "hashes.json"
    payload = json.loads(baseline_path.read_text(encoding="utf-8"))
    forbidden = payload.get("forbidden")
    if not isinstance(forbidden, dict):
        raise ValueError(f"missing forbidden hash baseline: {baseline_path}")
    expected = set(FORBIDDEN_RELATIVE_PATHS)
    actual = set(forbidden)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise ValueError(
            f"invalid forbidden hash baseline: missing={missing}, unexpected={unexpected}"
        )
    return {rel: str(forbidden[rel]) for rel in FORBIDDEN_RELATIVE_PATHS}


def forbidden_drift(root: Path | None = None) -> dict[str, DriftHashes]:
    """Compare live protected files with the committed, reviewable baseline."""
    base = root or ROOT
    baseline = committed_forbidden_hashes(base)
    live = forbidden_path_hashes(base)
    return {
        rel: {"baseline": baseline[rel], "live": live[rel]}
        for rel in FORBIDDEN_RELATIVE_PATHS
        if baseline[rel] != live[rel]
    }
