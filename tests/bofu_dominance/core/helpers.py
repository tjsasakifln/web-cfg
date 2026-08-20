"""Load the shipped ledger without reimplementing it."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.bofu_dominance.core.ledger import build_status, load_registry, write_artifacts
from scripts.bofu_dominance.core.states import resolve_family_state

__all__ = ["ROOT", "build_status", "load_registry", "resolve_family_state", "write_artifacts"]
