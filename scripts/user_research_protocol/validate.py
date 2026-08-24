#!/usr/bin/env python3
"""Validate the versioned, aggregate-only human research package.

This gate proves protocol readiness and evidence honesty. It deliberately does
not prove that a participant exists or that a session happened.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKAGE = ROOT / "docs" / "research" / "icp-trust-session-v1"
MINIMUM_SAMPLE = 5
TRACKED_ISSUES = {"183", "184", "188", "297"}
PROTOCOL_ISSUES = {183, 184, 188}

FORBIDDEN_PII_KEYS = {
    "name",
    "participant_name",
    "email",
    "phone",
    "telephone",
    "whatsapp",
    "company",
    "employer",
    "cnpj",
    "cpf",
    "address",
    "ip",
    "ip_address",
    "contact",
    "participant_id",
    "raw_quote",
    "quote",
    "transcript",
    "recording",
    "recording_url",
}
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}(?!\d)")
RUN_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-\d{2}$")


class ValidationError(ValueError):
    """Raised when an operational package can fabricate or leak evidence."""


def _load(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ValidationError(f"missing required file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON {path}: {exc.msg}") from exc
    if not isinstance(value, dict):
        raise ValidationError(f"expected JSON object: {path}")
    return value


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def _walk_keys(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            dotted = f"{prefix}.{key}" if prefix else str(key)
            if str(key).lower() in FORBIDDEN_PII_KEYS:
                found.append(dotted)
            found.extend(_walk_keys(child, dotted))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_walk_keys(child, f"{prefix}[{index}]"))
    return found


def _assert_no_pii(payload: dict[str, Any], path: Path) -> None:
    bad_keys = _walk_keys(payload)
    _require(not bad_keys, f"PII-capable fields forbidden in {path}: {bad_keys}")
    serialized = json.dumps(payload, ensure_ascii=False)
    _require(not EMAIL_RE.search(serialized), f"email-like value forbidden in {path}")
    _require(not PHONE_RE.search(serialized), f"phone-like value forbidden in {path}")


def _validate_protocol(protocol: dict[str, Any]) -> None:
    _require(
        protocol.get("schema") == "confenge.icp-trust-session-protocol.v1",
        "protocol schema mismatch",
    )
    _require(protocol.get("protocol_version") == "1.0.0", "protocol version mismatch")
    decision = protocol.get("decision") or {}
    _require(decision.get("state") == "VALIDATE", "decision must remain VALIDATE")
    _require(decision.get("executive_front") == "INBOUND_ENGINE", "executive front missing")
    _require({"trust", "conversion"}.issubset(set(decision.get("leverage") or [])), "leverage missing")

    owner = protocol.get("owner") or {}
    _require(bool(owner.get("accountable_role")), "accountable owner role missing")
    _require(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(owner.get("review_due_at") or ""))), "review due date missing")

    recruitment = protocol.get("recruitment") or {}
    _require(bool(recruitment.get("named_source")), "named recruitment source missing")
    _require(
        recruitment.get("minimum_eligible_consented_completions") == MINIMUM_SAMPLE,
        "minimum eligible consented completions must be five",
    )
    _require(len(recruitment.get("eligibility_all_of") or []) >= 4, "ICP eligibility incomplete")
    _require(len(recruitment.get("exclusions_any_of") or []) >= 3, "recruitment exclusions incomplete")

    privacy = protocol.get("privacy") or {}
    _require(privacy.get("repository_record") == "AGGREGATE_ONLY_NO_PII", "repository must be aggregate-only")
    _require(privacy.get("analytics_record") == "AGGREGATE_ONLY_NO_PII", "analytics must be aggregate-only")
    _require(privacy.get("audio_video_recording") == "FORBIDDEN", "recording must be forbidden")
    _require(privacy.get("free_text_in_repository") == "FORBIDDEN", "repository free text must be forbidden")
    _require(privacy.get("consent_is_separate_from_marketing") is True, "research consent must be separate")
    retention = privacy.get("retention") or {}
    for key in (
        "recruitment_and_scheduling_days_max",
        "moderator_notes_days_after_aggregation_max",
        "consent_and_eligibility_proof_days_max",
    ):
        value = retention.get(key)
        _require(isinstance(value, int) and 0 < value <= 730, f"invalid retention: {key}")
    _require(privacy.get("dsar_runbook") == "docs/ops/DSAR-RETENTION-RUNBOOK.md", "DSAR runbook not bound")

    protocols = protocol.get("protocols") or []
    by_issue = {item.get("issue"): item for item in protocols if isinstance(item, dict)}
    _require(set(by_issue) == PROTOCOL_ISSUES, "exactly #183, #184 and #188 protocols are required")
    for issue, item in by_issue.items():
        _require(item.get("sample_minimum") == MINIMUM_SAMPLE, f"#{issue} sample must be five")
        _require(item.get("moderator_may_explain") is False, f"#{issue} must forbid moderator explanation")
        rule = str(item.get("approval_rule") or "").lower()
        _require("80%" in rule and "four of five" in rule, f"#{issue} approval rule must be >=80% (4/5 minimum)")
        _require(bool(item.get("rejection_rule")), f"#{issue} rejection rule missing")

    tree = by_issue[183]
    tasks = {item.get("id"): item.get("success_destination") for item in tree.get("tasks") or []}
    _require(
        tasks
        == {
            "edital": "/diagnostico-pre-licitacao/",
            "glosa": "/medicoes-glosas-obras-publicas/",
            "reequilibrio": "/reequilibrio-obras-publicas/",
        },
        "tree-test tasks or destinations drifted",
    )
    five = by_issue[184]
    _require(five.get("exposure_seconds") == 5, "five-second exposure must be exactly five")
    _require(len(five.get("questions") or []) == 4, "five-second questions incomplete")
    copy = by_issue[188]
    _require(
        set(copy.get("dimensions") or []) == {"audience", "situation", "deliverable", "next_action"},
        "copy comprehension dimensions incomplete",
    )
    _require(
        set(copy.get("terms_requiring_explicit_probe") or [])
        == {"Bid Room", "Contract Defense & Margin", "Diretoria B2G fracionada"},
        "required offer-name probes incomplete",
    )

    policy = protocol.get("issue_policy") or {}
    _require(set(map(str, policy.get("tracked_issues") or [])) == TRACKED_ISSUES, "tracked issues incomplete")
    _require(policy.get("closing_language_forbidden_before_human_evidence") is True, "close guard disabled")
    _require(policy.get("insufficient_sample_status") == "AMOSTRA_INSUFICIENTE", "insufficient state drifted")


def _validate_state(state: dict[str, Any]) -> None:
    _require(state.get("schema") == "confenge.icp-trust-session-state.v1", "state schema mismatch")
    _require(state.get("protocol_version") == "1.0.0", "state protocol version mismatch")
    _require(state.get("operational_package") == "READY", "operational package not ready")
    _require(state.get("required_eligible_consented_completions") == MINIMUM_SAMPLE, "state sample must be five")
    observed = state.get("observed") or {}
    for key in ("eligible_consented_completions", "sessions_executed", "aggregate_records"):
        _require(isinstance(observed.get(key), int) and observed[key] >= 0, f"invalid observed count: {key}")
    completed = observed["eligible_consented_completions"]
    claims = state.get("claims") or {}
    residuals = state.get("residuals") or {}
    _require(set(residuals) == TRACKED_ISSUES, "state residual issue set incomplete")
    _require(all(str(value).startswith("OPEN_BLOCKED") for value in residuals.values()), "issues must remain OPEN/BLOCKED")
    if completed < MINIMUM_SAMPLE:
        _require(state.get("human_execution") == "BLOCKED_HUMAN_PARTICIPANTS", "subminimum state must be blocked")
        _require(state.get("result_status") == "AMOSTRA_INSUFICIENTE", "subminimum result must be AMOSTRA_INSUFICIENTE")
        _require(not any(claims.values()), "human results cannot be claimed below five completions")
        _require(observed["aggregate_records"] == 0, "no aggregate result may exist below five completions")


def _count_map(value: Any, *, label: str, completed: int) -> dict[str, int]:
    _require(isinstance(value, dict) and value, f"{label} counts missing")
    for key, count in value.items():
        _require(isinstance(count, int) and 0 <= count <= completed, f"{label}.{key} out of range")
    return value


def _expected_result(counts: list[int], completed: int) -> str:
    # Integer comparison avoids rounding: successes / completed >= 4 / 5.
    return "APPROVED" if counts and all(count * 5 >= completed * 4 for count in counts) else "REPROVADO"


def _validate_completed_aggregate(payload: dict[str, Any], completed: int, path: Path) -> None:
    _require(payload.get("status") == "EXECUTED", f"completed run must be EXECUTED: {path}")
    consent = payload.get("consent_attestation") or {}
    _require(consent.get("private_records_verified") is True, f"private consent proof not attested: {path}")
    _require(consent.get("pii_in_repository") is False, f"PII repository attestation failed: {path}")
    _require(consent.get("pii_in_analytics") is False, f"PII analytics attestation failed: {path}")
    raw = payload.get("raw_aggregate")
    _require(isinstance(raw, dict), f"completed run aggregate missing: {path}")

    tree = raw.get("183") or {}
    task_counts = _count_map(tree.get("task_successes"), label="#183", completed=completed)
    _require(set(task_counts) == {"edital", "glosa", "reequilibrio"}, "#183 tasks incomplete")
    _require(tree.get("result") == _expected_result(list(task_counts.values()), completed), "#183 result inconsistent")

    five = raw.get("184") or {}
    dimension_counts = _count_map(five.get("dimension_successes"), label="#184", completed=completed)
    _require(set(dimension_counts) == {"audience", "problem", "next_action", "not_software"}, "#184 dimensions incomplete")
    _require(five.get("result") == _expected_result(list(dimension_counts.values()), completed), "#184 result inconsistent")

    copy = raw.get("188") or {}
    offers = copy.get("offers")
    _require(isinstance(offers, dict) and offers, "#188 offer counts missing")
    copy_counts: list[int] = []
    for offer, dimensions in offers.items():
        checked = _count_map(dimensions, label=f"#188.{offer}", completed=completed)
        _require(set(checked) == {"audience", "situation", "deliverable", "next_action"}, f"#188.{offer} dimensions incomplete")
        copy_counts.extend(checked.values())
    _require(copy.get("result") == _expected_result(copy_counts, completed), "#188 result inconsistent")

    disposition = payload.get("issue_disposition") or {}
    _require(set(disposition) == TRACKED_ISSUES, f"run issue disposition incomplete: {path}")
    _require(all("CLOSED" not in str(value).upper() for value in disposition.values()), f"run cannot close issues: {path}")
    interpretation = path.with_name("interpretation.md")
    _require(interpretation.is_file(), f"interpretation must be separate from aggregate: {interpretation}")


def _validate_run(payload: dict[str, Any], path: Path) -> None:
    _assert_no_pii(payload, path)
    _require(payload.get("schema") == "confenge.icp-trust-session-aggregate.v1", f"run schema mismatch: {path}")
    _require(payload.get("template") is False, f"run must set template=false: {path}")
    _require(payload.get("protocol_version") == "1.0.0", f"run version mismatch: {path}")
    _require(bool(RUN_ID_RE.fullmatch(str(payload.get("run_id") or ""))), f"invalid run_id: {path}")
    counts = payload.get("participant_counts") or {}
    expected = ("screened", "eligible", "consented", "completed_all_protocols")
    _require(all(isinstance(counts.get(key), int) and counts[key] >= 0 for key in expected), f"run counts invalid: {path}")
    _require(counts["completed_all_protocols"] <= counts["consented"] <= counts["eligible"] <= counts["screened"], f"run count ordering invalid: {path}")
    completed = counts["completed_all_protocols"]
    disposition = payload.get("issue_disposition") or {}
    _require(set(disposition) == TRACKED_ISSUES, f"run issue disposition incomplete: {path}")
    _require(all("CLOSED" not in str(value).upper() for value in disposition.values()), f"run cannot close issues: {path}")
    if completed < MINIMUM_SAMPLE:
        _require(payload.get("status") == "AMOSTRA_INSUFICIENTE", f"subminimum run must be AMOSTRA_INSUFICIENTE: {path}")
        _require(payload.get("raw_aggregate") is None, f"subminimum run cannot publish metrics: {path}")
        _require(all(str(value).startswith("OPEN_BLOCKED") for value in disposition.values()), f"subminimum issues must be OPEN/BLOCKED: {path}")
        return
    _validate_completed_aggregate(payload, completed, path)


def validate_package(package_root: Path = DEFAULT_PACKAGE) -> dict[str, Any]:
    package_root = package_root.resolve()
    required_docs = {
        "README.md",
        "RECRUITMENT.md",
        "CONSENT-RETENTION.md",
        "PROTOCOL-TREE-TEST.md",
        "PROTOCOL-FIVE-SECOND.md",
        "PROTOCOL-COPY-COMPREHENSION.md",
        "RUNBOOK.md",
        "ROLLBACK.md",
        "templates/aggregate.template.json",
        "templates/interpretation.template.md",
        "runs/README.md",
    }
    missing = sorted(item for item in required_docs if not (package_root / item).is_file())
    _require(not missing, f"operational package files missing: {missing}")
    protocol = _load(package_root / "protocol.json")
    state = _load(package_root / "STATE.json")
    template = _load(package_root / "templates" / "aggregate.template.json")
    _validate_protocol(protocol)
    _validate_state(state)
    _assert_no_pii(state, package_root / "STATE.json")
    _assert_no_pii(template, package_root / "templates" / "aggregate.template.json")
    _require(template.get("template") is True, "aggregate template marker missing")
    _require(template.get("raw_aggregate") is None, "aggregate template must not contain fabricated metrics")
    _require(template.get("status") == "AMOSTRA_INSUFICIENTE", "aggregate template must fail closed")

    run_paths = sorted((package_root / "runs").glob("*/aggregate.json"))
    for path in run_paths:
        _validate_run(_load(path), path)
    return {
        "ok": True,
        "protocol_version": protocol["protocol_version"],
        "operational_package": state["operational_package"],
        "human_execution": state["human_execution"],
        "result_status": state["result_status"],
        "completed": state["observed"]["eligible_consented_completions"],
        "required": MINIMUM_SAMPLE,
        "versioned_runs": len(run_paths),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", type=Path, default=DEFAULT_PACKAGE)
    args = parser.parse_args(argv)
    try:
        report = validate_package(args.package)
    except ValidationError as exc:
        print(f"TRUST_SESSION_PROTOCOL_FAIL {exc}")
        return 1
    print(
        "TRUST_SESSION_PROTOCOL_OK"
        f" version={report['protocol_version']}"
        f" package={report['operational_package']}"
        f" human_execution={report['human_execution']}"
        f" result={report['result_status']}"
        f" completed={report['completed']}/{report['required']}"
        f" runs={report['versioned_runs']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
