"""Shared builders that drive the shipped adapter/gate — not a second scorer."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from scripts.market_answers.consume import adapt_payload, load_candidate, load_payload
from scripts.market_answers.hashing import content_hash

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "data/editorial/market-answers/fixtures/contract-fixture.v1.json"
CANDIDATE = ROOT / "data/editorial/market-answers/candidates/valor-tipico-contratos-pavimentacao.v1.json"


def load_shipped_fixture() -> dict[str, Any]:
    return load_payload(FIXTURE)


def load_shipped_candidate() -> dict[str, Any]:
    return load_candidate(CANDIDATE)


def raw_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def official_like_payload(**overrides: Any) -> dict[str, Any]:
    """A Goal 03-shaped payload that can pass INDEX when every override agrees.

    Used only to knock out one gate condition at a time. Not written to the
    live extra-cli path.
    """
    base = raw_fixture()
    base["official_live"] = True
    base["producer_status"] = "OFFICIAL_LIVE"
    base["catalog_mode"] = "official_live"
    base["claimed_live"] = False
    base["test_only"] = False
    base["never_index"] = False
    base["producer_sha"] = "abc123official"
    base["coverage"] = {
        "status": "SUFFICIENT",
        "partitions_expected": 2,
        "partitions_observed": 2,
        "national_universe_complete": False,
        "stale": False,
        "min_n": 30,
        "reason_codes": [],
    }
    base["freshness"] = {
        "as_of": "2026-08-16",
        "generated_at": "2026-08-16T00:00:00Z",
        "max_age_hours": 48,
        "status": "FRESH",
    }
    base["as_of"] = "2026-08-16"
    base["claim"] = {
        "authorization_state": "AUTHORIZED",
        "national_claim_allowed": False,
        "current_publication_allowed": True,
    }
    base["reason_codes"] = []
    base.update(overrides)
    adapted = adapt_payload(base)
    return adapted


def matching_approval(payload: dict[str, Any], *, index_authorized: bool = True) -> dict[str, Any]:
    digest = payload.get("content_hash") or content_hash(payload)
    return {
        "approvals": [
            {
                "question_id": payload.get("question_id"),
                "content_hash": digest,
                "index_authorized": index_authorized,
                "approver": "test",
            }
        ]
    }


def drifted_approval(payload: dict[str, Any]) -> dict[str, Any]:
    data = matching_approval(payload)
    data["approvals"][0]["content_hash"] = "0" * 64
    return data
