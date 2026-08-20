"""Content hashes for frozen pillars and forbidden surfaces."""

from __future__ import annotations

import hashlib
from pathlib import Path

from scripts.bofu_dominance.frozen_specs.constants import FORBIDDEN_RELATIVE_PATHS, ROOT


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
