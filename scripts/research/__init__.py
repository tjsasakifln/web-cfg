"""EDIÇÃO ZERO research-pack consumer.

Read-only over versioned `data/pseo` snapshots. Never writes the snapshot
tree, never queries a datalake, never copies extra-cli internals.
"""

from scripts.research.pack import build_pack, validate_pack, write_pack
from scripts.research.snapshot import load_snapshot

__all__ = ["build_pack", "load_snapshot", "validate_pack", "write_pack"]
