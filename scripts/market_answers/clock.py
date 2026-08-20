"""Injectable UTC clock for Market Answer freshness.

Production evaluation uses ``datetime.now(timezone.utc)``. Tests and
replay inject an explicit timezone-aware instant. Calendar-day defaults
are not used as “now”.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_instant(value: Any) -> datetime | None:
    """Parse an ISO-8601 instant. Date-only values are midnight UTC.

    Offsets (``Z``, ``+02:00``, ``-03:00``) are converted to UTC.
    Unparseable values return None.
    """
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(text[:10])
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def resolve_now(
    *,
    now: datetime | None = None,
    today: date | None = None,
) -> datetime:
    """Resolve the evaluation instant.

    ``now`` wins. ``today`` (legacy test injection) becomes midnight UTC
    of that date. Production callers pass neither and get ``utc_now()``.
    """
    if now is not None:
        return as_utc(now)
    if today is not None:
        return datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    return utc_now()


def format_utc(value: datetime) -> str:
    return as_utc(value).isoformat().replace("+00:00", "Z")
