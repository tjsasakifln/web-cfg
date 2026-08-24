import json
from pathlib import Path

from scripts.bofu_dominance.frozen_specs.gate import evaluate_gate
from scripts.bofu_dominance.frozen_specs.hashing import forbidden_drift
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_six


ROOT = Path(__file__).resolve().parents[3]
FROZEN = ROOT / "data" / "bofu-dominance" / "frozen-specs"
PLAN = json.loads((FROZEN / "unlock-plan.v1.json").read_text(encoding="utf-8"))
PROPOSED = json.loads((FROZEN / "proposed-replacements.json").read_text(encoding="utf-8"))


def test_plan_is_prepare_only_until_the_original_date():
    assert PLAN["issue"] == 291
    assert PLAN["decision_state"] == "DEFER_UNTIL_DATE"
    assert PLAN["earliest_safe_action_at"] == PROPOSED["earliest_safe_action_at"] == "2026-09-16"
    assert PLAN["html_mutation_authorized"] is False
    assert PROPOSED["html_mutation_authorized"] is False


def test_plan_derives_true_and_no_op_replacements_from_the_proposal():
    true_replacements = {}
    no_ops = {}
    for slug, replacements in PROPOSED["pillars"].items():
        true_blocks = [item["block"] for item in replacements if item["before"] != item["after"]]
        no_op_blocks = [item["block"] for item in replacements if item["before"] == item["after"]]
        if true_blocks:
            true_replacements[slug] = true_blocks
        if no_op_blocks:
            no_ops[slug] = no_op_blocks
    assert PLAN["true_replacements"] == true_replacements
    assert PLAN["no_op_replacements_to_remove"] == no_ops


def test_plan_covers_exactly_the_six_protected_pillars():
    hashes = json.loads((FROZEN / "hashes.json").read_text(encoding="utf-8"))
    expected = set(hashes["pillars"])
    assert set(PLAN["protected_pillars"]) == expected == set(PROPOSED["pillars"])
    assert PLAN["capture"]["current_total"] == len(expected) == 6
    snapshots = snapshot_six(ROOT)
    assert PLAN["capture"]["current_coverage"] == sum(
        item["cta"]["form_count"] > 0 for item in snapshots
    ) == 0
    residual = PLAN["structured_data_residual"]
    residual_snapshot = next(
        item for item in snapshots if item["slug"] == residual["pillar"]
    )
    assert residual["current_types_present"] == [
        item for item in residual["required_types"] if item in residual_snapshot["schema_types"]
    ]


def test_every_precondition_is_named_and_fail_closed():
    states = {item["id"]: item["state"] for item in PLAN["preconditions_all_required"]}
    assert states == {
        "date_gate": "WAITING",
        "measurement_gate": "WAITING",
        "capture_profile": "READY",
        "frozen_hashes": "READY",
    }
    measurement = next(
        item for item in PLAN["preconditions_all_required"] if item["id"] == "measurement_gate"
    )
    decision = json.loads((ROOT / measurement["evidence_path"]).read_text(encoding="utf-8"))
    assert measurement["state"] == (
        "READY" if decision["core_ready_for_product_decisions"] else "WAITING"
    )
    capture = next(
        item for item in PLAN["preconditions_all_required"] if item["id"] == "capture_profile"
    )
    assert all((ROOT / path).is_file() for path in capture["evidence_paths"])
    gate_source = (ROOT / capture["evidence_paths"][0]).read_text(encoding="utf-8")
    assert 'profile == "priced_offer"' in gate_source
    assert 'required = "capture_form"' in gate_source
    assert PLAN["non_claims"]
    assert any("date alone" in item for item in PLAN["non_claims"])
    assert any("without --force" in item for item in PLAN["execution_sequence"])


def test_unlock_gate_requires_date_all_evidence_and_explicit_authorization():
    rule = PLAN["authorization_rule"]
    assert rule["operator"] == "AND"
    assert rule["required"] == [
        "date_gate",
        "measurement_gate",
        "capture_profile",
        "frozen_hashes",
        "html_mutation_authorized",
    ]
    assert rule["date_or_evidential_close_is_sufficient"] is False
    assert evaluate_gate(now="2026-09-16", evidential_close=True)["gate_open"] is False

    ready_plan = json.loads(json.dumps(PLAN))
    ready_plan["html_mutation_authorized"] = True
    for item in ready_plan["preconditions_all_required"]:
        item["state"] = "READY"
    assert evaluate_gate(
        now="2026-09-15", evidential_close=True, unlock_plan=ready_plan
    )["gate_open"] is False
    assert evaluate_gate(
        now="2026-09-16", evidential_close=False, unlock_plan=ready_plan
    )["gate_open"] is True


def test_prepare_only_state_keeps_every_forbidden_surface_at_its_committed_hash():
    assert forbidden_drift(ROOT) == {}
