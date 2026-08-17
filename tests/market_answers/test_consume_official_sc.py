"""Consume the official extra-cli SC export through the shipped adapter."""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path

import pytest

from scripts.market_answers.consume import (
    EXPECTED_SC_FOLDED_HASH,
    EXTRA_CLI_CONSUMER_SCHEMA,
    ConsumeError,
    adapt_payload,
    load_payload,
)
from scripts.market_answers.gate import evaluate
from scripts.market_answers.hashing import folded_content_hash
from tests.market_answers.helpers import load_shipped_candidate

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL = ROOT / "data/extra-cli/public-read-market-answer-pavimentacao/1.0/export.json"


def _raw() -> dict:
    return json.loads(OFFICIAL.read_text(encoding="utf-8"))


def test_official_file_folded_hash_matches_campaign():
    raw = _raw()
    assert raw["schema"] == EXTRA_CLI_CONSUMER_SCHEMA
    assert raw["official_live"] is True
    assert folded_content_hash(raw) == EXPECTED_SC_FOLDED_HASH


def test_adapter_copies_quartiles_and_refuses_hash_drift():
    raw = _raw()
    adapted = adapt_payload(copy.deepcopy(raw))
    assert adapted["statistics"]["median"] == raw["stats"]["median"]
    assert adapted["statistics"]["p25"] == raw["stats"]["p25"]
    assert adapted["statistics"]["p75"] == raw["stats"]["p75"]
    assert adapted["statistics"]["n"] == raw["stats"]["n"]
    assert adapted["official_live"] is True
    assert adapted["geography"]["code"] == "SC"
    assert adapted["claim"]["national_claim_allowed"] is False
    assert adapted["never_index"] is True
    assert adapted["source_folded_hash"] == EXPECTED_SC_FOLDED_HASH

    drifted = copy.deepcopy(raw)
    drifted["stats"]["median"] = 1
    with pytest.raises(ConsumeError, match="folded_hash_mismatch"):
        adapt_payload(drifted)


def test_load_payload_prefers_official_extra_cli_consumer():
    payload = load_payload()
    assert payload["official_live"] is True
    assert payload["source_folded_hash"] == EXPECTED_SC_FOLDED_HASH
    assert payload["statistics"]["n"] == _raw()["stats"]["n"]


def test_gate_keeps_official_sc_off_index():
    payload = adapt_payload(_raw())
    decision = evaluate(load_shipped_candidate(), payload, {"approvals": []}, today=date(2026, 8, 17))
    assert decision.official_live is True
    assert decision.indexable is False
    assert "noindex" in decision.robots
    assert decision.sitemap is False
    assert decision.state != "PUBLISHABLE_INDEX"
