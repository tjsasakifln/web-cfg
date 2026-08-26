#!/usr/bin/env python3
"""Versioned, query-free GSC operational history and fail-closed readiness."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

GSC_HISTORY_SCHEMA = "confenge_private_gsc_history_v1"
GSC_READINESS_CONTRACT = "gsc-readiness/v2"
WINDOW_DAYS = 28
MINIMUM_DISTINCT_AS_OF = 3
MAX_AS_OF_LAG_DAYS = 14
MAX_OBSERVATIONS = 120
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


class HistoryStateError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _iso_dates(start: date, end: date) -> list[str]:
    values: list[str] = []
    current = start
    while current <= end:
        values.append(current.isoformat())
        current += timedelta(days=1)
    return values


def _parse_date(value: Any, error: str = "gsc_history_date_invalid") -> date:
    try:
        parsed = date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise HistoryStateError(error) from exc
    if parsed.isoformat() != str(value):
        raise HistoryStateError(error)
    return parsed


def _parse_datetime(value: Any, error: str = "gsc_history_timestamp_invalid") -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise HistoryStateError(error) from exc
    if parsed.tzinfo is None:
        raise HistoryStateError(error)
    return parsed.astimezone(timezone.utc)


def history_hash(state: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in state.items() if key != "state_sha256"}
    return _sha256(unsigned)


def seal_history(state: dict[str, Any]) -> dict[str, Any]:
    sealed = json.loads(json.dumps(state, ensure_ascii=False))
    sealed["state_sha256"] = history_hash(sealed)
    return sealed


def empty_history(*, now: datetime | None = None) -> dict[str, Any]:
    timestamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
    return seal_history(
        {
            "schema": GSC_HISTORY_SCHEMA,
            "contract_version": GSC_READINESS_CONTRACT,
            "window_days": WINDOW_DAYS,
            "minimum_distinct_as_of": MINIMUM_DISTINCT_AS_OF,
            "max_as_of_lag_days": MAX_AS_OF_LAG_DAYS,
            "created_at": timestamp,
            "updated_at": timestamp,
            "parent_state_sha256": None,
            "observations": [],
            "last_attempt": None,
            "last_known_good": None,
            "readiness": {
                "ready_for_product_decisions": False,
                "status": "UNKNOWN",
                "access_mode": "NONE",
                "reason_codes": ["history_store_empty"],
                "window_start": None,
                "window_end": None,
                "observed_dates": [],
                "missing_dates": [],
                "distinct_as_of": 0,
                "freshness_as_of": None,
            },
        }
    )


def _observation_identity(observation: dict[str, Any]) -> dict[str, Any]:
    """Stable data identity; retries and run timestamps must not renew freshness."""
    return {
        key: observation.get(key)
        for key in (
            "source",
            "synthetic",
            "complete",
            "as_of",
            "start",
            "end",
            "observed_dates",
            "snapshot_sha256",
        )
    }


def validate_history(state: Any) -> dict[str, Any]:
    if not isinstance(state, dict):
        raise HistoryStateError("gsc_history_invalid")
    if state.get("schema") != GSC_HISTORY_SCHEMA:
        raise HistoryStateError("gsc_history_schema_unsupported")
    if state.get("contract_version") != GSC_READINESS_CONTRACT:
        raise HistoryStateError("gsc_history_contract_unsupported")
    if state.get("state_sha256") != history_hash(state):
        raise HistoryStateError("gsc_history_hash_mismatch")
    if (
        state.get("window_days") != WINDOW_DAYS
        or state.get("minimum_distinct_as_of") != MINIMUM_DISTINCT_AS_OF
        or state.get("max_as_of_lag_days") != MAX_AS_OF_LAG_DAYS
    ):
        raise HistoryStateError("gsc_history_contract_invalid")
    parent_hash = state.get("parent_state_sha256")
    if parent_hash is not None and (not isinstance(parent_hash, str) or len(parent_hash) != 64):
        raise HistoryStateError("gsc_history_parent_hash_invalid")
    observations = state.get("observations")
    if not isinstance(observations, list) or len(observations) > MAX_OBSERVATIONS:
        raise HistoryStateError("gsc_history_observations_invalid")
    seen: set[str] = set()
    for observation in observations:
        if not isinstance(observation, dict):
            raise HistoryStateError("gsc_history_observation_invalid")
        start = _parse_date(observation.get("start"), "gsc_history_observation_invalid")
        end = _parse_date(observation.get("end"), "gsc_history_observation_invalid")
        _parse_date(observation.get("as_of"), "gsc_history_observation_invalid")
        observed_dates = observation.get("observed_dates")
        reprocessed_dates = observation.get("reprocessed_dates")
        if (
            start > end
            or observation.get("source") != "search_analytics_api"
            or observation.get("synthetic") is not False
            or observation.get("complete") is not True
            or not SHA256_RE.fullmatch(str(observation.get("snapshot_sha256") or ""))
            or not isinstance(observed_dates, list)
            or not isinstance(reprocessed_dates, list)
        ):
            raise HistoryStateError("gsc_history_observation_invalid")
        for day in observed_dates:
            parsed = _parse_date(day, "gsc_history_observation_invalid")
            if parsed < start or parsed > end:
                raise HistoryStateError("gsc_history_observation_invalid")
        if any(day not in observed_dates for day in reprocessed_dates):
            raise HistoryStateError("gsc_history_observation_invalid")
        expected_id = _sha256(_observation_identity(observation))
        if observation.get("observation_id") != expected_id or expected_id in seen:
            raise HistoryStateError("gsc_history_observation_hash_mismatch")
        seen.add(expected_id)
    readiness = state.get("readiness")
    if (
        not isinstance(readiness, dict)
        or not isinstance(readiness.get("ready_for_product_decisions"), bool)
        or readiness.get("status") not in {"READY", "UNKNOWN", "STALE"}
        or readiness.get("access_mode") not in {"READ_WRITE", "READ_ONLY", "NONE"}
        or not isinstance(readiness.get("reason_codes"), list)
        or not isinstance(readiness.get("observed_dates"), list)
        or not isinstance(readiness.get("missing_dates"), list)
    ):
        raise HistoryStateError("gsc_history_readiness_invalid")
    lkg = state.get("last_known_good")
    lkg_observation = (
        next(
            (item for item in observations if item["observation_id"] == lkg.get("observation_id")),
            None,
        )
        if isinstance(lkg, dict)
        else None
    )
    if lkg is not None and (
        not isinstance(lkg, dict)
        or lkg_observation is None
        or lkg.get("snapshot_sha256") != lkg_observation.get("snapshot_sha256")
        or lkg.get("as_of") != lkg_observation.get("as_of")
        or lkg.get("observed_at") != lkg_observation.get("observed_at")
    ):
        raise HistoryStateError("gsc_history_last_known_good_invalid")
    return state


def read_history(path: Path, *, now: datetime | None = None) -> dict[str, Any]:
    if not path.is_file():
        return empty_history(now=now)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HistoryStateError("gsc_history_corrupt") from exc
    return validate_history(payload)


def write_history(path: Path, state: dict[str, Any]) -> None:
    validate_history(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_observation(
    *,
    as_of: date,
    start: date,
    end: date,
    snapshot_sha256: str,
    observed_at: datetime,
    run_id: str,
    reprocess_days: int,
    observed_dates: list[str] | None = None,
) -> dict[str, Any]:
    if start > end or as_of != end or not SHA256_RE.fullmatch(snapshot_sha256):
        raise HistoryStateError("gsc_observation_invalid")
    dates = sorted(set(observed_dates or _iso_dates(start, end)))
    reprocessed = dates[-max(0, reprocess_days) :] if reprocess_days else []
    observation = {
        "source": "search_analytics_api",
        "synthetic": False,
        "complete": True,
        "as_of": as_of.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "observed_dates": dates,
        "reprocessed_dates": reprocessed,
        "snapshot_sha256": snapshot_sha256,
        "observed_at": observed_at.astimezone(timezone.utc).isoformat(),
        "run_id": str(run_id or "local"),
    }
    observation["observation_id"] = _sha256(_observation_identity(observation))
    return observation


def _evaluate_readiness(
    observations: list[dict[str, Any]],
    *,
    now: datetime,
    has_last_known_good: bool,
) -> dict[str, Any]:
    if not observations:
        return {
            "ready_for_product_decisions": False,
            "status": "STALE" if has_last_known_good else "UNKNOWN",
            "access_mode": "READ_ONLY" if has_last_known_good else "NONE",
            "reason_codes": ["history_store_empty"],
            "window_start": None,
            "window_end": None,
            "observed_dates": [],
            "missing_dates": [],
            "distinct_as_of": 0,
            "freshness_as_of": None,
        }
    latest = max(observations, key=lambda item: (item["as_of"], item["observed_at"]))
    window_end = _parse_date(latest["as_of"])
    window_start = window_end - timedelta(days=WINDOW_DAYS - 1)
    expected = set(_iso_dates(window_start, window_end))
    observed = {
        day
        for observation in observations
        for day in observation["observed_dates"]
        if window_start.isoformat() <= day <= window_end.isoformat()
    }
    missing = sorted(expected - observed)
    distinct_as_of = len(
        {
            observation["as_of"]
            for observation in observations
            if observation["end"] >= window_start.isoformat()
        }
    )
    reason_codes: list[str] = []
    if missing:
        reason_codes.append("provider_coverage_gap")
    if distinct_as_of < MINIMUM_DISTINCT_AS_OF:
        reason_codes.append("insufficient_distinct_runs")
    if (now.date() - window_end).days > MAX_AS_OF_LAG_DAYS:
        reason_codes.append("snapshot_stale")
    ready = not reason_codes
    return {
        "ready_for_product_decisions": ready,
        "status": "READY" if ready else ("STALE" if has_last_known_good else "UNKNOWN"),
        "access_mode": "READ_WRITE" if ready else ("READ_ONLY" if has_last_known_good else "NONE"),
        "reason_codes": reason_codes,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "observed_dates": sorted(observed),
        "missing_dates": missing,
        "distinct_as_of": distinct_as_of,
        "freshness_as_of": latest["as_of"],
    }


def merge_observation(
    state: dict[str, Any],
    observation: dict[str, Any],
    *,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    validate_history(state)
    current_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    # Validate the observation with the same schema rules used for stored entries.
    probe = seal_history({**empty_history(now=current_time), "observations": [observation]})
    validate_history(probe)

    observations = list(state["observations"])
    prior_latest = max((item["as_of"] for item in observations), default=None)
    repeated = any(item["observation_id"] == observation["observation_id"] for item in observations)
    out_of_order = bool(prior_latest and observation["as_of"] < prior_latest)
    was_empty = not observations
    event = "SNAPSHOT_REPEATED" if repeated else ("OUT_OF_ORDER_MERGED" if out_of_order else "OBSERVATION_MERGED")
    event_reasons: list[str] = []
    if was_empty:
        event_reasons.append("history_store_empty")
    if repeated:
        event_reasons.append("snapshot_repeated")
    if out_of_order:
        event_reasons.append("out_of_order_snapshot")
    if not repeated:
        observations.append(observation)
        observations.sort(key=lambda item: (item["as_of"], item["observed_at"], item["observation_id"]))
        observations = observations[-MAX_OBSERVATIONS:]

    next_state = {
        **state,
        "parent_state_sha256": state["state_sha256"],
        "observations": observations,
        "updated_at": current_time.isoformat(),
    }
    readiness = _evaluate_readiness(
        observations,
        now=current_time,
        has_last_known_good=bool(state.get("last_known_good")),
    )
    next_state["readiness"] = readiness
    if readiness["ready_for_product_decisions"] and not repeated and not out_of_order:
        next_state["last_known_good"] = {
            "observation_id": observation["observation_id"],
            "snapshot_sha256": observation["snapshot_sha256"],
            "as_of": observation["as_of"],
            "observed_at": observation["observed_at"],
        }
    next_state["last_attempt"] = {
        "attempted_at": current_time.isoformat(),
        "run_id": observation["run_id"],
        "outcome": event,
        "as_of": observation["as_of"],
        "snapshot_sha256": observation["snapshot_sha256"],
        "reason_codes": event_reasons + readiness["reason_codes"],
    }
    next_state = seal_history(next_state)
    validate_history(next_state)
    return next_state, {
        "event": event,
        "promote_insights": bool(
            readiness["ready_for_product_decisions"] and not repeated and not out_of_order
        ),
        "reason_codes": next_state["last_attempt"]["reason_codes"],
        "readiness": readiness,
    }


def record_failed_attempt(
    state: dict[str, Any],
    reason_code: str,
    *,
    run_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    validate_history(state)
    current_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    has_lkg = bool(state.get("last_known_good"))
    reasons = [reason_code]
    if has_lkg:
        reasons.append("last_known_good_available")
    next_state = {
        **state,
        "parent_state_sha256": state["state_sha256"],
        "updated_at": current_time.isoformat(),
        "last_attempt": {
            "attempted_at": current_time.isoformat(),
            "run_id": str(run_id or "local"),
            "outcome": "RUN_FAILED",
            "as_of": None,
            "snapshot_sha256": None,
            "reason_codes": reasons,
        },
        "readiness": {
            **state["readiness"],
            "ready_for_product_decisions": False,
            "status": "STALE" if has_lkg else "UNKNOWN",
            "access_mode": "READ_ONLY" if has_lkg else "NONE",
            "reason_codes": reasons,
        },
    }
    return seal_history(next_state)


def _cli_merge(args: argparse.Namespace) -> int:
    now = _parse_datetime(args.now) if args.now else datetime.now(timezone.utc)
    state_path = Path(args.state)
    state = read_history(state_path, now=now)
    raw = json.loads(Path(args.observation).read_text(encoding="utf-8"))
    observation = build_observation(
        as_of=_parse_date(raw["as_of"]),
        start=_parse_date(raw["start"]),
        end=_parse_date(raw["end"]),
        snapshot_sha256=str(raw["snapshot_sha256"]),
        observed_at=_parse_datetime(raw["observed_at"]),
        run_id=str(raw["run_id"]),
        reprocess_days=int(raw.get("reprocess_days", 3)),
        observed_dates=raw.get("observed_dates"),
    )
    state, result = merge_observation(state, observation, now=now)
    write_history(state_path, state)
    print(json.dumps({"ok": True, "state_sha256": state["state_sha256"], **result}))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    merge = sub.add_parser("merge")
    merge.add_argument("--state", required=True)
    merge.add_argument("--observation", required=True)
    merge.add_argument("--now")
    args = parser.parse_args(argv)
    if args.command == "merge":
        return _cli_merge(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
