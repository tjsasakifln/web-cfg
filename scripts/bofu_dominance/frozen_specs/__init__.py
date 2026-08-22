"""PREPARE-ONLY frozen BOFU pillar specs: snapshot, hash-bind, gate. Never mutates HTML by default."""

from scripts.bofu_dominance.frozen_specs.constants import (
    CORRESPONDING_ISSUE,
    EARLIEST_SAFE_ACTION_AT,
    FORBIDDEN_RELATIVE_PATHS,
    PILLAR_SLUGS,
    PILLARS,
    REQUIRED_SPEC_FIELDS,
)
from scripts.bofu_dominance.frozen_specs.entry import run_entry
from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate, load_issue_state
from scripts.bofu_dominance.frozen_specs.hashing import (
    committed_forbidden_hashes,
    content_sha256,
    forbidden_drift,
    forbidden_path_hashes,
)
from scripts.bofu_dominance.frozen_specs.patch import apply_frozen_patch, parse_patch
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_pillar, snapshot_six
from scripts.bofu_dominance.frozen_specs.spec import load_spec, load_specs, validate_spec

__all__ = [
    "CORRESPONDING_ISSUE",
    "EARLIEST_SAFE_ACTION_AT",
    "FORBIDDEN_RELATIVE_PATHS",
    "PILLARS",
    "PILLAR_SLUGS",
    "REQUIRED_SPEC_FIELDS",
    "apply_frozen_patch",
    "committed_forbidden_hashes",
    "content_sha256",
    "evaluate_gate",
    "forbidden_drift",
    "forbidden_path_hashes",
    "load_issue_state",
    "load_spec",
    "load_specs",
    "parse_patch",
    "run_entry",
    "snapshot_pillar",
    "snapshot_six",
    "validate_spec",
]
