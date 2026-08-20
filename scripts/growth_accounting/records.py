"""Input record validation. UNKNOWN stays UNKNOWN. Fail closed on PII and inference."""

from __future__ import annotations

from typing import Any

from scripts.growth_accounting.constants import (
    BLOCKED,
    CONTAMINATING_FAMILIES,
    DEFINITION_ID,
    FORBIDDEN_JOIN_FLAGS,
    FORBIDDEN_PII_KEYS,
    INFERRED_MARKERS,
    METRIC_FIELDS,
    PRIMARY_SERIES_NAME,
    PRIMARY_SOURCE_FAMILY,
    REASON_AGGREGATE_WITHOUT_PROVENANCE,
    REASON_DEFINITION_CHANGED,
    REASON_FORCE_CLOSE_INCOMPLETE,
    REASON_INCOMPATIBLE_SOURCE,
    REASON_INFERRED_OUTCOME,
    REASON_INVALID_CLOCK,
    REASON_LATE_ARRIVAL_UNRECONCILED,
    REASON_MISSING_DENOMINATOR,
    REASON_OVERLAPPING_WINDOWS,
    REASON_PAGE_COUNT_NOT_KPI,
    REASON_PRIMARY_SERIES_NOT_NON_BRANDED,
    REASON_QUERY_LEVEL_PII,
    REASON_QUERY_TO_LEAD_JOIN_REFUSED,
    REASON_RETROACTIVE_REDEFINITION,
    SCHEMA,
    SOURCE_FAMILIES,
    UNKNOWN,
)
from scripts.growth_accounting.errors import GrowthAccountingError


def is_missing(value: Any) -> bool:
    return value is None or value == UNKNOWN or value == BLOCKED


def as_optional_number(value: Any) -> float | None:
    if is_missing(value):
        return None
    if isinstance(value, bool):
        raise GrowthAccountingError(
            REASON_INFERRED_OUTCOME, "boolean is not a numeric observation"
        )
    if isinstance(value, (int, float)):
        return float(value)
    raise GrowthAccountingError(
        REASON_INFERRED_OUTCOME, f"non-numeric metric value: {value!r}"
    )


def _walk(obj: Any, path: str = "") -> list[tuple[str, Any]]:
    out: list[tuple[str, Any]] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            child = f"{path}.{key}" if path else str(key)
            out.append((child, value))
            out.extend(_walk(value, child))
    elif isinstance(obj, list):
        for idx, value in enumerate(obj):
            child = f"{path}[{idx}]"
            out.extend(_walk(value, child))
    return out


def _refuse_pii(payload: dict[str, Any]) -> None:
    flags = payload.get("flags") or {}
    if flags.get("contains_query_level_pii") is True:
        raise GrowthAccountingError(
            REASON_QUERY_LEVEL_PII, "contains_query_level_pii flag is set"
        )
    if flags.get("query_to_lead_join") is True:
        raise GrowthAccountingError(
            REASON_QUERY_TO_LEAD_JOIN_REFUSED, "query_to_lead_join is forbidden"
        )
    for key, value in (payload.get("joins") or {}).items():
        if key in FORBIDDEN_JOIN_FLAGS and value:
            raise GrowthAccountingError(
                REASON_QUERY_TO_LEAD_JOIN_REFUSED,
                f"join {key} is forbidden",
            )
    for path, value in _walk(payload):
        leaf = path.split(".")[-1].split("[")[0]
        if leaf in FORBIDDEN_PII_KEYS and value not in (None, False, UNKNOWN, BLOCKED):
            raise GrowthAccountingError(
                REASON_QUERY_LEVEL_PII,
                f"query-level or person identifier at {path} is refused",
            )
        if leaf in FORBIDDEN_JOIN_FLAGS and value:
            raise GrowthAccountingError(
                REASON_QUERY_TO_LEAD_JOIN_REFUSED,
                f"{path} is refused",
            )


def _refuse_inferred(payload: dict[str, Any]) -> None:
    flags = payload.get("flags") or {}
    if flags.get("inferred_outcomes") is True:
        raise GrowthAccountingError(
            REASON_INFERRED_OUTCOME, "inferred_outcomes flag is set"
        )
    for path, value in _walk(payload):
        leaf = path.split(".")[-1].split("[")[0]
        if leaf in INFERRED_MARKERS and value not in (None, False, UNKNOWN, BLOCKED):
            raise GrowthAccountingError(
                REASON_INFERRED_OUTCOME, f"inferred outcome at {path}"
            )
        if leaf == "outcome_method" and str(value).lower() in {
            "inferred",
            "estimated",
            "imputed",
            "filled_zero",
        }:
            raise GrowthAccountingError(
                REASON_INFERRED_OUTCOME, f"outcome_method={value!r} is refused"
            )


def _require_provenance(obj: dict[str, Any], where: str) -> None:
    prov = obj.get("provenance")
    if not isinstance(prov, dict):
        raise GrowthAccountingError(
            REASON_AGGREGATE_WITHOUT_PROVENANCE,
            f"{where} is missing provenance",
        )
    if not prov.get("source_id") or not prov.get("authority_owner"):
        raise GrowthAccountingError(
            REASON_AGGREGATE_WITHOUT_PROVENANCE,
            f"{where} provenance requires source_id and authority_owner",
        )


def validate_definition(payload: dict[str, Any]) -> None:
    schema = payload.get("schema") or payload.get("schema_version_full")
    if schema not in {SCHEMA, "1.0"} and payload.get("schema") != SCHEMA:
        raise GrowthAccountingError(
            REASON_DEFINITION_CHANGED,
            f"schema must be {SCHEMA}, got {payload.get('schema')!r}",
        )
    definition = payload.get("definition_id") or SCHEMA
    if definition != DEFINITION_ID:
        raise GrowthAccountingError(
            REASON_DEFINITION_CHANGED,
            f"definition_id must be {DEFINITION_ID}, got {definition!r}",
        )
    prior = payload.get("prior_definition_id")
    if prior and prior != DEFINITION_ID:
        raise GrowthAccountingError(
            REASON_RETROACTIVE_REDEFINITION,
            "backfill must not reclassify under a changed definition",
        )
    if payload.get("force_close_incomplete") is True:
        raise GrowthAccountingError(
            REASON_FORCE_CLOSE_INCOMPLETE,
            "incomplete windows must not be force-closed",
        )
    primary = payload.get("primary_series") or PRIMARY_SERIES_NAME
    if primary in {"page_count", "pages", "average_position", "impressions"}:
        raise GrowthAccountingError(
            REASON_PAGE_COUNT_NOT_KPI,
            "page count, impressions, and average position are not success KPIs",
        )
    if primary not in {PRIMARY_SERIES_NAME, PRIMARY_SOURCE_FAMILY, "clicks"}:
        raise GrowthAccountingError(
            REASON_PRIMARY_SERIES_NOT_NON_BRANDED,
            "primary series must be non-branded clicks on approved routes",
        )


def validate_source_family(family: str, *, where: str) -> None:
    if family not in SOURCE_FAMILIES:
        raise GrowthAccountingError(
            REASON_INCOMPATIBLE_SOURCE,
            f"{where}: unknown source_family {family!r}",
        )


def validate_daily_row(row: dict[str, Any], *, index: int) -> None:
    where = f"daily[{index}]"
    family = row.get("source_family")
    if not family:
        raise GrowthAccountingError(
            REASON_INCOMPATIBLE_SOURCE, f"{where} missing source_family"
        )
    validate_source_family(str(family), where=where)
    if not row.get("date"):
        raise GrowthAccountingError(REASON_INVALID_CLOCK, f"{where} missing date")
    if not row.get("asset_id"):
        raise GrowthAccountingError(
            REASON_MISSING_DENOMINATOR, f"{where} missing asset_id"
        )
    _require_provenance(row, where)
    mixed = row.get("mixed_families") or row.get("source_families")
    if isinstance(mixed, (list, tuple)) and len(set(mixed)) > 1:
        raise GrowthAccountingError(
            REASON_INCOMPATIBLE_SOURCE,
            f"{where} mixes source families {mixed}",
        )
    if row.get("approved_indexable") is False and family == PRIMARY_SOURCE_FAMILY:
        return
    for field in METRIC_FIELDS:
        if field in row:
            as_optional_number(row[field])


def validate_late_arrivals(payload: dict[str, Any]) -> None:
    for idx, item in enumerate(payload.get("late_arrivals") or []):
        if item.get("reconciled") is True:
            continue
        raise GrowthAccountingError(
            REASON_LATE_ARRIVAL_UNRECONCILED,
            f"late_arrivals[{idx}] is not reconciled",
        )


def validate_windows(payload: dict[str, Any]) -> None:
    windows = payload.get("cohort_windows") or []
    parsed: list[tuple[str, str]] = []
    for idx, window in enumerate(windows):
        start = window.get("start")
        end = window.get("end")
        if not start or not end:
            raise GrowthAccountingError(
                REASON_INVALID_CLOCK, f"cohort_windows[{idx}] missing start/end"
            )
        parsed.append((start, end))
    for i, (a_start, a_end) in enumerate(parsed):
        for j, (b_start, b_end) in enumerate(parsed):
            if j <= i:
                continue
            if a_start <= b_end and b_start <= a_end:
                raise GrowthAccountingError(
                    REASON_OVERLAPPING_WINDOWS,
                    f"cohort windows {i} and {j} overlap",
                )


def validate_input(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise GrowthAccountingError(REASON_DEFINITION_CHANGED, "input must be an object")
    if payload.get("clock_source"):
        from scripts.growth_accounting.clock import reject_wall_clock

        reject_wall_clock(str(payload.get("clock_source")))
    if not payload.get("as_of"):
        raise GrowthAccountingError(REASON_INVALID_CLOCK, "as_of is required")
    if payload.get("timezone") != "America/Sao_Paulo":
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK,
            "timezone must be America/Sao_Paulo",
        )
    from scripts.growth_accounting.clock import parse_as_of

    parse_as_of(str(payload["as_of"]), timezone_field=str(payload["timezone"]))
    validate_definition(payload)
    _refuse_pii(payload)
    _refuse_inferred(payload)
    validate_late_arrivals(payload)
    validate_windows(payload)
    for idx, row in enumerate(payload.get("daily") or []):
        validate_daily_row(row, index=idx)
    for idx, row in enumerate(payload.get("snapshot_aggregates") or []):
        _require_provenance(row, f"snapshot_aggregates[{idx}]")
        family = row.get("source_family")
        if family:
            validate_source_family(str(family), where=f"snapshot_aggregates[{idx}]")
        if row.get("complete_closed_cohort") is True and not (payload.get("daily") or []):
            raise GrowthAccountingError(
                REASON_INCOMPATIBLE_SOURCE,
                "snapshot aggregate cannot claim a complete closed cohort without daily rows",
            )
    mixed_primary = payload.get("primary_includes_families") or []
    if any(fam in CONTAMINATING_FAMILIES for fam in mixed_primary):
        raise GrowthAccountingError(
            REASON_INCOMPATIBLE_SOURCE,
            "primary series must not include paid/branded/legacy/direct/partner/outbound",
        )
    return payload
