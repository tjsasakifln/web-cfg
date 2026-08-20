"""Load the versioned current-state baseline. SELECT-only over frozen facts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_BASELINE = Path("data/growth-accounting/baseline/current-state-input.v1.json")
DEFAULT_OUT_DIR = Path("data/growth-accounting/reports")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_payload(path: Path | None = None) -> dict[str, Any]:
    target = Path(path) if path else repo_root() / DEFAULT_BASELINE
    return json.loads(target.read_text(encoding="utf-8"))
