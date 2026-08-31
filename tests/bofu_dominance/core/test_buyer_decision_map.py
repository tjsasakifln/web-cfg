"""Adversarial contract tests for the canonical #543 buyer-decision map."""

from __future__ import annotations

import copy
import json
import subprocess

from scripts.bofu_dominance.core.buyer_decision_map import (
    MapValidationReport,
    _validate_reconciled_authorities,
    check_report,
    validate_buyer_decision_map,
)
from scripts.bofu_dominance.core.constants import BUYER_DECISION_MAP_PATH, ROOT


def _document() -> dict:
    return json.loads(BUYER_DECISION_MAP_PATH.read_text(encoding="utf-8"))


def _reasons(document: dict) -> set[str]:
    return {item.reason for item in validate_buyer_decision_map(ROOT, document).findings}


def _row(document: dict, family_id: str) -> dict:
    return next(row for row in document["rows"] if row["family_id"] == family_id)


def _json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def test_projection_covers_every_buyer_job_with_one_owner_or_gap():
    report = validate_buyer_decision_map()
    assert report.ok, report.findings
    assert report.stats == {
        "buyer_jobs": 15,
        "registry_buyer_jobs": 15,
        "coverage_percent": 100.0,
        "canonical_owners": 13,
        "gaps": 2,
        "duplicate_owners": 0,
        "gsc_unknown": 15,
        "protected_routes": 6,
        "controllable_queue": 4,
        "reconciled_authorities": 9,
        "coverage_states": {
            "COMMERCIAL_BRIDGE_GAP": 2,
            "CONTENT_GAP": 1,
            "MEASUREMENT_WAIT": 9,
            "NO_DEMAND_EVIDENCE": 1,
            "OWNED_BUT_WEAK": 2,
        },
        "wave_decision": "INSUFFICIENT_EVIDENCE",
    }


def test_duplicate_owner_and_high_intent_orphan_fail_closed():
    duplicate = copy.deepcopy(_document())
    _row(duplicate, "defesa-sancoes")["canonical_owner_url"] = _row(
        duplicate, "defesa-margem"
    )["canonical_owner_url"]
    assert "duplicate_canonical_owner" in _reasons(duplicate)

    orphan = copy.deepcopy(_document())
    target = _row(orphan, "defesa-margem")
    target["canonical_owner_url"] = None
    target["gap"] = None
    assert "high_intent_orphan" in _reasons(orphan)


def test_closed_issue_cannot_become_operational_owner():
    document = copy.deepcopy(_document())
    _row(document, "defesa-margem")["issue_refs"].append(
        {"number": 155, "role": "OPERATIONAL_OWNER"}
    )
    assert "closed_issue_is_operational_owner" in _reasons(document)

    self_attested = copy.deepcopy(document)
    self_attested["issue_state_evidence"]["issues"] = {"155": "OPEN"}
    reasons = _reasons(self_attested)
    assert "issue_state_evidence_drift" in reasons
    assert "closed_issue_is_operational_owner" in reasons


def test_generic_edge_and_missing_destination_fail_closed():
    generic = copy.deepcopy(_document())
    _row(generic, "gestao-contratual")["next_likely_decision"] = "Saiba mais"
    assert "generic_edge_without_next_decision" in _reasons(generic)

    missing = copy.deepcopy(_document())
    _row(missing, "gestao-contratual")["canonical_destination"] = (
        "https://confenge.com.br/rota-inexistente/"
    )
    assert "canonical_destination_missing" in _reasons(missing)


def test_protected_route_never_becomes_execute_now():
    document = copy.deepcopy(_document())
    target = _row(document, "aditivos")
    target["coverage_state"] = "OWNED_BUT_WEAK"
    target["execution_state"] = "EXECUTE_NOW"
    assert "protected_route_executable_now" in _reasons(document)

    disguised = copy.deepcopy(_document())
    _row(disguised, "aditivos")["execution_state"] = "PUBLISH_NOW"
    reasons = _reasons(disguised)
    assert "execution_state_invalid" in reasons
    assert "protected_route_executable_now" in reasons


def test_unknown_gsc_is_not_no_demand_without_independent_basis():
    document = copy.deepcopy(_document())
    target = _row(document, "bid-readiness")
    target["gap"]["evidence_basis"] = "GSC_ABSENCE"
    assert "unknown_gsc_inferred_as_no_demand" in _reasons(document)

    zero_reason = copy.deepcopy(_document())
    _row(zero_reason, "defesa-margem")["gsc"]["reason"] = "zero demand"
    assert "gsc_reason_drift" in _reasons(zero_reason)


def test_gsc_must_reconcile_with_the_versioned_overlay():
    fabricated = copy.deepcopy(_document())
    _row(fabricated, "aditivos")["gsc"] = {
        "status": "OBSERVED_COMPARABLE",
        "clicks": 999999,
        "impressions": 999999,
    }
    reasons = _reasons(fabricated)
    assert "gsc_policy_state_mismatch" in reasons
    assert "gsc_source_drift" in reasons
    assert "gsc_observation_drift" in reasons


def test_structurally_empty_quality_proof_and_answer_fail_closed():
    document = copy.deepcopy(_document())
    target = _row(document, "defesa-margem")
    target["content_quality"] = {}
    target["proof"] = {}
    target["current_answer"]["source_urls"] = []
    reasons = _reasons(document)
    assert "content_quality_invalid" in reasons
    assert "proof_state_invalid" in reasons
    assert "proof_claim_boundary_missing" in reasons
    assert "owned_intent_without_proof_source" in reasons
    assert "owned_intent_without_current_answer" in reasons


def test_gap_state_priority_factors_and_baseline_cannot_drift():
    gap = copy.deepcopy(_document())
    _row(gap, "partner-integrity")["gap"]["state"] = "BOGUS"
    assert "gap_coverage_state_mismatch" in _reasons(gap)

    fake_offer = copy.deepcopy(_document())
    _row(fake_offer, "partner-integrity")["offer"]["offer_id"] = "FAKE-OFFER"
    assert "gap_offer_invalid" in _reasons(fake_offer)

    priority = copy.deepcopy(_document())
    _row(priority, "defesa-margem")["prioritization"]["commercial_intent"] = 1
    assert "commercial_intent_priority_drift" in _reasons(priority)

    baseline = copy.deepcopy(_document())
    baseline["baseline"]["origin_main"] = "deadbeef"
    assert "baseline_origin_main_drift" in _reasons(baseline)


def test_proof_and_quality_claim_states_are_closed_enums():
    document = copy.deepcopy(_document())
    target = _row(document, "defesa-margem")
    target["proof"]["state"] = "CUSTOMER_ROI_PROVEN"
    target["content_quality"]["state"] = "PROVEN_DOMINANT"
    reasons = _reasons(document)
    assert "proof_state_invalid" in reasons
    assert "content_quality_state_invalid" in reasons


def test_every_pinned_authority_is_semantically_reconciled():
    document = _document()
    registry = _json("data/bofu-dominance/core/intent-registry.v2.json")
    matrix = _json("data/organic/bofu-intent-matrix.json")
    demand = _json("data/organic/demand-map.json")
    content = _json("data/organic/content-service-map.json")
    frozen = _json("data/bofu-dominance/frozen-specs/query-ownership.json")
    semantic = _json("data/organic/medicoes-glosas-query-ownership.v1.json")

    next(node for node in demand["nodes"] if node["id"] == "need-reequilibrio-pleito")[
        "service_path"
    ] = "/wrong/"
    next(item for item in content["clusters"] if item["id"] == "reequilibrio")[
        "service_path"
    ] = "/wrong/"
    semantic["overlaps"][0]["owner_path"] = "/wrong/"
    duplicate_query = frozen["pillars"]["medicoes-glosas-obras-publicas"][
        "query_ownership"
    ]["owned"][0]
    frozen["pillars"]["reequilibrio-obras-publicas"]["query_ownership"][
        "owned"
    ].append(duplicate_query)
    frozen["pillars"].pop("aditivos-obras-publicas")

    report = MapValidationReport()
    _validate_reconciled_authorities(
        doc=document,
        root=ROOT,
        registry_by_id={item["id"]: item for item in registry["families"]},
        matrix_by_id={item["intent_cluster"]: item for item in matrix["rows"]},
        demand_map=demand,
        content_map=content,
        frozen_ownership=frozen,
        semantic_ownership=semantic,
        report=report,
    )
    reasons = {item.reason for item in report.findings}
    assert "demand_owner_conflict_unreconciled" in reasons
    assert "content_cluster_owner_drift" in reasons
    assert "semantic_overlap_owner_drift" in reasons
    assert "frozen_pillar_set_drift" in reasons
    assert "duplicate_owned_query" in reasons


def test_controllable_queue_is_deterministic_capped_and_preserves_unknown():
    document = _document()
    assert [item["family_id"] for item in document["controllable_gap_queue"]] == [
        "defesa-margem",
        "gestao-contratual",
        "bid-room",
        "defesa-sancoes",
    ]
    assert len(document["controllable_gap_queue"]) <= 5
    for family_id in [item["family_id"] for item in document["controllable_gap_queue"]]:
        priority = _row(document, family_id)["prioritization"]
        assert priority["search_demand"] == {
            "state": "UNKNOWN",
            "score": None,
        }
        assert priority["score"]["value"] is None
        assert priority["score"]["ceiling"] == priority["score"]["known_factor_product"] * 5


def test_tracked_report_is_reproducible_from_projection():
    report = check_report()
    assert report.ok, report.findings


def test_measurement_windows_are_unchanged_from_origin_main():
    before = json.loads(
        subprocess.run(
            [
                "git",
                "show",
                "origin/main:data/bofu-dominance/core/intent-registry.v2.json",
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    )
    after = _json("data/bofu-dominance/core/intent-registry.v2.json")

    def windows(document: dict) -> dict:
        return {
            item["id"]: {
                "earliest_safe_action_at": item.get("earliest_safe_action_at"),
                "freeze": item.get("freeze"),
            }
            for item in document["families"]
        }

    assert windows(after) == windows(before)
