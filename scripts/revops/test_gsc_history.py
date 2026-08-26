#!/usr/bin/env python3
"""Adversarial tests for durable GSC history/readiness v2."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.revops.gsc_history import (  # noqa: E402
    HistoryStateError,
    build_observation,
    empty_history,
    merge_observation,
    read_history,
    record_failed_attempt,
    seal_history,
    validate_history,
)


def _digest(label: str) -> str:
    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def _raw_observation(as_of: date, run: int) -> dict[str, object]:
    return {
        "as_of": as_of.isoformat(),
        "start": (as_of - timedelta(days=27)).isoformat(),
        "end": as_of.isoformat(),
        "snapshot_sha256": _digest(f"snapshot-{run}"),
        "observed_at": datetime(2026, 8, 5 + run, 12, tzinfo=timezone.utc).isoformat(),
        "run_id": f"run-{run}",
        "reprocess_days": 3,
    }


def _run_clean_checkout(
    root: Path,
    durable: Path,
    raw: dict[str, object],
    number: int,
) -> dict[str, object]:
    checkout = root / f"clean-checkout-{number}"
    checkout.mkdir()
    state_path = checkout / "history.json"
    if durable.is_file():
        shutil.copy2(durable, state_path)
    observation_path = checkout / "observation.json"
    observation_path.write_text(json.dumps(raw), encoding="utf-8")
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.revops.gsc_history",
            "merge",
            "--state",
            str(state_path),
            "--observation",
            str(observation_path),
            "--now",
            str(raw["observed_at"]),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    shutil.copy2(state_path, durable)
    result = json.loads(completed.stdout)
    result["state"] = read_history(durable)
    return result


def _merge_sequence(
    as_ofs: list[date],
    *,
    now: datetime,
    missing_date: str | None = None,
) -> dict[str, object]:
    state = empty_history(now=now)
    for number, as_of in enumerate(as_ofs, 1):
        start = as_of - timedelta(days=27)
        observed = []
        current = start
        while current <= as_of:
            if current.isoformat() != missing_date:
                observed.append(current.isoformat())
            current += timedelta(days=1)
        observation = build_observation(
            as_of=as_of,
            start=start,
            end=as_of,
            snapshot_sha256=_digest(f"sequence-{number}"),
            observed_at=now,
            run_id=f"sequence-{number}",
            reprocess_days=3,
            observed_dates=observed,
        )
        state, _ = merge_observation(state, observation, now=now)
    return state


def main() -> int:
    failures: list[str] = []

    def check(name: str, condition: bool, detail: object = "") -> None:
        print("PASS" if condition else "FAIL", name, detail)
        if not condition:
            failures.append(name)

    with tempfile.TemporaryDirectory() as temporary:
        temp = Path(temporary)
        durable = temp / "private-store" / "history.json"
        durable.parent.mkdir()
        as_ofs = [date(2026, 8, 3), date(2026, 8, 4), date(2026, 8, 5)]
        results = [
            _run_clean_checkout(temp, durable, _raw_observation(as_of, number), number)
            for number, as_of in enumerate(as_ofs, 1)
        ]
        states = [result["state"] for result in results]
        check("run_1_fails_closed", states[0]["readiness"]["ready_for_product_decisions"] is False)
        check("run_2_fails_closed", states[1]["readiness"]["ready_for_product_decisions"] is False)
        check("three_runs_compose", len(states[2]["observations"]) == 3)
        check("run_3_ready", states[2]["readiness"]["ready_for_product_decisions"] is True)
        check("window_has_no_gaps", states[2]["readiness"]["missing_dates"] == [])
        check(
            "three_day_reprocessing_recorded",
            all(len(observation["reprocessed_dates"]) == 3 for observation in states[2]["observations"]),
        )
        check("last_known_good_promoted", states[2]["last_known_good"]["as_of"] == "2026-08-05")

        # The state written by Python must validate with the exact production JS contract.
        cross = subprocess.run(
            [
                "node",
                "-e",
                (
                    "const fs=require('fs');"
                    "const v=require('./netlify/functions/lib/gsc-history.cjs').validateHistoryState;"
                    "const r=v(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));"
                    "if(!r.ok){console.error(r.error);process.exit(1)}"
                ),
                str(durable),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        check("python_state_validates_in_consumer", cross.returncode == 0, cross.stderr)

        lkg_before = dict(states[2]["last_known_good"])
        duplicate = _run_clean_checkout(temp, durable, _raw_observation(as_ofs[2], 3), 4)
        duplicate_state = duplicate["state"]
        check("repeat_is_idempotent", len(duplicate_state["observations"]) == 3)
        check("repeat_reason_code", duplicate["event"] == "SNAPSHOT_REPEATED")
        check("repeat_does_not_renew_lkg", duplicate_state["last_known_good"] == lkg_before)

        older_raw = _raw_observation(date(2026, 8, 4), 9)
        out_of_order = _run_clean_checkout(temp, durable, older_raw, 5)
        out_state = out_of_order["state"]
        check("out_of_order_recorded", out_of_order["event"] == "OUT_OF_ORDER_MERGED")
        check("out_of_order_does_not_replace_lkg", out_state["last_known_good"] == lkg_before)

        failed = record_failed_attempt(
            out_state,
            "missing_credentials",
            run_id="failure-credentials",
            now=datetime(2026, 8, 10, tzinfo=timezone.utc),
        )
        check("missing_credentials_fails_closed", failed["readiness"]["ready_for_product_decisions"] is False)
        check("last_known_good_is_read_only", failed["readiness"]["access_mode"] == "READ_ONLY")
        check("last_known_good_preserved", failed["last_known_good"] == lkg_before)
        dependency = record_failed_attempt(
            states[2],
            "dependency_unavailable",
            run_id="failure-dependency",
            now=datetime(2026, 8, 10, tzinfo=timezone.utc),
        )
        check("dependency_unavailable_reason", "dependency_unavailable" in dependency["readiness"]["reason_codes"])

        empty = empty_history(now=datetime(2026, 8, 1, tzinfo=timezone.utc))
        check("empty_store_unknown", empty["readiness"]["status"] == "UNKNOWN")
        corrupt = dict(states[2])
        corrupt["updated_at"] = "tampered"
        try:
            validate_history(corrupt)
            check("corrupt_store_rejected", False)
        except HistoryStateError as error:
            check("corrupt_store_rejected", error.code == "gsc_history_hash_mismatch", error.code)
        unsupported = seal_history({**states[2], "contract_version": "gsc-readiness/v999"})
        try:
            validate_history(unsupported)
            check("unsupported_contract_rejected", False)
        except HistoryStateError as error:
            check("unsupported_contract_rejected", error.code == "gsc_history_contract_unsupported", error.code)

        gap_state = _merge_sequence(
            as_ofs,
            now=datetime(2026, 8, 6, tzinfo=timezone.utc),
            missing_date="2026-08-01",
        )
        check("material_gap_fails_closed", gap_state["readiness"]["ready_for_product_decisions"] is False)
        check("gap_is_date_based", gap_state["readiness"]["missing_dates"] == ["2026-08-01"])
        stale_state = _merge_sequence(
            [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)],
            now=datetime(2026, 8, 6, tzinfo=timezone.utc),
        )
        check("stale_fails_closed", "snapshot_stale" in stale_state["readiness"]["reason_codes"])
        check("absence_never_zero", all(day for day in gap_state["readiness"]["missing_dates"]))

        serialized = json.dumps(states[2], ensure_ascii=False).lower()
        check("history_has_no_raw_query", '"query"' not in serialized and '"queries"' not in serialized)
        check("history_has_no_pii", "@" not in serialized and "whatsapp" not in serialized)

    if failures:
        print(f"{len(failures)} GSC history failure(s): {', '.join(failures)}")
        return 1
    print("GSC_HISTORY_TEST_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
