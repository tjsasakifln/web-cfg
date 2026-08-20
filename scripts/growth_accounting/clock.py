"""America/Sao_Paulo complete-day clock. Frozen as_of only — never wall clock."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from scripts.growth_accounting.constants import (
    COHORT_DAYS,
    COHORT_ORIGIN,
    FRESHNESS_LAG_DAYS,
    REASON_INVALID_CLOCK,
    REASON_WALL_CLOCK_FORBIDDEN,
    TIMEZONE,
)
from scripts.growth_accounting.errors import GrowthAccountingError

TZ = ZoneInfo(TIMEZONE)


def parse_as_of(value: str, *, timezone_field: str) -> datetime:
    if timezone_field != TIMEZONE:
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK,
            f"timezone must be {TIMEZONE}, got {timezone_field!r}",
        )
    if not value or not isinstance(value, str):
        raise GrowthAccountingError(REASON_INVALID_CLOCK, "as_of is required")
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK, f"unparseable as_of: {value!r}"
        ) from exc
    if parsed.tzinfo is None:
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK, "as_of must include an explicit timezone offset"
        )
    return parsed.astimezone(TZ)


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK, f"invalid calendar date: {value!r}"
        ) from exc


def as_of_local_date(as_of: datetime) -> date:
    return as_of.astimezone(TZ).date()


def is_complete_day(
    day: date,
    as_of: datetime,
    *,
    freshness_lag_days: int = FRESHNESS_LAG_DAYS,
) -> bool:
    """A local day is complete only after it has ended plus freshness lag."""
    local = as_of_local_date(as_of)
    return day <= local - timedelta(days=1 + freshness_lag_days)


def cohort_origin() -> date:
    return parse_date(COHORT_ORIGIN)


def cohort_window(index: int, *, origin: date | None = None) -> tuple[date, date]:
    if index < 0:
        raise GrowthAccountingError(REASON_INVALID_CLOCK, "cohort index must be >= 0")
    start = (origin or cohort_origin()) + timedelta(days=index * COHORT_DAYS)
    end = start + timedelta(days=COHORT_DAYS - 1)
    return start, end


def cohort_index_for(day: date, *, origin: date | None = None) -> int:
    base = origin or cohort_origin()
    delta = (day - base).days
    if delta < 0:
        raise GrowthAccountingError(
            REASON_INVALID_CLOCK,
            f"date {day.isoformat()} is before cohort origin {base.isoformat()}",
        )
    return delta // COHORT_DAYS


def dates_in_window(start: date, end: date) -> list[date]:
    days: list[date] = []
    cursor = start
    while cursor <= end:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def reject_wall_clock(clock_source: str | None) -> None:
    if clock_source is None:
        return
    if str(clock_source).lower() in {"wall", "now", "datetime.now", "system"}:
        raise GrowthAccountingError(
            REASON_WALL_CLOCK_FORBIDDEN,
            "clock_source=wall is forbidden; pass a frozen as_of",
        )
