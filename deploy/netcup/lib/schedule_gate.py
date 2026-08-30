#!/usr/bin/env python3
"""Run a release-bound scheduled job only after exact, fail-closed authorization."""

from __future__ import annotations

import fcntl
import json
import os
import re
import stat
import subprocess
from pathlib import Path

try:
    from .release_control import ReleaseError, read_release_link, release_root
    from .runtime_launcher import runtime_environment
except ImportError:  # Installed scripts share /opt/confenge-web/lib without a package.
    from release_control import ReleaseError, read_release_link, release_root
    from runtime_launcher import runtime_environment

JOB = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
GATE_NAME = "schedule-cutover.json"
RETENTION_JOB = "storage-retention"
RETENTION_LOCK = "storage-retention.lock"


def validate_gate(root: Path, job: str) -> dict[str, object]:
    if not JOB.fullmatch(job):
        raise ReleaseError("scheduled job name is invalid")
    gate_path = root / "shared" / GATE_NAME
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(gate_path, flags)
    except OSError as exc:
        raise ReleaseError("schedule cutover gate is absent") from exc
    try:
        gate_stat = os.fstat(descriptor)
        if not stat.S_ISREG(gate_stat.st_mode):
            raise ReleaseError("schedule cutover gate must be a regular file")
        if stat.S_IMODE(gate_stat.st_mode) != 0o640:
            raise ReleaseError("schedule cutover gate permissions must be 0640")
        if os.environ.get("CONFENGE_RELEASE_TEST_MODE") != "1" and gate_stat.st_uid != 0:
            raise ReleaseError("schedule cutover gate must be root-owned")
        with os.fdopen(descriptor, encoding="utf-8") as handle:
            descriptor = -1
            gate = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError("schedule cutover gate is invalid") from exc
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    current = read_release_link(root, "current")
    legacy = gate.get("legacy_executor") or {}
    jobs = gate.get("jobs") or {}
    if (
        gate.get("schema") != "confenge.schedule-cutover/v1"
        or gate.get("authorized_release_sha") != current
        or jobs.get(job) is not True
    ):
        raise ReleaseError("scheduled job authorization is not proven for this release/job")
    if job == "search-observation-tick" and (
        legacy.get("netlify_search_observation_disabled") is not True
        or not isinstance(legacy.get("disabled_at"), str)
        or not isinstance(legacy.get("evidence"), str)
        or len(legacy.get("evidence")) < 8
    ):
        raise ReleaseError("legacy executor disablement is not proven for this release/job")
    return gate


def acquire_job_lock(root: Path, job: str) -> int:
    """Acquire the persistent job lock without waiting.

    The descriptor remains held by this process while the retention subprocess
    runs. A timer, generic systemd instance, or manual invocation therefore
    shares one serialization boundary.
    """

    if job != RETENTION_JOB:
        raise ReleaseError("scheduled job has no lock contract")
    shared = root / "shared"
    if not shared.is_dir() or shared.is_symlink():
        raise ReleaseError("schedule shared directory is invalid")
    flags = os.O_RDWR | os.O_CREAT
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(shared / RETENTION_LOCK, flags, 0o640)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise OSError("scheduled job lock is not a regular file")
        os.fchmod(descriptor, 0o640)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (BlockingIOError, OSError) as exc:
        os.close(descriptor)
        raise ReleaseError("scheduled job lock is already held or invalid") from exc
    return descriptor


def run_retention(root: Path, release: Path, env: dict[str, str]) -> int:
    storage = env.get("CONFENGE_STORAGE_DIR") or ""
    if storage != "/var/lib/confenge-web":
        raise ReleaseError("storage retention path must match /var/lib/confenge-web")
    script = release / "scripts" / "storage" / "retention.mjs"
    if not script.is_file() or script.is_symlink():
        raise ReleaseError("packaged storage retention script is missing")
    descriptor = acquire_job_lock(root, RETENTION_JOB)
    try:
        result = subprocess.run(
            ["node", str(script), "--store", storage, "--apply"],
            cwd=release,
            env=env,
            check=False,
        )
        return result.returncode
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else os.sys.argv[1:])
    job = args[0] if len(args) == 1 else ""
    try:
        root = release_root()
        validate_gate(root, job)
        release, env = runtime_environment(root)
        os.chdir(release)
        if job == RETENTION_JOB:
            return run_retention(root, release, env)
        os.execvpe("node", ["node", "runtime/schedule.mjs", job], env)
    except (OSError, ReleaseError) as exc:
        print(f"NETCUP_SCHEDULE_BLOCKED: {exc}", file=os.sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
