"""Named earned-distribution metrics. List size is never a KPI."""

from __future__ import annotations

from typing import Any

from scripts.distribution.schema import FORBIDDEN_KPI_KEYS, NAMED_METRICS, SchemaError


def metrics_payload(observed: dict[str, Any] | None = None) -> dict[str, Any]:
    observed = dict(observed or {})
    forbidden = FORBIDDEN_KPI_KEYS.intersection(observed)
    if forbidden:
        raise SchemaError("forbidden_kpi:" + ",".join(sorted(forbidden)))
    payload: dict[str, Any] = {}
    for key in NAMED_METRICS:
        value = observed.get(key)
        if value is None:
            payload[key] = {"value": None, "status": "UNKNOWN"}
        else:
            payload[key] = {"value": value, "status": "observed"}
    return payload


def assert_no_backlink_kpi(payload: dict[str, Any]) -> None:
    overlap = FORBIDDEN_KPI_KEYS.intersection(payload)
    if overlap:
        raise SchemaError("forbidden_kpi:" + ",".join(sorted(overlap)))
