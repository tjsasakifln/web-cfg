"""Canonical BOFU intent ledger (campaign slot BOFU-CORE)."""

from scripts.bofu_dominance.core.constants import CAMPAIGN, GSC_LIVE_STATE, SLOT, STATES
from scripts.bofu_dominance.core.ledger import build_status, load_registry, write_artifacts
from scripts.bofu_dominance.core.recommend import recommend_family
from scripts.bofu_dominance.core.states import resolve_family_state

__all__ = [
    "CAMPAIGN",
    "GSC_LIVE_STATE",
    "SLOT",
    "STATES",
    "build_status",
    "load_registry",
    "recommend_family",
    "resolve_family_state",
    "write_artifacts",
]
