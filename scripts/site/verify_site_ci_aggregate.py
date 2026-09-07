#!/usr/bin/env python3
"""Decide whether the split site-ci may report success.

site-ci used to be one job: if it was green, everything had run. Splitting the
browser suites into isolated runners removes that guarantee, so the aggregator
has to reconstruct it. A required check that approves because nothing reported
a failure is worse than the serial job it replaced.

Approval requires BOTH:
  * every declared job result is exactly "success" -- failure, cancelled and
    skipped are all refusals, and an unknown/absent result is a refusal too; and
  * every suite in data/quality/site-ci-suites.json left a status marker saying
    it ran and passed. A suite deleted from the matrix, or one that never
    started, is missing coverage and cannot be waved through.

Usage:
  verify_site_ci_aggregate.py --results <json> --markers <dir> [--suites <json>]

--results is the GitHub `needs` context serialised as JSON.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SUITES = ROOT / "data" / "quality" / "site-ci-suites.json"


def declared_suites(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    suites = payload.get("suites")
    if not isinstance(suites, list) or not suites:
        raise SystemExit("site-ci suite manifest is empty or malformed")
    if len(set(suites)) != len(suites):
        raise SystemExit("site-ci suite manifest contains duplicates")
    # Suite names are interpolated into shell (the matrix dispatch) and into a
    # JSON payload. Anything outside this alphabet is a syntax vector, not a
    # suite name: a quote in here could close the aggregator's own argument and
    # turn the required check into a no-op.
    for suite in suites:
        if not isinstance(suite, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", suite):
            raise SystemExit(f"site-ci suite name is not a safe identifier: {suite!r}")
    return [str(s) for s in suites]


def observed_suites(markers: Path) -> dict[str, str]:
    """Read one marker per suite that actually executed."""
    best: dict[str, tuple[int, str]] = {}
    if not markers.is_dir():
        return {}
    for file in sorted(markers.rglob("*.json")):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            # An unreadable marker is not evidence that a suite passed.
            continue
        suite = data.get("suite")
        result = data.get("result")
        if not isinstance(suite, str) or not isinstance(result, str):
            continue
        try:
            attempt = int(data.get("attempt") or 0)
        except (TypeError, ValueError):
            attempt = 0
        prior = best.get(suite)
        if prior is None or attempt > prior[0]:
            # A later attempt supersedes an earlier one: that is what "re-run the
            # failed jobs" means, and suites that already passed keep coverage.
            best[suite] = (attempt, result)
        elif attempt == prior[0] and prior[1] == "success":
            # Within one attempt, disagreement never resolves towards success.
            best[suite] = (attempt, result)
    return {suite: result for suite, (_, result) in best.items()}


def evaluate(results: dict, markers: Path, suites_file: Path) -> tuple[bool, list[str]]:
    problems: list[str] = []
    suites = declared_suites(suites_file)

    for job, payload in sorted(results.items()):
        outcome = (payload or {}).get("result")
        if outcome != "success":
            problems.append(f"job {job}: result={outcome!r}, expected 'success'")
    if not results:
        problems.append("no job results were passed to the aggregator")

    seen = observed_suites(markers)
    for suite in suites:
        if suite not in seen:
            problems.append(f"suite {suite}: no status marker — it did not run, or its evidence is missing")
        elif seen[suite] != "success":
            problems.append(f"suite {suite}: result={seen[suite]!r}, expected 'success'")
    for extra in sorted(set(seen) - set(suites)):
        problems.append(f"suite {extra}: reported a status but is not declared in the manifest")

    return (not problems), problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", required=True, help="JSON of the needs context")
    parser.add_argument("--markers", required=True, help="directory of suite status markers")
    parser.add_argument("--suites", default=str(DEFAULT_SUITES))
    args = parser.parse_args(argv)

    try:
        results = json.loads(args.results)
    except ValueError as exc:
        print(f"SITE_CI_AGGREGATE_REFUSED unreadable results payload: {exc}", file=sys.stderr)
        return 1
    if not isinstance(results, dict):
        print("SITE_CI_AGGREGATE_REFUSED results payload is not an object", file=sys.stderr)
        return 1

    ok, problems = evaluate(results, Path(args.markers), Path(args.suites))
    if not ok:
        print("SITE_CI_AGGREGATE_REFUSED", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print(f"SITE_CI_AGGREGATE_OK jobs={len(results)} suites={len(declared_suites(Path(args.suites)))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
