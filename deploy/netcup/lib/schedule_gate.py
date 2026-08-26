#!/usr/bin/env python3
"""Fail closed unless the named legacy executor is evidenced as disabled."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

try:
    from .release_control import ReleaseError, read_release_link, release_root
    from .runtime_launcher import runtime_environment
except ImportError:  # Installed scripts share /opt/confenge-web/lib without a package.
    from release_control import ReleaseError, read_release_link, release_root
    from runtime_launcher import runtime_environment

JOB = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
GATE_NAME = "schedule-cutover.json"


def validate_gate(root: Path, job: str) -> dict[str, object]:
    if not JOB.fullmatch(job):
        raise ReleaseError("scheduled job name is invalid")
    gate_path = root / "shared" / GATE_NAME
    if not gate_path.is_file() or gate_path.is_symlink():
        raise ReleaseError("schedule cutover gate is absent")
    try:
        gate = json.loads(gate_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError("schedule cutover gate is invalid") from exc
    current = read_release_link(root, "current")
    legacy = gate.get("legacy_executor") or {}
    jobs = gate.get("jobs") or {}
    if (
        gate.get("schema") != "confenge.schedule-cutover/v1"
        or gate.get("authorized_release_sha") != current
        or legacy.get("netlify_search_observation_disabled") is not True
        or not isinstance(legacy.get("disabled_at"), str)
        or not isinstance(legacy.get("evidence"), str)
        or len(legacy.get("evidence")) < 8
        or jobs.get(job) is not True
    ):
        raise ReleaseError("legacy executor disablement is not proven for this release/job")
    return gate


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else os.sys.argv[1:])
    job = args[0] if len(args) == 1 else ""
    try:
        root = release_root()
        validate_gate(root, job)
        release, env = runtime_environment(root)
        os.chdir(release)
        os.execvpe("node", ["node", "runtime/schedule.mjs", job], env)
    except (OSError, ReleaseError) as exc:
        print(f"NETCUP_SCHEDULE_BLOCKED: {exc}", file=os.sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
