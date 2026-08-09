"""Organic inbound engine consumer (web-cfg).

Produces ranked SEO_OPPORTUNITIES from local pSEO snapshot + GSC + editorial
inventory. Core scoring/gates shared with extra-cli organic module.
"""

from __future__ import annotations

from scripts.organic.engine import build_opportunities, load_pseo_snapshot, run_engine
from scripts.organic.gates import indexability_quality_gate
from scripts.organic.score import CONTENT_VALUE_WEIGHTS, compute_content_value_score

__all__ = [
    "CONTENT_VALUE_WEIGHTS",
    "build_opportunities",
    "compute_content_value_score",
    "indexability_quality_gate",
    "load_pseo_snapshot",
    "run_engine",
]
