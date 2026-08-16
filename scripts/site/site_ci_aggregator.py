#!/usr/bin/env python3
"""Fail-closed evaluator for the site-ci aggregator job.

Required children are read from the shipped workflow YAML (`gates.needs`).
Exit 0 only when every required child's GitHub `needs.*.result` is `success`.
failure, cancelled, skipped, or a missing child is red.

CI sets SITE_CI_NEEDS to ${{ toJSON(needs) }}. Local/tests may pass the same
JSON via that env var or as the first CLI argument.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
AGGREGATOR_JOB_ID = "gates"


def _job_block(text: str, job_id: str) -> str:
    m = re.search(rf"(?m)^  {re.escape(job_id)}:\n", text)
    if not m:
        raise ValueError(f"job id {job_id!r} not found in site-ci workflow")
    start = m.start()
    rest = text[start + 1 :]
    m2 = re.search(r"(?m)^  [A-Za-z0-9_-]+:\n", rest)
    end = start + 1 + (m2.start() if m2 else len(rest))
    return text[start:end]


def required_children_from_workflow(text: str | None = None) -> list[str]:
    """Return aggregator `needs` job ids from the shipped site-ci.yml."""
    if text is None:
        if not SITE_CI.is_file():
            raise FileNotFoundError(f"missing workflow: {SITE_CI}")
        text = SITE_CI.read_text(encoding="utf-8")
    job = _job_block(text, AGGREGATOR_JOB_ID)
    bracket = re.search(r"(?m)^\s+needs:\s*\[([^\]]+)\]", job)
    if bracket:
        return [p.strip() for p in bracket.group(1).split(",") if p.strip()]
    lines = []
    in_needs = False
    for line in job.splitlines():
        if re.match(r"^\s+needs:\s*$", line):
            in_needs = True
            continue
        if in_needs:
            item = re.match(r"^\s+-\s+([A-Za-z0-9_-]+)\s*$", line)
            if item:
                lines.append(item.group(1))
                continue
            break
    if not lines:
        raise ValueError("aggregator job has no parseable needs list")
    return lines


def evaluate_needs(needs: dict, required: list[str]) -> tuple[bool, list[str]]:
    """Return (ok, bad_labels). ok only if every required result is success."""
    if not isinstance(needs, dict):
        return False, ["needs=not-an-object"]
    bad: list[str] = []
    for name in required:
        entry = needs.get(name)
        if not isinstance(entry, dict):
            bad.append(f"{name}=missing")
            continue
        result = entry.get("result")
        if result != "success":
            bad.append(f"{name}={result if result is not None else 'missing'}")
    return (not bad, bad)


def evaluate_env(raw: str, text: str | None = None) -> tuple[bool, list[str]]:
    required = required_children_from_workflow(text)
    try:
        needs = json.loads(raw)
    except json.JSONDecodeError as exc:
        return False, [f"needs=invalid-json:{exc}"]
    return evaluate_needs(needs, required)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    raw = os.environ.get("SITE_CI_NEEDS")
    if raw is None and argv:
        raw = argv[0]
    if raw is None or raw == "":
        print("SITE_CI_AGGREGATOR_FAIL missing SITE_CI_NEEDS", file=sys.stderr)
        return 1
    try:
        ok, bad = evaluate_env(raw)
    except (OSError, ValueError) as exc:
        print(f"SITE_CI_AGGREGATOR_FAIL {exc}", file=sys.stderr)
        return 1
    if not ok:
        print("SITE_CI_AGGREGATOR_FAIL " + " ".join(bad))
        return 1
    print("SITE_CI_AGGREGATOR_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
