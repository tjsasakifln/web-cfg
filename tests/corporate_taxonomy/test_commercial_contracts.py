"""Validate the two-layer taxonomy, page contract and price authority."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.corporate_taxonomy.contracts import (  # noqa: E402
    CommercialContractError,
    load_contracts,
    scan_owned_implementation_for_network_clients,
    validate_commercial_contracts,
)


def test_committed_commercial_contracts_are_consistent() -> None:
    counts = validate_commercial_contracts()
    assert counts == {
        "nuclei": 5,
        "service_families": 9,
        "intent_families": 13,
        "modeled_offers": 18,
    }


def test_persona_cannot_become_route_truth() -> None:
    docs = load_contracts()
    docs["taxonomy"] = copy.deepcopy(docs["taxonomy"])
    docs["taxonomy"]["expression_policy"]["route_source_of_truth"] = "persona"
    with pytest.raises(CommercialContractError, match="persona_must_not_route"):
        validate_commercial_contracts(docs)


def test_unknown_offer_fails_closed() -> None:
    docs = load_contracts()
    docs["matrix"] = copy.deepcopy(docs["matrix"])
    docs["matrix"]["intent_families"][0]["offer_ids"].append("invented_sku")
    with pytest.raises(CommercialContractError, match="unknown_offer"):
        validate_commercial_contracts(docs)


def test_founder_price_experiment_does_not_validate_margin_or_checkout() -> None:
    docs = load_contracts()
    experiment = next(
        row for row in docs["pricing"]["states"]
        if row["state"] == "FOUNDER_AUTHORIZED_EXPERIMENT"
    )
    assert experiment["allows_manual_proposal"] is True
    assert experiment["allows_public_display"] is False
    assert experiment["allows_checkout"] is False
    assert experiment["means_margin_validated"] is False
    assert docs["pricing"]["margin_validation"]["state"] == "NOT_OBSERVED"


def test_duplicate_price_state_fails_closed() -> None:
    docs = load_contracts()
    docs["pricing"] = copy.deepcopy(docs["pricing"])
    docs["pricing"]["states"].append(copy.deepcopy(docs["pricing"]["states"][0]))
    with pytest.raises(CommercialContractError, match="duplicate_price_state"):
        validate_commercial_contracts(docs)


def test_unauthorized_field_floor_fails_closed() -> None:
    docs = load_contracts()
    docs["pricing"] = copy.deepcopy(docs["pricing"])
    docs["pricing"]["founder_authorizations"][0]["field_floor_cents"] = 490000
    with pytest.raises(CommercialContractError, match="unauthorized_field_floor"):
        validate_commercial_contracts(docs)


def test_core_contract_pin_detects_same_version_content_drift() -> None:
    docs = load_contracts()
    docs["matrix"] = copy.deepcopy(docs["matrix"])
    docs["matrix"]["routing_rule"] += " MUTATED"
    with pytest.raises(CommercialContractError, match="consumer_pin_hash:matrix"):
        validate_commercial_contracts(docs)


def test_retained_b2g_typed_authority_is_complete() -> None:
    docs = load_contracts()
    retained = docs["matrix"]["offer_id_semantics"]["retained_b2g"]
    assert retained["required_deliverable_count"] == 54
    assert len(retained["required_checkout_offer_ids"]) == 4
    assert retained["mode"] == "representative_entry_points_plus_complete_typed_authority"


def test_unproved_public_price_and_credential_fail_closed() -> None:
    docs = load_contracts()
    docs["catalog"] = copy.deepcopy(docs["catalog"])
    offer = docs["catalog"]["offers"][0]
    offer["price_model"]["public_amount_cents"] = 1
    with pytest.raises(CommercialContractError, match="invented_new_price"):
        validate_commercial_contracts(docs)

    offer["price_model"]["public_amount_cents"] = None
    offer["proof_classes"].append("credential_verified")
    with pytest.raises(CommercialContractError, match="invented_credential"):
        validate_commercial_contracts(docs)


def test_new_authority_layer_has_no_dispatch_or_smtp_client() -> None:
    assert scan_owned_implementation_for_network_clients() == []
