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
    """National wording is allowed only when coverage+denominator say so."""
    coverage = pack.get("coverage") or {}
    ufs = coverage.get("ufs") or []
    complete = coverage.get("national_universe_complete") is True
    denom = str(coverage.get("national_denominator") or "")
    return bool(complete and len(ufs) >= 27 and denom)


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
        for field in ("pergunta", "dados", "unidade", "caveat", "takeaway"):
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

    for violation in scan_claim_language(pack):
        errors.append(f"{violation['kind']} at {violation['path']}: {violation['excerpt']}")
    return errors
