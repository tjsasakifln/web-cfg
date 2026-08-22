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


class DriftPolicy(DriftHashes):
    category: str
    severity: str
    action: str


_FROZEN_HTML = frozenset(
    rel for rel in FORBIDDEN_RELATIVE_PATHS if rel.endswith("/index.html")
)
_RENDERING_COLLATERAL = frozenset(
    {"script.js", "styles.css", "styles-tokens.css", "styles-tools.css"}
)


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


def forbidden_drift_policy(root: Path | None = None) -> dict[str, DriftPolicy]:
    """Classify drift without weakening the committed-baseline comparison.

    Frozen pillar HTML and collateral capable of changing its rendering are
    hard errors. Other collateral still fails closed, but names the required
    remediation: a reviewed baseline recapture committed with the change.
    """
    drift = forbidden_drift(root)
    out: dict[str, DriftPolicy] = {}
    for rel, hashes in drift.items():
        if rel in _FROZEN_HTML:
            category = "frozen_html"
            severity = "error"
            action = "revert_frozen_html"
        elif rel in _RENDERING_COLLATERAL:
            category = "rendering_collateral"
            severity = "error"
            action = "prove_no_frozen_rendering_change_or_revert"
        else:
            category = "non_rendering_collateral"
            severity = "recapture_required"
            action = "commit_reviewed_hash_recapture"
        out[rel] = {**hashes, "category": category, "severity": severity, "action": action}
    return out
