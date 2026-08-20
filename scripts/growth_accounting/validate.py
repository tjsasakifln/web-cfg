"""Validate inputs and reports. Fail closed; never auto-emit SCALE_ALLOWED."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.growth_accounting.constants import (
    ALL_STATES,
    CLASSIFIER_STATES,
    COHORT_DAYS,
    COMPONENT_KEYS,
    PRIMARY_SERIES_NAME,
    REASON_SCALE_NOT_AUTO,
    SCHEMA,
    TIMEZONE,
)
from scripts.growth_accounting.errors import GrowthAccountingError
from scripts.growth_accounting.records import validate_input as validate_input_payload
from scripts.growth_accounting.report import build_report
from scripts.growth_accounting.serialize import canonical_dumps, sha256_canonical


def validate_input(payload: dict[str, Any]) -> dict[str, Any]:
    return validate_input_payload(payload)


def validate_report(report: dict[str, Any], *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if report.get("schema") != SCHEMA:
        raise GrowthAccountingError("DEFINITION_CHANGED", "report schema mismatch")
    if report.get("timezone") != TIMEZONE:
        raise GrowthAccountingError("INVALID_CLOCK", "report timezone mismatch")
    if report.get("cohort_days") != COHORT_DAYS:
        raise GrowthAccountingError("DEFINITION_CHANGED", "cohort_days must be 28")
    state = report.get("current_state")
    if state not in CLASSIFIER_STATES:
        raise GrowthAccountingError(
            REASON_SCALE_NOT_AUTO,
            f"current_state {state!r} is not a classifier-emitted state",
        )
    if report.get("classification", {}).get("state") == "SCALE_ALLOWED":
        raise GrowthAccountingError(REASON_SCALE_NOT_AUTO, "SCALE_ALLOWED cannot be auto-emitted")
    if report.get("classification", {}).get("scale_allowed") is True:
        raise GrowthAccountingError(REASON_SCALE_NOT_AUTO, "scale_allowed must remain false")
    if state not in ALL_STATES or state == "SCALE_ALLOWED":
        raise GrowthAccountingError(REASON_SCALE_NOT_AUTO, "forbidden state")
    for key in COMPONENT_KEYS:
        if key not in (report.get("components") or {}):
            raise GrowthAccountingError(
                "MISSING_DENOMINATOR", f"component {key} missing from report"
            )
    flags = report.get("flags") or {}
    if flags.get("query_to_lead_join") is True:
        raise GrowthAccountingError("QUERY_TO_LEAD_JOIN_REFUSED", "join flag set")
    if flags.get("page_count_kpi") is True:
        raise GrowthAccountingError("PAGE_COUNT_NOT_KPI", "page_count_kpi must be false")
    if flags.get("unknown_preserved") is not True:
        raise GrowthAccountingError("SYNTHETIC_ZERO_FORBIDDEN", "UNKNOWN must be preserved")
    if flags.get("source_families_separated") is not True:
        raise GrowthAccountingError("MIXED_SOURCE_FAMILIES", "source families must stay separated")
    if (report.get("primary_series") or {}).get("name") != PRIMARY_SERIES_NAME:
        raise GrowthAccountingError(
            "PRIMARY_SERIES_NOT_NON_BRANDED", "primary series mismatch"
        )
    blob = canonical_dumps(report).lower()
    if "crescimento exponencial" in blob and report.get("public_claim"):
        raise GrowthAccountingError("INFERRED_OUTCOME", "public exponential claim is forbidden")
    if payload is not None:
        rebuilt = build_report(payload)
        if rebuilt["report_hash"] != report.get("report_hash"):
            # Compare bodies without requiring the stored file to match a newer
            # rebuild if hashes differ — still fail closed.
            raise GrowthAccountingError(
                "DEFINITION_CHANGED",
                "report_hash does not match a rebuild from the supplied input",
            )
    hashed = {k: v for k, v in report.items() if k != "report_hash"}
    expected = sha256_canonical(hashed)
    # report_hash is computed on the body before input_hash/report_hash in build.
    # Recompute the same way: drop both hashes.
    hashed2 = {k: v for k, v in report.items() if k not in {"report_hash", "input_hash"}}
    expected2 = sha256_canonical(hashed2)
    if report.get("report_hash") not in {expected, expected2}:
        raise GrowthAccountingError(
            "DEFINITION_CHANGED",
            "report_hash does not match canonical body",
        )
    return report


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))
