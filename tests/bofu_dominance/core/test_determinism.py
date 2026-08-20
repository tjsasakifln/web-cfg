"""Two builds of the shipped status must hash identically."""

from __future__ import annotations

from scripts.bofu_dominance.core.hashing import sha256_json
from tests.bofu_dominance.core.helpers import build_status


def test_build_status_is_deterministic():
    first = build_status(git_head="test-head")
    second = build_status(git_head="test-head")
    assert first == second
    assert sha256_json(first) == sha256_json(second)
    assert first["content_sha256"]
    assert first["as_of"] == "2026-08-19"
