"""Fail-closed claim language gate.

A pack may describe a 4-UF recorte. It may not assert a Brazilian census,
national universe, or unsourced market-hype language.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

PROVENANCE_FIELDS = (
    "source",
    "snapshot_hash",
    "as_of",
    "cutoff",
    "denominator",
    "filters",
    "dedup_logic",
    "value_semantics",
    "exclusions",
    "limitation",
)

# Phrases that assert a Brazilian universe without matching coverage.
NATIONAL_OVERCLAIM = (
    r"\bcenso nacional\b",
    r"\buniverso (brasileiro|nacional)\b",
    r"\btotal nacional\b",
    r"\bmercado brasileiro de obras\b",
    r"\bem todo o brasil\b",
    r"\bem todas as (27 )?ufs\b",
    r"\bnas 27 unidades da federa",
    r"\bcontrata(c|ç)(o|õ)es p(u|ú)blicas do brasil\b",
    r"\bo brasil contratou\b",
    r"\bvolume nacional de\b",
    r"\bpanorama nacional completo\b",
)

# Unsourced commercial hype. Findings must carry numbers or "não sustentado".
HYPE = (
    r"\bmercado aquecido\b",
    r"\bboom do setor\b",
    r"\bexplod(iu|indo)\b",
    r"\bcrescimento acelerado\b",
    r"\bdemanda recorde\b",
    r"\baquecimento do mercado\b",
)

NATIONAL_OVERCLAIM_RE = re.compile("|".join(NATIONAL_OVERCLAIM), re.IGNORECASE)
HYPE_RE = re.compile("|".join(HYPE), re.IGNORECASE)

ALLOWED_VERDICTS = frozenset({"PUBLISH", "NEEDS_DATA", "KILL"})


def _walk_strings(obj: Any) -> Iterable[tuple[str, str]]:
    if isinstance(obj, str):
        yield ("", obj)
    elif isinstance(obj, dict):
        for key, value in obj.items():
            for path, text in _walk_strings(value):
                suffix = f".{path}" if path else ""
                yield (f"{key}{suffix}", text)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            for path, text in _walk_strings(value):
                suffix = f".{path}" if path else ""
                yield (f"[{index}]{suffix}", text)


def coverage_allows_national(pack: dict[str, Any]) -> bool:
    """National wording is allowed only when coverage+denominator+gate say so."""
    coverage = pack.get("coverage") or {}
    gate = pack.get("national_claim_gate") or coverage.get("claim_gate") or {}
    if gate.get("passed") is not True:
        return False
    ufs = coverage.get("ufs") or []
    complete = coverage.get("national_universe_complete") is True
    denom = coverage.get("national_denominator")
    denom_text = ""
    if isinstance(denom, dict):
        denom_text = str(denom.get("id") or denom.get("label") or "")
    else:
        denom_text = str(denom or "")
    return bool(complete and len(ufs) >= 27 and denom_text)


def scan_claim_language(pack: dict[str, Any]) -> list[dict[str, str]]:
    """Return claim-gate violations. Empty list means the pack is clean."""
    violations: list[dict[str, str]] = []
    allow_national = coverage_allows_national(pack)
    for path, text in _walk_strings(pack):
        if HYPE_RE.search(text):
            violations.append(
                {
                    "path": path,
                    "kind": "hype",
                    "excerpt": text[:240],
                }
            )
        if NATIONAL_OVERCLAIM_RE.search(text) and not allow_national:
            violations.append(
                {
                    "path": path,
                    "kind": "national_overclaim",
                    "excerpt": text[:240],
                }
            )
    return violations


def answered_metric_missing_provenance(metric: dict[str, Any]) -> list[str]:
    if metric.get("status") != "answered":
        return []
    missing = [field for field in PROVENANCE_FIELDS if not metric.get(field)]
    return missing


def findings_missing_evidence(
    findings: list[dict[str, Any]], questions: list[dict[str, Any]]
) -> list[str]:
    """Non-adversarial findings must point at a real question."""
    question_ids = {item.get("id") for item in questions if item.get("id")}
    bad: list[str] = []
    for item in findings:
        finding_id = str(item.get("id") or "")
        if finding_id.startswith("ADV-"):
            continue
        question_id = item.get("question_id")
        evidence = item.get("evidence") or {}
        evidence_qid = evidence.get("question_id") or question_id
        if not evidence_qid or evidence_qid not in question_ids:
            bad.append(finding_id or "unknown")
    return bad


def finding_denominator_cannot_sustain(
    pack: dict[str, Any],
) -> list[str]:
    """Block answered claims whose linked question has no usable denominator."""
    questions = {item.get("id"): item for item in pack.get("questions") or []}
    allow_national = coverage_allows_national(pack)
    bad: list[str] = []
    for item in pack.get("findings") or []:
        finding_id = str(item.get("id") or "")
        if finding_id.startswith("ADV-"):
            continue
        if item.get("status") == "unsupported":
            continue
        question = questions.get(item.get("question_id")) or {}
        denom = str(question.get("denominator") or "").strip()
        if not denom or denom.lower().startswith("n/a"):
            bad.append(f"{finding_id} missing usable denominator")
            continue
        claim = str(item.get("claim") or "")
        if NATIONAL_OVERCLAIM_RE.search(claim) and not allow_national:
            bad.append(f"{finding_id} national claim without national denominator")
    return bad


def findings_without_number_or_unsupported(findings: list[dict[str, Any]]) -> list[str]:
    bad: list[str] = []
    for item in findings:
        text = " ".join(
            str(item.get(key) or "")
            for key in ("id", "claim", "takeaway", "status")
        )
        has_digit = bool(re.search(r"\d", text))
        unsupported = "não sustentado" in text.lower() or item.get("status") == "unsupported"
        if not has_digit and not unsupported:
            bad.append(item.get("id") or text[:80])
    return bad


def validate_claim_gate(pack: dict[str, Any]) -> list[str]:
    """Structural + language gate. Returns human-readable errors."""
    errors: list[str] = []
    verdict = pack.get("verdict")
    if verdict not in ALLOWED_VERDICTS:
        errors.append(f"verdict must be one of {sorted(ALLOWED_VERDICTS)}, got {verdict!r}")

    questions = pack.get("questions") or []
    if not 5 <= len(questions) <= 8:
        errors.append(f"expected 5-8 questions, got {len(questions)}")

    charts = pack.get("charts") or []
    if len(charts) > 5:
        errors.append(f"expected at most 5 charts, got {len(charts)}")
    for chart in charts:
        for field in (
            "pergunta",
            "dados",
            "unidade",
            "caveat",
            "takeaway",
            "source",
            "method",
        ):
            if not chart.get(field):
                errors.append(f"chart {chart.get('id')} missing {field}")

    for metric in questions:
        missing = answered_metric_missing_provenance(metric)
        if missing:
            errors.append(
                f"question {metric.get('id')} answered but missing {missing}"
            )
        status = metric.get("status")
        if status not in {"answered", "unsupported", "partial"}:
            errors.append(f"question {metric.get('id')} has invalid status {status!r}")
        if status == "unsupported" and not metric.get("limitation"):
            errors.append(f"question {metric.get('id')} unsupported without limitation")

    for finding_id in findings_without_number_or_unsupported(pack.get("findings") or []):
        errors.append(f"finding {finding_id} has no number and is not marked unsupported")

    if verdict == "PUBLISH" and not coverage_allows_national(pack):
        errors.append("PUBLISH requires national_universe_complete coverage+denominator")

    indexation = pack.get("indexation") or {}
    if indexation.get("indexable") is True and not coverage_allows_national(pack):
        errors.append("indexable=true requires a passing national claim gate")
    if verdict != "PUBLISH" and indexation.get("indexable") is True:
        errors.append("indexable=true is forbidden unless verdict is PUBLISH")

    for finding_id in findings_missing_evidence(
        pack.get("findings") or [], pack.get("questions") or []
    ):
        errors.append(f"finding {finding_id} is not traced to a question/evidence")

    for message in finding_denominator_cannot_sustain(pack):
        errors.append(message)

    for violation in scan_claim_language(pack):
        errors.append(f"{violation['kind']} at {violation['path']}: {violation['excerpt']}")
    return errors
