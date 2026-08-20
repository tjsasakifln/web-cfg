"""Closed 28-day non-overlapping cohorts. Incomplete windows are never filled."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from scripts.growth_accounting.clock import (
    cohort_index_for,
    cohort_origin,
    cohort_window,
    dates_in_window,
    is_complete_day,
    parse_date,
)
from scripts.growth_accounting.constants import (
    COHORT_DAYS,
    CONTAMINATING_FAMILIES,
    METRIC_FIELDS,
    PRIMARY_SOURCE_FAMILY,
    REASON_INCOMPATIBLE_SOURCE,
    REASON_OVERLAPPING_WINDOWS,
    SOURCE_FAMILIES,
    UNKNOWN,
)
from scripts.growth_accounting.errors import GrowthAccountingError
from scripts.growth_accounting.records import as_optional_number, is_missing


def _sum_field(rows: list[dict[str, Any]], field: str) -> float | str:
    total = 0.0
    seen = False
    for row in rows:
        if field not in row:
            continue
        number = as_optional_number(row.get(field))
        if number is None:
            return UNKNOWN
        total += number
        seen = True
    if not seen:
        return UNKNOWN
    return total


def _first_seen(daily: list[dict[str, Any]]) -> dict[str, date]:
    out: dict[str, date] = {}
    for row in daily:
        asset = str(row.get("asset_id") or "")
        if not asset:
            continue
        day = parse_date(str(row["date"]))
        prev = out.get(asset)
        if prev is None or day < prev:
            out[asset] = day
    for row in daily:
        explicit = row.get("first_seen")
        asset = str(row.get("asset_id") or "")
        if explicit and asset:
            day = parse_date(str(explicit))
            prev = out.get(asset)
            if prev is None or day < prev:
                out[asset] = day
    return out


def _families_in_rows(rows: list[dict[str, Any]]) -> set[str]:
    return {str(row.get("source_family")) for row in rows if row.get("source_family")}


def build_cohorts(
    payload: dict[str, Any],
    as_of: datetime,
    *,
    freshness_lag_days: int,
) -> list[dict[str, Any]]:
    daily = list(payload.get("daily") or [])
    origin = cohort_origin()
    if not daily:
        return []

    days = [parse_date(str(row["date"])) for row in daily]
    min_day = min(days)
    max_day = max(days)
    start_index = cohort_index_for(min_day, origin=origin)
    end_index = cohort_index_for(max_day, origin=origin)

    first_seen = _first_seen(daily)
    cohorts: list[dict[str, Any]] = []
    previous_end: date | None = None

    for index in range(start_index, end_index + 1):
        start, end = cohort_window(index, origin=origin)
        if previous_end is not None and start <= previous_end:
            raise GrowthAccountingError(
                REASON_OVERLAPPING_WINDOWS,
                "generator produced overlapping cohort windows",
            )
        previous_end = end
        window_days = dates_in_window(start, end)
        assert len(window_days) == COHORT_DAYS
        complete_days = [
            day
            for day in window_days
            if is_complete_day(day, as_of, freshness_lag_days=freshness_lag_days)
        ]
        window_set = {day.isoformat() for day in window_days}
        rows = [row for row in daily if str(row.get("date")) in window_set]
        complete = len(complete_days) == COHORT_DAYS
        families = _families_in_rows(rows)
        mixed = families & CONTAMINATING_FAMILIES and PRIMARY_SOURCE_FAMILY in families
        # Mixing in the same window is allowed only because families stay separated.
        # Mixing *inside a single row* is already refused. A row claiming primary
        # while also tagging a contaminating family is incompatible.
        for row in rows:
            extra = row.get("also_source_family") or row.get("contaminated_by")
            if extra in CONTAMINATING_FAMILIES and row.get("source_family") == PRIMARY_SOURCE_FAMILY:
                raise GrowthAccountingError(
                    REASON_INCOMPATIBLE_SOURCE,
                    "primary row contaminated by another source family",
                )

        by_family: dict[str, dict[str, Any]] = {}
        for family in SOURCE_FAMILIES:
            fam_rows = [row for row in rows if row.get("source_family") == family]
            metrics = {field: _sum_field(fam_rows, field) for field in METRIC_FIELDS}
            by_family[family] = {
                "row_count": len(fam_rows),
                "metrics": metrics,
            }

        primary_rows = [
            row
            for row in rows
            if row.get("source_family") == PRIMARY_SOURCE_FAMILY
            and row.get("approved_indexable") is not False
        ]
        primary_metrics = {field: _sum_field(primary_rows, field) for field in METRIC_FIELDS}

        asset_ids = sorted({str(row.get("asset_id")) for row in primary_rows if row.get("asset_id")})
        mature_ids = [
            asset_id
            for asset_id in asset_ids
            if first_seen.get(asset_id) is not None and first_seen[asset_id] <= start
        ]
        mid_cohort_ids = [asset_id for asset_id in asset_ids if asset_id not in mature_ids]

        per_asset_clicks: dict[str, float | str] = {}
        for asset_id in asset_ids:
            asset_rows = [row for row in primary_rows if str(row.get("asset_id")) == asset_id]
            per_asset_clicks[asset_id] = _sum_field(asset_rows, "clicks")

        refresh_without_new = (
            len(mid_cohort_ids) == 0
            and _sum_field(primary_rows, "substantive_changes") not in {UNKNOWN, 0, 0.0}
        )

        cohorts.append(
            {
                "index": index,
                "cohort_id": f"c{index:03d}-{start.isoformat()}",
                "start": start.isoformat(),
                "end": end.isoformat(),
                "days": COHORT_DAYS,
                "complete_days": len(complete_days),
                "complete": complete,
                "source_families_present": sorted(families),
                "separated": True,
                "mixed_in_window": bool(mixed),
                "primary": primary_metrics,
                "by_family": by_family,
                "asset_ids": asset_ids,
                "active_asset_count": len(asset_ids) if asset_ids else UNKNOWN,
                "mature_active_asset_count": len(mature_ids) if complete else UNKNOWN,
                "mature_asset_ids": mature_ids,
                "mid_cohort_new_asset_ids": mid_cohort_ids,
                "per_asset_clicks": per_asset_clicks,
                "refresh_without_new_asset": bool(refresh_without_new),
            }
        )
    return cohorts
