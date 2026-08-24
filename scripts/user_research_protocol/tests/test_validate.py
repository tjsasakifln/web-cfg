from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from scripts.user_research_protocol.validate import DEFAULT_PACKAGE, ValidationError, validate_package


def copy_package(tmp_path: Path) -> Path:
    target = tmp_path / "package"
    shutil.copytree(DEFAULT_PACKAGE, target)
    return target


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def aggregate(*, completed: int) -> dict:
    status = "EXECUTED" if completed >= 5 else "AMOSTRA_INSUFICIENTE"
    raw = None
    disposition = {
        "183": "OPEN_EVIDENCE_READY",
        "184": "OPEN_BLOCKED_TRAFFIC_WINDOW",
        "188": "OPEN_BLOCKED_CLICK_WINDOW",
        "297": "OPEN_EVIDENCE_READY",
    }
    if completed < 5:
        disposition = {
            "183": "OPEN_BLOCKED_HUMAN_EVIDENCE",
            "184": "OPEN_BLOCKED_HUMAN_EVIDENCE_AND_TRAFFIC_WINDOW",
            "188": "OPEN_BLOCKED_HUMAN_EVIDENCE_AND_CLICK_WINDOW",
            "297": "OPEN_BLOCKED_HUMAN_PARTICIPANTS",
        }
    else:
        raw = {
            "183": {
                "task_successes": {"edital": 4, "glosa": 5, "reequilibrio": 4},
                "result": "APPROVED",
            },
            "184": {
                "dimension_successes": {
                    "audience": 4,
                    "problem": 4,
                    "next_action": 5,
                    "not_software": 4,
                },
                "result": "APPROVED",
            },
            "188": {
                "offers": {
                    offer_id: {
                        "audience": 4,
                        "situation": 4,
                        "deliverable": 5,
                        "next_action": 4,
                    }
                    for offer_id in (
                        "diagnostico-b2g-360",
                        "diretoria-b2g",
                        "bid-room",
                        "contract-defense",
                    )
                },
                "term_probes": {
                    "Bid Room": {"status": "PRESENT", "understood_without_descriptor": 4},
                    "Contract Defense & Margin": {"status": "NOT_PRESENT_IN_BOUND_SNAPSHOT", "understood_without_descriptor": None},
                    "Diretoria B2G fracionada": {"status": "PRESENT", "understood_without_descriptor": 4},
                },
                "result": "APPROVED",
            },
        }
    return {
        "schema": "confenge.icp-trust-session-aggregate.v1",
        "template": False,
        "protocol_version": "1.0.0",
        "run_id": "2026-09-01-01",
        "executed_at": "2026-09-01",
        "stimulus": {
            "git_sha": "a" * 40,
            "base_url": "https://deploy-preview-315--confenge.netlify.app/",
            "captured_at": "2026-09-01T10:00:00Z",
            "home_first_viewport_sha256": "b" * 64,
            "navigation_tree_sha256": "c" * 64,
            "offer_copy_sha256": "d" * 64,
            "viewport_assignment": {"mobile": min(2, completed), "desktop": max(0, completed - 2)},
        },
        "participant_counts": {
            "screened": completed,
            "eligible": completed,
            "consented": completed,
            "completed_all_protocols": completed,
        },
        "consent_attestation": {
            "private_records_verified": completed >= 5,
            "pii_in_repository": False,
            "pii_in_analytics": False,
        },
        "status": status,
        "raw_aggregate": raw,
        "issue_disposition": disposition,
    }


def add_run(package: Path, payload: dict) -> Path:
    directory = package / "runs" / payload["run_id"]
    path = directory / "aggregate.json"
    write(path, payload)
    interpretation = directory / "interpretation.md"
    if payload["participant_counts"]["completed_all_protocols"] >= 5:
        interpretation.write_text(
            "# Interpretação agregada\n\n"
            "- Protocol version: 1.0.0\n"
            f"- Git SHA do estímulo: {payload['stimulus']['git_sha']}\n"
            "- Resultado #183: APPROVED\n"
            "- Resultado #184: APPROVED\n"
            "- Resultado #188: APPROVED\n",
            encoding="utf-8",
        )
    else:
        shutil.copyfile(package / "templates" / "interpretation.template.md", interpretation)
    state_path = package / "STATE.json"
    state = load(state_path)
    completed = payload["participant_counts"]["completed_all_protocols"]
    state["as_of"] = payload["executed_at"]
    state["observed"] = {
        "eligible_consented_completions": completed,
        "sessions_executed": completed,
        "aggregate_records": 1 if completed >= 5 else 0,
    }
    if completed >= 5:
        state["human_execution"] = "EXECUTED"
        state["result_status"] = "HUMAN_EVIDENCE_READY"
        state["claims"] = {key: True for key in state["claims"]}
        state["residuals"] = payload["issue_disposition"]
    write(state_path, state)
    return path


def test_shipped_package_is_ready_but_human_execution_is_blocked() -> None:
    report = validate_package(DEFAULT_PACKAGE)
    assert report == {
        "ok": True,
        "protocol_version": "1.0.0",
        "operational_package": "READY",
        "human_execution": "BLOCKED_HUMAN_PARTICIPANTS",
        "result_status": "AMOSTRA_INSUFICIENTE",
        "completed": 0,
        "required": 5,
        "versioned_runs": 0,
    }


def test_state_cannot_claim_human_result_without_people(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    path = package / "STATE.json"
    state = load(path)
    state["claims"]["tree_test_success_rate_proven"] = True
    write(path, state)
    with pytest.raises(ValidationError, match="cannot be claimed"):
        validate_package(package)


def test_less_than_five_cannot_publish_aggregate_metrics(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=3)
    payload["raw_aggregate"] = {"183": {"success_rate": 1.0}}
    add_run(package, payload)
    with pytest.raises(ValidationError, match="cannot publish metrics"):
        validate_package(package)


def test_aggregate_rejects_pii_capable_field(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["participant_name"] = "Pessoa Exemplo"
    add_run(package, payload)
    with pytest.raises(ValidationError, match="PII-capable"):
        validate_package(package)


def test_aggregate_cannot_close_an_issue(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["issue_disposition"]["183"] = "CLOSED"
    add_run(package, payload)
    with pytest.raises(ValidationError, match="remain open"):
        validate_package(package)


def test_protocol_cannot_enable_moderator_coaching(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    path = package / "protocol.json"
    protocol = load(path)
    protocol["protocols"][0]["moderator_may_explain"] = True
    write(path, protocol)
    with pytest.raises(ValidationError, match="forbid moderator explanation"):
        validate_package(package)


def test_completed_aggregate_is_recalculated_and_interpretation_is_separate(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    add_run(package, aggregate(completed=5))
    report = validate_package(package)
    assert report["versioned_runs"] == 1


def test_completed_aggregate_rejects_inconsistent_approval(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["raw_aggregate"]["183"]["task_successes"]["glosa"] = 3
    add_run(package, payload)
    with pytest.raises(ValidationError, match="#183 result inconsistent"):
        validate_package(package)


def test_eighty_percent_threshold_does_not_round_down_for_larger_sample(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=6)
    add_run(package, payload)
    with pytest.raises(ValidationError, match="#183 result inconsistent"):
        validate_package(package)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("base_url", "https://example.com/", "clean CONFENGE"),
        ("git_sha", "short", "git SHA invalid"),
        ("home_first_viewport_sha256", "0" * 63, "stimulus digest invalid"),
    ],
)
def test_completed_run_requires_bound_confenge_stimulus(
    tmp_path: Path, field: str, value: str, message: str
) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["stimulus"][field] = value
    add_run(package, payload)
    with pytest.raises(ValidationError, match=message):
        validate_package(package)


def test_completed_run_requires_balanced_viewports(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["stimulus"]["viewport_assignment"] = {"mobile": 1, "desktop": 4}
    add_run(package, payload)
    with pytest.raises(ValidationError, match="at least two mobile"):
        validate_package(package)


def test_run_id_must_match_directory_and_execution_date(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    path = add_run(package, payload)
    payload["run_id"] = "2026-09-02-01"
    write(path, payload)
    with pytest.raises(ValidationError, match="directory name"):
        validate_package(package)


def test_copy_run_requires_exact_offers_and_term_probes(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["raw_aggregate"]["188"]["offers"].pop("bid-room")
    add_run(package, payload)
    with pytest.raises(ValidationError, match="exact offer scope"):
        validate_package(package)


def test_interpretation_rejects_pii_quote_placeholders_and_closure(tmp_path: Path) -> None:
    for content, message in (
        ("Pessoa pessoa@example.com\n" + "a" * 40, "email-like"),
        ("> citação individual\n" + "a" * 40, "blockquote"),
        ("PREENCHER\n" + "a" * 40, "placeholders"),
        ("Closes #183\n" + "a" * 40, "closing language"),
    ):
        package = copy_package(tmp_path / message.replace(" ", "-"))
        payload = aggregate(completed=5)
        path = add_run(package, payload)
        path.with_name("interpretation.md").write_text(content, encoding="utf-8")
        with pytest.raises(ValidationError, match=message):
            validate_package(package)


def test_extra_run_file_is_rejected(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    path = add_run(package, aggregate(completed=5))
    (path.parent / "notes.csv").write_text("private notes", encoding="utf-8")
    with pytest.raises(ValidationError, match="unexpected file"):
        validate_package(package)


def test_state_must_reconcile_to_versioned_run(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    add_run(package, aggregate(completed=5))
    state_path = package / "STATE.json"
    state = load(state_path)
    state["observed"]["eligible_consented_completions"] = 0
    write(state_path, state)
    with pytest.raises(ValidationError, match="subminimum state must be blocked"):
        validate_package(package)


def test_normalized_pii_key_and_tax_id_are_rejected(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["participante-email"] = "redacted"
    add_run(package, payload)
    with pytest.raises(ValidationError, match="PII-capable"):
        validate_package(package)

    package = copy_package(tmp_path / "tax")
    payload = aggregate(completed=5)
    payload["unexpected"] = "52.407.089/0001-09"
    add_run(package, payload)
    with pytest.raises(ValidationError, match="tax-id-like"):
        validate_package(package)


def test_frozen_prompt_cannot_drift_without_protocol_version(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    path = package / "PROTOCOL-FIVE-SECOND.md"
    path.write_text(path.read_text(encoding="utf-8").replace("cinco segundos", "dez segundos"), encoding="utf-8")
    with pytest.raises(ValidationError, match="frozen v1 instrument drifted"):
        validate_package(package)


def test_present_hybrid_term_is_part_of_copy_result(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    payload = aggregate(completed=5)
    payload["raw_aggregate"]["188"]["term_probes"]["Bid Room"]["understood_without_descriptor"] = 3
    add_run(package, payload)
    with pytest.raises(ValidationError, match="#188 result inconsistent"):
        validate_package(package)


def test_interpretation_result_must_match_aggregate(tmp_path: Path) -> None:
    package = copy_package(tmp_path)
    path = add_run(package, aggregate(completed=5))
    interpretation = path.with_name("interpretation.md")
    interpretation.write_text(
        interpretation.read_text(encoding="utf-8").replace("Resultado #188: APPROVED", "Resultado #188: REPROVADO"),
        encoding="utf-8",
    )
    with pytest.raises(ValidationError, match="must match aggregate for #188"):
        validate_package(package)
