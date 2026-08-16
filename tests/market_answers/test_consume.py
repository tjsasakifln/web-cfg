"""Drive the shipped Goal 03 adapter."""

from __future__ import annotations

import copy

import pytest

from scripts.market_answers import GRAIN, SCHEMA_ID
from scripts.market_answers.consume import ConsumeError, adapt_payload, load_payload
from tests.market_answers.helpers import FIXTURE, raw_fixture


def test_adapter_accepts_expected_goal_03_schema():
    payload = load_payload(FIXTURE)
    assert payload["schema"] == SCHEMA_ID
    assert payload["grain"] == GRAIN
    assert payload["statistics"]["median"] == 845000
    assert payload["statistics"]["p25"] == 318500
    assert payload["statistics"]["p75"] == 2140000
    assert payload["statistics"]["n"] == 48
    assert payload["official_live"] is False
    assert payload["producer_status"] == "CONTRACT_FIXTURE"
    assert payload["is_fixture"] is True
    assert payload["content_hash"]
    assert payload["schema_hash"]
    assert "custo_por_km" in (payload.get("not_grain") or [])
    assert payload["claim"]["authorization_state"] == "FIXTURE_NOT_AUTHORIZABLE"


def test_adapter_rejects_incompatible_schema():
    raw = raw_fixture()
    raw["schema"] = "public-read-something-else/9.0"
    with pytest.raises(ConsumeError, match="incompatible schema"):
        adapt_payload(raw)


def test_adapter_rejects_claimed_live_on_fixture():
    raw = raw_fixture()
    raw["official_live"] = True
    raw["producer_status"] = "CONTRACT_FIXTURE"
    with pytest.raises(ConsumeError, match="claimed_live"):
        adapt_payload(raw)


def test_adapter_rejects_custo_por_km_grain():
    raw = raw_fixture()
    raw["grain"] = "custo_por_km"
    with pytest.raises(ConsumeError, match="valor integral nominal"):
        adapt_payload(raw)


def test_adapter_rejects_invented_cost_per_km():
    raw = raw_fixture()
    raw["custo_por_km"] = 185000
    with pytest.raises(ConsumeError, match="custo/km"):
        adapt_payload(raw)


def test_adapter_does_not_rewrite_producer_quartiles():
    raw = raw_fixture()
    adapted = adapt_payload(copy.deepcopy(raw))
    assert adapted["statistics"]["median"] == raw["statistics"]["median"]
    assert adapted["statistics"]["p25"] == raw["statistics"]["p25"]
    assert adapted["statistics"]["p75"] == raw["statistics"]["p75"]
    assert adapted["statistics"]["n"] == raw["statistics"]["n"]
