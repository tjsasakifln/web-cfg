"""SERP census: ≤4 P0/P1 queries, buckets separated, no official position."""

from __future__ import annotations

from collections import Counter

from scripts.bofu_dominance.core.serp import load_census
from tests.bofu_dominance.core.helpers import build_status, load_registry


def test_p0_p1_census_cap_and_unknown_buckets():
    registry = load_registry()
    p0_p1 = {item["id"] for item in registry["families"] if item["priority"] in {"P0", "P1"}}
    census = load_census(family_ids={item["id"] for item in registry["families"]})
    counts = Counter(row["family_id"] for row in census["observations"])
    for fid in p0_p1:
        assert counts[fid] == 4, fid
    for row in census["observations"]:
        assert row["official_position"] is None
        assert row["ranking_context"] == "UNKNOWN"
        assert row["personalization"] == "UNKNOWN"
        assert row["geo"] == "UNKNOWN"
        assert row["device"] == "UNKNOWN"
        assert isinstance(row["organic"], list)
        assert row["local_pack"]["status"] == "UNKNOWN"
        assert row["paid"]["status"] == "UNKNOWN"
        assert row["serp_features"]["status"] == "UNKNOWN"
        assert "page_type" in row["organic"][0]
        assert "proof_pattern" in row["organic"][0]
        assert "intent_fit" in row["organic"][0]
    status = build_status()
    assert status["census_summary"]["official_position_claimed"] is False
    assert status["census_summary"]["p0_p1_missing_census"] == []
