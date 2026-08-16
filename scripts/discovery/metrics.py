"""Six metric stages. Bot hit ≠ citation; impression ≠ session; referral ≠ lead."""

from __future__ import annotations

from typing import Any

from scripts.discovery.schema import (
    EVENT_TO_STAGE,
    FORBIDDEN_STAGE_COUNTS,
    METRIC_STAGES,
    UNKNOWN,
    SchemaError,
)


class MetricStageError(SchemaError):
    """An event was counted in a stage it does not belong to."""


def stage_for_event(event_type: str) -> str:
    if event_type not in EVENT_TO_STAGE:
        raise MetricStageError(f"unknown_event:{event_type}")
    return EVENT_TO_STAGE[event_type]


def may_count(event_type: str, stage: str) -> bool:
    if stage not in METRIC_STAGES:
        raise MetricStageError(f"unknown_stage:{stage}")
    if (event_type, stage) in FORBIDDEN_STAGE_COUNTS:
        return False
    return stage_for_event(event_type) == stage


def count_event(event_type: str, stage: str) -> None:
    """Refuse collapsed or misattributed counts. Raises on violation."""
    if (event_type, stage) in FORBIDDEN_STAGE_COUNTS:
        raise MetricStageError(f"forbidden_count:{event_type}->{stage}")
    expected = stage_for_event(event_type)
    if expected != stage:
        raise MetricStageError(f"wrong_stage:{event_type}->{stage}_expected_{expected}")


def empty_stage_payload() -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for stage in METRIC_STAGES:
        payload[stage] = {"status": UNKNOWN, "value": None, "events": []}
    return payload


def apply_observed(stages: dict[str, Any], observed: dict[str, Any] | None) -> dict[str, Any]:
    """Overlay observed values without inventing missing ones."""
    observed = observed or {}
    out = empty_stage_payload()
    for stage in METRIC_STAGES:
        cell = observed.get(stage)
        if not isinstance(cell, dict):
            continue
        status = cell.get("status") or UNKNOWN
        if status != "observed":
            continue
        out[stage] = {
            "status": "observed",
            "value": cell.get("value"),
            "events": list(cell.get("events") or []),
        }
    return out


def bot_hit_is_not_citation() -> dict[str, Any]:
    return {"rule": "bot_hit_is_not_citation", "allowed": False}


def impression_is_not_session() -> dict[str, Any]:
    return {"rule": "impression_is_not_session", "allowed": False}


def referral_is_not_lead() -> dict[str, Any]:
    return {"rule": "referral_is_not_lead", "allowed": False}


def receipt_is_not_indexation() -> dict[str, Any]:
    return {"rule": "indexnow_receipt_is_not_indexation", "allowed": False}


SEPARATION_RULES = (
    bot_hit_is_not_citation,
    impression_is_not_session,
    referral_is_not_lead,
    receipt_is_not_indexation,
)
