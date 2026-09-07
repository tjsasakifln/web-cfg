#!/usr/bin/env python3
"""The aggregator must refuse everything that is not a complete green run.

Splitting site-ci into isolated jobs moves the "everything ran" guarantee out of
the runner and into this contract, so the contract is tested directly: the
approval path and every refusal path the split introduces.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from verify_site_ci_aggregate import evaluate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SUITES_FILE = ROOT / "data" / "quality" / "site-ci-suites.json"
SUITES = json.loads(SUITES_FILE.read_text(encoding="utf-8"))["suites"]

ALL_GREEN = {"build": {"result": "success"}, "browser": {"result": "success"},
             "scorecard": {"result": "success"}}


def _markers(tmp: Path, results: dict[str, str], attempt: int = 1) -> Path:
    out = tmp / "markers"
    out.mkdir(parents=True, exist_ok=True)
    for suite, result in results.items():
        (out / f"{suite}-{attempt}.json").write_text(
            json.dumps({"suite": suite, "result": result, "attempt": attempt}), encoding="utf-8")
    return out


def _full(result: str = "success") -> dict[str, str]:
    return {suite: result for suite in SUITES}


def test_complete_green_run_is_approved():
    with tempfile.TemporaryDirectory() as tmp:
        ok, problems = evaluate(ALL_GREEN, _markers(Path(tmp), _full()), SUITES_FILE)
        assert ok, problems


def test_one_failing_suite_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        markers = _full()
        markers[SUITES[3]] = "failure"
        ok, problems = evaluate({**ALL_GREEN, "browser": {"result": "failure"}},
                                _markers(Path(tmp), markers), SUITES_FILE)
        assert not ok
        assert any(SUITES[3] in p for p in problems), problems


def test_cancelled_job_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        ok, problems = evaluate({**ALL_GREEN, "browser": {"result": "cancelled"}},
                                _markers(Path(tmp), _full()), SUITES_FILE)
        assert not ok
        assert any("cancelled" in p for p in problems), problems


def test_skipped_job_blocks():
    """A skipped required job is the failure mode an `if:` typo produces."""
    with tempfile.TemporaryDirectory() as tmp:
        ok, problems = evaluate({**ALL_GREEN, "scorecard": {"result": "skipped"}},
                                _markers(Path(tmp), _full()), SUITES_FILE)
        assert not ok
        assert any("skipped" in p for p in problems), problems


def test_suite_removed_from_the_matrix_blocks():
    """Every job green, but one suite silently never ran."""
    with tempfile.TemporaryDirectory() as tmp:
        markers = _full()
        dropped = markers.pop(SUITES[-1])
        assert dropped == "success"
        ok, problems = evaluate(ALL_GREEN, _markers(Path(tmp), markers), SUITES_FILE)
        assert not ok
        assert any(SUITES[-1] in p and "did not run" in p for p in problems), problems


def test_missing_marker_directory_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        ok, problems = evaluate(ALL_GREEN, Path(tmp) / "absent", SUITES_FILE)
        assert not ok
        assert len(problems) >= len(SUITES), problems


def test_unreadable_marker_is_not_evidence_of_success():
    with tempfile.TemporaryDirectory() as tmp:
        markers = _markers(Path(tmp), _full())
        # Corrupt the suite's only marker: an unreadable file must leave the
        # suite with no evidence at all, not fall back to some other marker.
        (markers / f"{SUITES[0]}-1.json").write_text("{ not json", encoding="utf-8")
        ok, problems = evaluate(ALL_GREEN, markers, SUITES_FILE)
        assert not ok
        assert any(SUITES[0] in p for p in problems), problems


def test_conflicting_markers_cannot_be_resolved_towards_success():
    """A retry that leaves both a failure and a success marker must not pass."""
    with tempfile.TemporaryDirectory() as tmp:
        markers = _markers(Path(tmp), _full())
        (markers / f"{SUITES[1]}-retry.json").write_text(
            json.dumps({"suite": SUITES[1], "result": "failure", "attempt": 1}), encoding="utf-8")
        ok, problems = evaluate(ALL_GREEN, markers, SUITES_FILE)
        assert not ok
        assert any(SUITES[1] in p for p in problems), problems


def test_undeclared_suite_blocks():
    with tempfile.TemporaryDirectory() as tmp:
        markers = _full()
        markers["smuggled-suite"] = "success"
        ok, problems = evaluate(ALL_GREEN, _markers(Path(tmp), markers), SUITES_FILE)
        assert not ok
        assert any("smuggled-suite" in p for p in problems), problems


def test_a_later_attempt_supersedes_an_earlier_failure():
    """Re-running only the failed legs must be judged on the re-run, while the
    suites that already passed keep supplying coverage from attempt 1."""
    with tempfile.TemporaryDirectory() as tmp:
        markers = _markers(Path(tmp), _full(), attempt=1)
        failed = _full()
        failed[SUITES[2]] = "failure"
        (markers / f"{SUITES[2]}-1.json").write_text(
            json.dumps({"suite": SUITES[2], "result": "failure", "attempt": 1}), encoding="utf-8")
        (markers / f"{SUITES[2]}-2.json").write_text(
            json.dumps({"suite": SUITES[2], "result": "success", "attempt": 2}), encoding="utf-8")
        ok, problems = evaluate(ALL_GREEN, markers, SUITES_FILE)
        assert ok, problems


def test_an_earlier_success_cannot_paper_over_a_later_failure():
    with tempfile.TemporaryDirectory() as tmp:
        markers = _markers(Path(tmp), _full(), attempt=1)
        (markers / f"{SUITES[2]}-2.json").write_text(
            json.dumps({"suite": SUITES[2], "result": "failure", "attempt": 2}), encoding="utf-8")
        ok, problems = evaluate(ALL_GREEN, markers, SUITES_FILE)
        assert not ok
        assert any(SUITES[2] in p for p in problems), problems


def test_a_suite_name_that_is_shell_syntax_is_refused():
    """A quote here could close the aggregator's own --results argument."""
    import verify_site_ci_aggregate as mod
    with tempfile.TemporaryDirectory() as tmp:
        bad = Path(tmp) / "suites.json"
        bad.write_text(json.dumps({"suites": ["axe", "x' -h; exit 0 #"]}), encoding="utf-8")
        try:
            mod.declared_suites(bad)
        except SystemExit as exc:
            assert "safe identifier" in str(exc), exc
        else:
            raise AssertionError("a shell-syntax suite name was accepted")


def test_empty_results_block():
    with tempfile.TemporaryDirectory() as tmp:
        ok, problems = evaluate({}, _markers(Path(tmp), _full()), SUITES_FILE)
        assert not ok


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    raise SystemExit(1 if failed else 0)
