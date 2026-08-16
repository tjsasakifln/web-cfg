"""Compatibility loader — delegates to scripts/legacy_equity/inventory.py.

The hash-pinned source of truth is data/migrations/smartlic-url-map/inventory.v2.json.
manifesto.v1.json is a byte-identical projection so SmartLic#2115 vendors one pin.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from legacy_equity.inventory import (  # noqa: E402,F401
    ACTIONS,
    ALLOWLIST_QUERY_KEYS,
    DEFAULT_QUERY_STRING_POLICY,
    FAIL_CLOSED_ACTIONS,
    FORBIDDEN_GENERIC_TARGETS,
    HANDOFF_PATH,
    HOLD_STATUSES,
    INVENTORY_PATH,
    LEGACY_HANDOFF_PATH,
    MANIFESTO_PATH,
    PARENT_HUB_SUFFIXES,
    PII_QUERY_KEYS,
    READY_REDIRECT_ACTIONS,
    READY_STATUSES,
    REQUIRED_FIELDS,
    apply_query_string_policy,
    canonicalize_action,
    hold_entries,
    inventory_sha256,
    is_generic_or_parent_target,
    load_inventory,
    load_manifesto,
    manifesto_sha256,
    normalize_target,
    priority_entries,
    ready_redirects,
    validate_entry,
    validate_inventory,
    validate_manifesto,
)

DECISIONS = set(ACTIONS) | {"REDIRECT", "RETIRE"}
