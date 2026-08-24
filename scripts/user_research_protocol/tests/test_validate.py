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
                    "offer-a": {
                        "audience": 4,
                        "situation": 4,
                        "deliverable": 5,
                        "next_action": 4,
                    }
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
            "base_url": "https://preview.invalid/",
            "viewport_assignment": {"mobile": 2, "desktop": 3},
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
    directory = package / "runs" / "2026-09-01-01"
    path = directory / "aggregate.json"
    write(path, payload)
    (directory / "interpretation.md").write_text("# Aggregate interpretation\n", encoding="utf-8")
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
    with pytest.raises(ValidationError, match="cannot close issues"):
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
