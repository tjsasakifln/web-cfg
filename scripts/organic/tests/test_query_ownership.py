"""Fail-closed tests for the Medicoes/Glosas semantic ownership contract."""

from __future__ import annotations

import copy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.query_ownership import (
    discover_cluster_routes,
    load_query_ownership_contract,
    validate_query_ownership,
)


def _reasons(contract: dict) -> set[str]:
    return {
        item.reason
        for item in validate_query_ownership(ROOT, contract=contract).findings
        if item.severity == "error"
    }


def test_contract_classifies_the_complete_existing_cluster():
    contract = load_query_ownership_contract(ROOT)
    discovered = discover_cluster_routes(ROOT, contract)
    classified = {row["path"] for row in contract["routes"]}
    report = validate_query_ownership(ROOT, contract=contract)

    assert report.ok is True
    assert discovered == classified
    assert len(discovered) == contract["inventory"]["expected_existing_routes"] == 19
    assert report.stats["coverage"] == 1.0
    assert report.stats["indexable"] == 8
    assert report.stats["retain_noindex"] == 11
    assert report.stats["automatic_public_mutation"] is False


def test_each_intent_has_exactly_one_indexable_owner_and_an_information_bridge():
    contract = load_query_ownership_contract(ROOT)
    routes = {row["path"]: row for row in contract["routes"]}
    role_owners: dict[str, list[str]] = {}
    for route, row in routes.items():
        for role in row["intent_roles"]:
            if role["role"] == "OWNER":
                role_owners.setdefault(role["intent_id"], []).append(route)

    for intent in contract["intents"]:
        owner = intent["canonical_owner"]
        assert role_owners[intent["id"]] == [owner]
        assert routes[owner]["status"] == "INDEXABLE"
        if intent["stage"] == "INFORMATIONAL":
            bridge = routes[owner]["semantic_bridge"]
            assert bridge["mode"] == "INFORMATIONAL_TO_SERVICE"
            assert bridge["destination"] == contract["commercial_destination"]


def test_current_conflicts_are_visible_but_controlled_fail_closed():
    contract = load_query_ownership_contract(ROOT)
    report = validate_query_ownership(ROOT, contract=contract)
    warnings = [item for item in report.findings if item.severity == "warn"]

    assert report.ok is True
    assert report.stats["declared_conflicts"] == 5
    assert len(warnings) == 5
    assert {item.reason for item in warnings} == {"declared_query_conflict_controlled"}

    broken = copy.deepcopy(contract)
    broken["conflicts"][0]["state"] = "UNRESOLVED"
    assert "query_conflict_unresolved" in _reasons(broken)


def test_new_or_removed_cluster_routes_cannot_escape_classification():
    contract = load_query_ownership_contract(ROOT)
    broken = copy.deepcopy(contract)
    broken["routes"] = broken["routes"][1:]
    assert "unclassified_existing_route" in _reasons(broken)


def test_duplicate_owner_and_noindex_promotion_are_rejected():
    contract = load_query_ownership_contract(ROOT)

    duplicate = copy.deepcopy(contract)
    glosa = next(
        row
        for row in duplicate["routes"]
        if row["path"] == "/conteudos/glosa-de-medicao-obra-publica/"
    )
    glosa["intent_roles"][0]["role"] = "OWNER"
    assert "intent_owner_not_exactly_one" in _reasons(duplicate)

    promoted = copy.deepcopy(contract)
    glosa = next(
        row
        for row in promoted["routes"]
        if row["path"] == "/conteudos/glosa-de-medicao-obra-publica/"
    )
    glosa["status"] = "INDEXABLE"
    glosa["semantic_bridge"]["mode"] = "INFORMATIONAL_TO_SERVICE"
    reasons = _reasons(promoted)
    assert "index_state_mismatch" in reasons
    assert "controlled_conflict_competitor_indexable" in reasons


def test_redirect_or_consolidation_requires_url_exact_reversible_control():
    contract = load_query_ownership_contract(ROOT)
    broken = copy.deepcopy(contract)
    route = next(row for row in broken["routes"] if row["status"] == "RETAIN_NOINDEX")
    route["status"] = "CONSOLIDATE"
    route.pop("manual_transition", None)
    assert "irreversible_transition_contract" in _reasons(broken)


def test_public_mutations_and_baseline_drift_fail_closed():
    contract = load_query_ownership_contract(ROOT)

    automatic = copy.deepcopy(contract)
    automatic["mutation_policy"]["automatic_canonical"] = True
    assert "automatic_public_mutation_forbidden" in _reasons(automatic)

    drift = copy.deepcopy(contract)
    drift["gsc_baseline"]["current_country_device"]["returned_cluster_set"][
        "impressions"
    ] = 1
    assert "gsc_current_baseline_drift" in _reasons(drift)


def test_required_overlap_and_protected_windows_are_explicit():
    contract = load_query_ownership_contract(ROOT)

    missing_overlap = copy.deepcopy(contract)
    missing_overlap["overlaps"] = [
        row for row in missing_overlap["overlaps"] if row["family"] != "defesa-margem"
    ]
    assert "required_overlap_missing" in _reasons(missing_overlap)

    missing_freeze = copy.deepcopy(contract)
    missing_freeze["mutation_policy"]["protected_routes"] = [
        row
        for row in missing_freeze["mutation_policy"]["protected_routes"]
        if row["issue"] != 128
    ]
    assert "protected_window_missing" in _reasons(missing_freeze)
