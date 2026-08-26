#!/usr/bin/env python3
"""Validate the versioned, aggregate-only human research package.

This gate proves protocol readiness and evidence honesty. It deliberately does
not prove that a participant exists or that a session happened.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKAGE = ROOT / "docs" / "research" / "icp-trust-session-v1"
MINIMUM_SAMPLE = 5
TRACKED_ISSUES = {"183", "184"}
PROTOCOL_ISSUES = {183, 184}
SUBMINIMUM_DISPOSITION = {
    "183": "OPEN_BLOCKED_HUMAN_EVIDENCE",
    "184": "OPEN_BLOCKED_HUMAN_EVIDENCE_AND_TRAFFIC_WINDOW",
}
COMPLETED_DISPOSITION = {
    "183": "OPEN_EVIDENCE_READY",
    "184": "OPEN_BLOCKED_TRAFFIC_WINDOW",
}
STATIC_PACKAGE_FILES = {
    "CONSENT-RETENTION.md",
    "PROTOCOL-COPY-COMPREHENSION.md",
    "PROTOCOL-FIVE-SECOND.md",
    "PROTOCOL-TREE-TEST.md",
    "README.md",
    "RECRUITMENT.md",
    "ROLLBACK.md",
    "RUNBOOK.md",
    "STATE.json",
    "protocol.json",
    "runs/README.md",
    "templates/aggregate.template.json",
    "templates/interpretation.template.md",
}
PINNED_INSTRUMENT_SHA256 = {
    "protocol.json": "a88252b75b5a98593c27f1ffee8bc06e7048588505b0545d4970e547c49fdc3c",
    "RECRUITMENT.md": "2df1dfe4ffeeafa825a404a11c7b318cd63459df636d7d1ecd5815eca06c984e",
    "CONSENT-RETENTION.md": "aa46cf03a83c4f171243656d2ba1c225e40dce0609567c6929bc1e52a6dd3560",
    "PROTOCOL-TREE-TEST.md": "65f40f409ed45e1095e265d06125346de9b441b8f629c43e6ac1d2d727a3309a",
    "PROTOCOL-FIVE-SECOND.md": "622f9e1938aca95b3708b57035d43f185b892c856816087cb1674c52b570937d",
    "PROTOCOL-COPY-COMPREHENSION.md": "ff42bf04db067d0ea9496426c8d06b5ffef40040b806ce7138a42a352aa0eb61",
    "RUNBOOK.md": "ca02a4c09b438e9532f342a4b6a0a2e55bad80e35e99c859310224c69dfa6a24",
}

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
FORBIDDEN_PII_KEY_TOKENS = {
    "nome",
    "email",
    "phone",
    "telefone",
    "celular",
    "whatsapp",
    "company",
    "empresa",
    "employer",
    "cnpj",
    "cpf",
    "address",
    "endereco",
    "contato",
    "participantid",
    "rawquote",
    "citacao",
    "transcript",
    "recording",
}
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}(?!\d)")
TAX_ID_RE = re.compile(r"\b(?:\d{3}[.-]){2}\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")
RUN_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-(?:0[1-9]|[1-9]\d)$")
SHA_RE = re.compile(r"^[a-f0-9]{40}$")
DIGEST_RE = re.compile(r"^[a-f0-9]{64}$")
PREVIEW_HOST_RE = re.compile(r"^deploy-preview-[1-9]\d*--confenge\.netlify\.app$")
AUTO_CLOSE_RE = re.compile(r"(?i)\b(?:close[sd]?|fixe[sd]?|resolve[sd]?)\s+#(?:183|184)\b")
FALSE_CLOSE_RE = re.compile(r"(?i)\b(?:CLOSED|ENCERRAD[AO]S?|RESOLVID[AO]S?)\b")
SAFE_DIGEST_KEYS = {
    "git_sha",
    "home_first_viewport_sha256",
    "navigation_tree_sha256",
}
SAFE_PII_POLICY_KEYS = {"audiovideorecording"}


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


def _require_exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    _require(isinstance(value, dict), f"{label} must be an object")
    actual = set(value)
    _require(actual == expected, f"{label} schema keys mismatch: missing={sorted(expected - actual)} extra={sorted(actual - expected)}")
    return value


def _valid_date(value: Any, label: str) -> date:
    _require(isinstance(value, str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)), f"{label} must be YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"{label} is not a real calendar date") from exc


def _normalized_key(value: Any) -> str:
    plain = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def _walk_keys(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            dotted = f"{prefix}.{key}" if prefix else str(key)
            normalized = _normalized_key(key)
            if normalized not in SAFE_PII_POLICY_KEYS and (str(key).lower() in FORBIDDEN_PII_KEYS or any(
                token in normalized for token in FORBIDDEN_PII_KEY_TOKENS
            )):
                found.append(dotted)
            found.extend(_walk_keys(child, dotted))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_walk_keys(child, f"{prefix}[{index}]"))
    return found


def _assert_no_pii(payload: dict[str, Any], path: Path) -> None:
    bad_keys = _walk_keys(payload)
    _require(not bad_keys, f"PII-capable fields forbidden in {path}: {bad_keys}")
    def walk_values(value: Any, key: str = "") -> None:
        if isinstance(value, dict):
            for child_key, child in value.items():
                walk_values(child, str(child_key))
        elif isinstance(value, list):
            for child in value:
                walk_values(child, key)
        elif isinstance(value, str) and key not in SAFE_DIGEST_KEYS:
            _require(not EMAIL_RE.search(value), f"email-like value forbidden in {path}")
            _require(not PHONE_RE.search(value), f"phone-like value forbidden in {path}")
            _require(not TAX_ID_RE.search(value), f"tax-id-like value forbidden in {path}")
    walk_values(payload)


def _assert_interpretation_safe(path: Path, *, git_sha: str, expected_results: dict[str, str]) -> None:
    _require(path.is_file() and not path.is_symlink(), f"interpretation must be a regular file: {path}")
    text = path.read_text(encoding="utf-8")
    _require(text.strip(), f"interpretation cannot be empty: {path}")
    _require("PREENCHER" not in text and "RUN_ID" not in text, f"interpretation still contains placeholders: {path}")
    _require(git_sha in text, f"interpretation must repeat the bound stimulus git SHA: {path}")
    pii_text = text.replace(git_sha, "")
    _require(not EMAIL_RE.search(pii_text), f"email-like value forbidden in {path}")
    _require(not PHONE_RE.search(pii_text), f"phone-like value forbidden in {path}")
    _require(not TAX_ID_RE.search(pii_text), f"tax-id-like value forbidden in {path}")
    _require(not re.search(r"(?m)^\s*>", text), f"participant-like blockquote forbidden in {path}")
    _require(not AUTO_CLOSE_RE.search(text), f"automatic closing language forbidden in {path}")
    _require(not FALSE_CLOSE_RE.search(text), f"issue closing claim forbidden in {path}")
    for issue, result in expected_results.items():
        _require(
            bool(re.search(fr"#?{issue}\D{{0,80}}{re.escape(result)}", text, re.I | re.S)),
            f"interpretation result must match aggregate for #{issue}: {path}",
        )


def _validate_protocol(protocol: dict[str, Any]) -> None:
    _require_exact_keys(
        protocol,
        {"schema", "protocol_version", "decision", "owner", "recruitment", "privacy", "protocols", "issue_policy", "rollback"},
        "protocol",
    )
    _require(
        protocol.get("schema") == "confenge.icp-trust-session-protocol.v1",
        "protocol schema mismatch",
    )
    _require(protocol.get("protocol_version") == "1.1.0", "protocol version mismatch")
    decision = protocol.get("decision") or {}
    _require_exact_keys(decision, {"state", "priority", "executive_front", "leverage", "time_to_evidence"}, "protocol.decision")
    _require(decision.get("state") == "VALIDATE", "decision must remain VALIDATE")
    _require(decision.get("executive_front") == "INBOUND_ENGINE", "executive front missing")
    _require({"trust", "conversion"}.issubset(set(decision.get("leverage") or [])), "leverage missing")

    owner = protocol.get("owner") or {}
    _require_exact_keys(owner, {"accountable_role", "operator_role", "review_due_at"}, "protocol.owner")
    _require(bool(owner.get("accountable_role")), "accountable owner role missing")
    _valid_date(owner.get("review_due_at"), "protocol.owner.review_due_at")

    recruitment = protocol.get("recruitment") or {}
    _require_exact_keys(
        recruitment,
        {"named_source", "minimum_eligible_consented_completions", "eligibility_all_of", "exclusions_any_of", "quota_policy"},
        "protocol.recruitment",
    )
    _require(bool(recruitment.get("named_source")), "named recruitment source missing")
    _require(
        recruitment.get("minimum_eligible_consented_completions") == MINIMUM_SAMPLE,
        "minimum eligible consented completions must be five",
    )
    _require(len(recruitment.get("eligibility_all_of") or []) >= 4, "ICP eligibility incomplete")
    _require(len(recruitment.get("exclusions_any_of") or []) >= 3, "recruitment exclusions incomplete")

    privacy = protocol.get("privacy") or {}
    _require_exact_keys(
        privacy,
        {"repository_record", "analytics_record", "private_store", "audio_video_recording", "free_text_in_repository", "consent_is_separate_from_marketing", "retention", "dsar_runbook"},
        "protocol.privacy",
    )
    _require(privacy.get("repository_record") == "AGGREGATE_ONLY_NO_PII", "repository must be aggregate-only")
    _require(privacy.get("analytics_record") == "AGGREGATE_ONLY_NO_PII", "analytics must be aggregate-only")
    _require(privacy.get("audio_video_recording") == "FORBIDDEN", "recording must be forbidden")
    _require(privacy.get("free_text_in_repository") == "FORBIDDEN", "repository free text must be forbidden")
    _require(privacy.get("consent_is_separate_from_marketing") is True, "research consent must be separate")
    retention = privacy.get("retention") or {}
    _require_exact_keys(
        retention,
        {"recruitment_and_scheduling_days_max", "moderator_notes_days_after_aggregation_max", "consent_and_eligibility_proof_days_max", "aggregate_no_pii"},
        "protocol.privacy.retention",
    )
    for key in (
        "recruitment_and_scheduling_days_max",
        "moderator_notes_days_after_aggregation_max",
        "consent_and_eligibility_proof_days_max",
    ):
        value = retention.get(key)
        _require(isinstance(value, int) and 0 < value <= 730, f"invalid retention: {key}")
    _require(privacy.get("dsar_runbook") == "docs/ops/DSAR-RETENTION-RUNBOOK.md", "DSAR runbook not bound")

    protocols = protocol.get("protocols") or []
    _require(isinstance(protocols, list) and len(protocols) == 2, "exactly two protocols are required")
    by_issue = {item.get("issue"): item for item in protocols if isinstance(item, dict)}
    _require(set(by_issue) == PROTOCOL_ISSUES, "exactly #183 and #184 protocols are required")
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
    policy = protocol.get("issue_policy") or {}
    _require(set(map(str, policy.get("tracked_issues") or [])) == TRACKED_ISSUES, "tracked issues incomplete")
    _require(policy.get("closing_language_forbidden_before_human_evidence") is True, "close guard disabled")
    _require(policy.get("insufficient_sample_status") == "AMOSTRA_INSUFICIENTE", "insufficient state drifted")


def _validate_state(state: dict[str, Any]) -> None:
    _require_exact_keys(
        state,
        {"schema", "protocol_version", "as_of", "owner_role", "next_review_at", "operational_package", "human_execution", "required_eligible_consented_completions", "observed", "result_status", "claims", "residuals", "next_action"},
        "state",
    )
    _require(state.get("schema") == "confenge.icp-trust-session-state.v1", "state schema mismatch")
    _require(state.get("protocol_version") == "1.1.0", "state protocol version mismatch")
    _require(state.get("operational_package") == "READY", "operational package not ready")
    _require(state.get("required_eligible_consented_completions") == MINIMUM_SAMPLE, "state sample must be five")
    as_of = _valid_date(state.get("as_of"), "state.as_of")
    next_review = _valid_date(state.get("next_review_at"), "state.next_review_at")
    _require(next_review >= as_of, "state next review cannot precede as_of")
    observed = state.get("observed") or {}
    _require_exact_keys(observed, {"eligible_consented_completions", "sessions_executed", "aggregate_records"}, "state.observed")
    for key in ("eligible_consented_completions", "sessions_executed", "aggregate_records"):
        _require(isinstance(observed.get(key), int) and observed[key] >= 0, f"invalid observed count: {key}")
    completed = observed["eligible_consented_completions"]
    claims = state.get("claims") or {}
    _require_exact_keys(
        claims,
        {"participant_result_proven", "tree_test_success_rate_proven", "five_second_comprehension_proven"},
        "state.claims",
    )
    _require(all(isinstance(value, bool) for value in claims.values()), "state claims must be booleans")
    residuals = state.get("residuals") or {}
    _require(set(residuals) == TRACKED_ISSUES, "state residual issue set incomplete")
    _require(all("CLOSED" not in str(value).upper() for value in residuals.values()), "issues must remain open")
    if completed < MINIMUM_SAMPLE:
        _require(state.get("human_execution") == "BLOCKED_HUMAN_PARTICIPANTS", "subminimum state must be blocked")
        _require(state.get("result_status") == "AMOSTRA_INSUFICIENTE", "subminimum result must be AMOSTRA_INSUFICIENTE")
        _require(not any(claims.values()), "human results cannot be claimed below five completions")
        _require(observed["aggregate_records"] == 0, "no aggregate result may exist below five completions")
        _require(residuals == SUBMINIMUM_DISPOSITION, "subminimum state residuals drifted")


def _count_map(value: Any, *, label: str, completed: int) -> dict[str, int]:
    _require(isinstance(value, dict) and value, f"{label} counts missing")
    for key, count in value.items():
        _require(isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= completed, f"{label}.{key} out of range")
    return value


def _expected_result(counts: list[int], completed: int) -> str:
    # Integer comparison avoids rounding: successes / completed >= 4 / 5.
    return "APPROVED" if counts and all(count * 5 >= completed * 4 for count in counts) else "REPROVADO"


def _validate_stimulus(stimulus: Any, *, completed: int, executed_at: date, path: Path) -> str:
    stimulus = _require_exact_keys(
        stimulus,
        {"git_sha", "base_url", "captured_at", "home_first_viewport_sha256", "navigation_tree_sha256", "viewport_assignment"},
        f"run stimulus: {path}",
    )
    git_sha = str(stimulus.get("git_sha") or "")
    _require(bool(SHA_RE.fullmatch(git_sha)), f"run stimulus git SHA invalid: {path}")
    for key in ("home_first_viewport_sha256", "navigation_tree_sha256"):
        _require(bool(DIGEST_RE.fullmatch(str(stimulus.get(key) or ""))), f"run stimulus digest invalid ({key}): {path}")

    parsed = urlsplit(str(stimulus.get("base_url") or ""))
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValidationError(f"run stimulus base_url has an invalid port: {path}") from exc
    allowed_host = parsed.hostname == "confenge.com.br" or bool(PREVIEW_HOST_RE.fullmatch(parsed.hostname or ""))
    _require(
        parsed.scheme == "https" and allowed_host and port is None and not parsed.username and
        not parsed.password and parsed.path in ("", "/") and not parsed.query and not parsed.fragment,
        f"run stimulus base_url must be a clean CONFENGE canonical/preview origin: {path}",
    )

    captured_raw = str(stimulus.get("captured_at") or "")
    _require(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", captured_raw)), f"captured_at must be UTC seconds: {path}")
    captured_at = datetime.fromisoformat(captured_raw.replace("Z", "+00:00"))
    _require(captured_at.tzinfo == timezone.utc and captured_at.date() <= executed_at, f"stimulus capture cannot follow execution date: {path}")

    viewports = _require_exact_keys(stimulus.get("viewport_assignment"), {"mobile", "desktop"}, f"run viewport assignment: {path}")
    _require(all(isinstance(viewports[key], int) and viewports[key] >= 0 for key in viewports), f"run viewport counts invalid: {path}")
    _require(sum(viewports.values()) == completed, f"run viewport counts must equal completed participants: {path}")
    if completed >= MINIMUM_SAMPLE:
        _require(viewports["mobile"] >= 2 and viewports["desktop"] >= 2, f"completed run requires at least two mobile and two desktop exposures: {path}")
    return git_sha


def _validate_completed_aggregate(payload: dict[str, Any], completed: int, path: Path, *, git_sha: str) -> None:
    _require(payload.get("status") == "EXECUTED", f"completed run must be EXECUTED: {path}")
    consent = payload.get("consent_attestation") or {}
    _require_exact_keys(consent, {"private_records_verified", "pii_in_repository", "pii_in_analytics"}, f"run consent attestation: {path}")
    _require(consent.get("private_records_verified") is True, f"private consent proof not attested: {path}")
    _require(consent.get("pii_in_repository") is False, f"PII repository attestation failed: {path}")
    _require(consent.get("pii_in_analytics") is False, f"PII analytics attestation failed: {path}")
    raw = payload.get("raw_aggregate")
    _require(isinstance(raw, dict), f"completed run aggregate missing: {path}")
    _require_exact_keys(raw, {"183", "184"}, f"run raw aggregate: {path}")

    tree = raw.get("183") or {}
    _require_exact_keys(tree, {"task_successes", "result"}, f"run #183 aggregate: {path}")
    task_counts = _count_map(tree.get("task_successes"), label="#183", completed=completed)
    _require(set(task_counts) == {"edital", "glosa", "reequilibrio"}, "#183 tasks incomplete")
    _require(tree.get("result") == _expected_result(list(task_counts.values()), completed), "#183 result inconsistent")

    five = raw.get("184") or {}
    _require_exact_keys(five, {"dimension_successes", "result"}, f"run #184 aggregate: {path}")
    dimension_counts = _count_map(five.get("dimension_successes"), label="#184", completed=completed)
    _require(set(dimension_counts) == {"audience", "problem", "next_action", "not_software"}, "#184 dimensions incomplete")
    _require(five.get("result") == _expected_result(list(dimension_counts.values()), completed), "#184 result inconsistent")

    disposition = payload.get("issue_disposition") or {}
    _require(disposition == COMPLETED_DISPOSITION, f"completed run issue disposition drifted: {path}")
    interpretation = path.with_name("interpretation.md")
    _assert_interpretation_safe(
        interpretation,
        git_sha=git_sha,
        expected_results={"183": tree["result"], "184": five["result"]},
    )


def _validate_run(payload: dict[str, Any], path: Path) -> None:
    _assert_no_pii(payload, path)
    _require_exact_keys(
        payload,
        {"schema", "template", "protocol_version", "run_id", "executed_at", "stimulus", "participant_counts", "consent_attestation", "status", "raw_aggregate", "issue_disposition"},
        f"run aggregate: {path}",
    )
    _require(payload.get("schema") == "confenge.icp-trust-session-aggregate.v1", f"run schema mismatch: {path}")
    _require(payload.get("template") is False, f"run must set template=false: {path}")
    _require(payload.get("protocol_version") == "1.1.0", f"run version mismatch: {path}")
    run_id = str(payload.get("run_id") or "")
    _require(bool(RUN_ID_RE.fullmatch(run_id)), f"invalid run_id: {path}")
    _require(path.parent.name == run_id, f"run_id must match directory name: {path}")
    executed_at = _valid_date(payload.get("executed_at"), f"run executed_at: {path}")
    _require(run_id[:10] == executed_at.isoformat(), f"run_id date must match executed_at: {path}")
    counts = payload.get("participant_counts") or {}
    expected = ("screened", "eligible", "consented", "completed_all_protocols")
    _require_exact_keys(counts, set(expected), f"run participant counts: {path}")
    _require(all(isinstance(counts.get(key), int) and not isinstance(counts.get(key), bool) and counts[key] >= 0 for key in expected), f"run counts invalid: {path}")
    _require(counts["completed_all_protocols"] <= counts["consented"] <= counts["eligible"] <= counts["screened"], f"run count ordering invalid: {path}")
    completed = counts["completed_all_protocols"]
    git_sha = _validate_stimulus(payload.get("stimulus"), completed=completed, executed_at=executed_at, path=path)
    consent = _require_exact_keys(
        payload.get("consent_attestation"),
        {"private_records_verified", "pii_in_repository", "pii_in_analytics"},
        f"run consent attestation: {path}",
    )
    _require(all(isinstance(value, bool) for value in consent.values()), f"run consent attestation must use booleans: {path}")
    _require(consent["pii_in_repository"] is False and consent["pii_in_analytics"] is False, f"run PII attestation failed: {path}")
    disposition = payload.get("issue_disposition") or {}
    _require(set(disposition) == TRACKED_ISSUES, f"run issue disposition incomplete: {path}")
    if completed < MINIMUM_SAMPLE:
        _require(payload.get("status") == "AMOSTRA_INSUFICIENTE", f"subminimum run must be AMOSTRA_INSUFICIENTE: {path}")
        _require(payload.get("raw_aggregate") is None, f"subminimum run cannot publish metrics: {path}")
        _require(disposition == SUBMINIMUM_DISPOSITION, f"subminimum issue disposition drifted: {path}")
        interpretation = path.with_name("interpretation.md")
        template = path.parents[2] / "templates" / "interpretation.template.md"
        _require(interpretation.is_file() and not interpretation.is_symlink(), f"subminimum interpretation file missing: {interpretation}")
        _require(interpretation.read_bytes() == template.read_bytes(), f"subminimum interpretation must remain the untouched template: {interpretation}")
        return
    _validate_completed_aggregate(payload, completed, path, git_sha=git_sha)


def _validate_topology(package_root: Path) -> list[Path]:
    files: set[str] = set()
    run_files: dict[str, set[str]] = {}
    for path in package_root.rglob("*"):
        _require(not path.is_symlink(), f"symlink forbidden in research package: {path}")
        if not path.is_file():
            continue
        rel = path.relative_to(package_root).as_posix()
        files.add(rel)
        if rel in STATIC_PACKAGE_FILES:
            continue
        parts = Path(rel).parts
        _require(
            len(parts) == 3 and parts[0] == "runs" and bool(RUN_ID_RE.fullmatch(parts[1])) and
            parts[2] in {"aggregate.json", "interpretation.md"},
            f"unexpected file in research package: {rel}",
        )
        run_files.setdefault(parts[1], set()).add(parts[2])
    missing = sorted(STATIC_PACKAGE_FILES - files)
    _require(not missing, f"operational package files missing: {missing}")
    _require(len(run_files) <= 1, "protocol v1 permits one versioned panel run; a retest requires a new protocol version")
    for run_id, names in run_files.items():
        _require(names == {"aggregate.json", "interpretation.md"}, f"run {run_id} must contain exactly aggregate.json and interpretation.md")
    return [package_root / "runs" / run_id / "aggregate.json" for run_id in sorted(run_files)]


def _validate_frozen_instrument(package_root: Path) -> None:
    for rel, expected in PINNED_INSTRUMENT_SHA256.items():
        actual = hashlib.sha256((package_root / rel).read_bytes()).hexdigest()
        _require(actual == expected, f"frozen v1 instrument drifted without a version change: {rel}")


def _validate_state_against_runs(state: dict[str, Any], runs: list[dict[str, Any]]) -> None:
    observed = state["observed"]
    claims = state["claims"]
    if not runs:
        _require(observed == {"eligible_consented_completions": 0, "sessions_executed": 0, "aggregate_records": 0}, "zero-run state counts must remain zero")
        _require(state["human_execution"] == "BLOCKED_HUMAN_PARTICIPANTS", "zero-run human execution must remain blocked")
        _require(state["result_status"] == "AMOSTRA_INSUFICIENTE", "zero-run result must remain insufficient")
        _require(not any(claims.values()), "zero-run state cannot claim participant evidence")
        _require(state["residuals"] == SUBMINIMUM_DISPOSITION, "zero-run residuals drifted")
        return

    run = runs[0]
    completed = run["participant_counts"]["completed_all_protocols"]
    _require(state["as_of"] == run["executed_at"], "state as_of must match the versioned run")
    _require(observed["eligible_consented_completions"] == completed, "state completed count must match the versioned run")
    _require(observed["sessions_executed"] == completed, "state session count must match completed all-protocol sessions")
    if completed < MINIMUM_SAMPLE:
        _require(observed["aggregate_records"] == 0, "subminimum run cannot create an aggregate result record")
        _require(state["human_execution"] == "BLOCKED_HUMAN_PARTICIPANTS", "subminimum state must remain blocked")
        _require(state["result_status"] == "AMOSTRA_INSUFICIENTE", "subminimum state result drifted")
        _require(not any(claims.values()), "subminimum state cannot claim participant evidence")
        _require(state["residuals"] == SUBMINIMUM_DISPOSITION, "subminimum state residuals drifted")
        return
    _require(observed["aggregate_records"] == 1, "completed run requires exactly one aggregate result record")
    _require(state["human_execution"] == "EXECUTED", "completed state must report human execution")
    _require(state["result_status"] == "HUMAN_EVIDENCE_READY", "completed state result must be HUMAN_EVIDENCE_READY")
    _require(all(claims.values()), "completed state must report each measured human evidence dimension")
    _require(state["residuals"] == COMPLETED_DISPOSITION, "completed state residuals must match the run")


def validate_package(package_root: Path = DEFAULT_PACKAGE) -> dict[str, Any]:
    package_root = package_root.resolve()
    _require(package_root.is_dir() and not package_root.is_symlink(), f"invalid package root: {package_root}")
    run_paths = _validate_topology(package_root)
    protocol = _load(package_root / "protocol.json")
    state = _load(package_root / "STATE.json")
    template = _load(package_root / "templates" / "aggregate.template.json")
    _validate_protocol(protocol)
    _validate_frozen_instrument(package_root)
    _validate_state(state)
    _require(state.get("next_review_at") == protocol["owner"]["review_due_at"], "state/protocol review date mismatch")
    _assert_no_pii(protocol, package_root / "protocol.json")
    _assert_no_pii(state, package_root / "STATE.json")
    _assert_no_pii(template, package_root / "templates" / "aggregate.template.json")
    _require_exact_keys(
        template,
        {"schema", "template", "protocol_version", "run_id", "executed_at", "stimulus", "participant_counts", "consent_attestation", "status", "raw_aggregate", "issue_disposition"},
        "aggregate template",
    )
    _require(template.get("template") is True, "aggregate template marker missing")
    _require(template.get("schema") == "confenge.icp-trust-session-aggregate.v1", "aggregate template schema mismatch")
    _require(template.get("protocol_version") == "1.1.0", "aggregate template version mismatch")
    _require_exact_keys(
        template.get("stimulus"),
        {"git_sha", "base_url", "captured_at", "home_first_viewport_sha256", "navigation_tree_sha256", "viewport_assignment"},
        "aggregate template stimulus",
    )
    _require_exact_keys(template["stimulus"].get("viewport_assignment"), {"mobile", "desktop"}, "aggregate template viewports")
    _require_exact_keys(template.get("participant_counts"), {"screened", "eligible", "consented", "completed_all_protocols"}, "aggregate template counts")
    _require_exact_keys(template.get("consent_attestation"), {"private_records_verified", "pii_in_repository", "pii_in_analytics"}, "aggregate template consent")
    _require(template.get("run_id") is None and template.get("executed_at") is None, "aggregate template cannot claim a run")
    _require(all(value is None for key, value in template["stimulus"].items() if key != "viewport_assignment"), "aggregate template stimulus must remain empty")
    _require(all(value is None for value in template["stimulus"]["viewport_assignment"].values()), "aggregate template viewports must remain empty")
    _require(all(value is None for value in template["participant_counts"].values()), "aggregate template participant counts must remain empty")
    _require(template["consent_attestation"] == {"private_records_verified": False, "pii_in_repository": False, "pii_in_analytics": False}, "aggregate template consent attestation drifted")
    _require(template.get("raw_aggregate") is None, "aggregate template must not contain fabricated metrics")
    _require(template.get("status") == "AMOSTRA_INSUFICIENTE", "aggregate template must fail closed")
    _require(template.get("issue_disposition") == SUBMINIMUM_DISPOSITION, "aggregate template residuals drifted")

    run_payloads: list[dict[str, Any]] = []
    for path in run_paths:
        payload = _load(path)
        _validate_run(payload, path)
        run_payloads.append(payload)
    _validate_state_against_runs(state, run_payloads)
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
