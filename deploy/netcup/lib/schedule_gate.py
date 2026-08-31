#!/usr/bin/env python3
"""Run a release-bound scheduled job only after exact, fail-closed authorization."""

from __future__ import annotations

import fcntl
import grp
import json
import os
import re
import stat
import subprocess
from pathlib import Path

try:
    from .release_control import (
        ReleaseError,
        deploy_lock,
        read_release_link,
        release_root,
    )
    from .runtime_launcher import runtime_environment
except ImportError:  # Installed scripts share /opt/confenge-web/lib without a package.
    from release_control import (
        ReleaseError,
        deploy_lock,
        read_release_link,
        release_root,
    )
    from runtime_launcher import runtime_environment

JOB = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
GATE_NAME = "schedule-cutover.json"
RETENTION_JOB = "storage-retention"
RETENTION_LOCK = "storage-retention.lock"


def expected_gate_gid() -> int:
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        return os.getgid()
    try:
        return grp.getgrnam("confenge-web").gr_gid
    except KeyError as exc:
        raise ReleaseError("confenge-web schedule gate group is absent") from exc


def open_validated_gate(root: Path, job: str) -> tuple[dict[str, object], int]:
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
        if gate_stat.st_gid != expected_gate_gid():
            raise ReleaseError("schedule cutover gate must be confenge-web group-owned")
        payload = os.read(descriptor, 65537)
        if len(payload) > 65536:
            raise ReleaseError("schedule cutover gate is invalid")
        gate = json.loads(payload.decode("utf-8"))
        os.lseek(descriptor, 0, os.SEEK_SET)
    except ReleaseError:
        os.close(descriptor)
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        os.close(descriptor)
        raise ReleaseError("schedule cutover gate is invalid") from exc
    if not isinstance(gate, dict):
        os.close(descriptor)
        raise ReleaseError("schedule cutover gate is invalid")
    try:
        current = read_release_link(root, "current")
    except ReleaseError:
        os.close(descriptor)
        raise
    legacy = gate.get("legacy_executor") or {}
    jobs = gate.get("jobs") or {}
    if not isinstance(legacy, dict) or not isinstance(jobs, dict):
        os.close(descriptor)
        raise ReleaseError("schedule cutover gate is invalid")
    if (
        gate.get("schema") != "confenge.schedule-cutover/v1"
        or gate.get("authorized_release_sha") != current
        or jobs.get(job) is not True
    ):
        os.close(descriptor)
        raise ReleaseError("scheduled job authorization is not proven for this release/job")
    if job == "search-observation-tick" and (
        legacy.get("netlify_search_observation_disabled") is not True
        or not isinstance(legacy.get("disabled_at"), str)
        or not isinstance(legacy.get("evidence"), str)
        or len(legacy.get("evidence")) < 8
    ):
        os.close(descriptor)
        raise ReleaseError("legacy executor disablement is not proven for this release/job")
    return gate, descriptor


def validate_gate(root: Path, job: str) -> dict[str, object]:
    gate, descriptor = open_validated_gate(root, job)
    os.close(descriptor)
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


def run_retention(
    root: Path,
    release: Path,
    env: dict[str, str],
    gate_descriptor: int,
    lock_descriptor: int,
    deploy_descriptor: int,
) -> int:
    storage = env.get("CONFENGE_STORAGE_DIR") or ""
    if storage != "/var/lib/confenge-web":
        raise ReleaseError("storage retention path must match /var/lib/confenge-web")
    script = release / "scripts" / "storage" / "retention.mjs"
    if not script.is_file() or script.is_symlink():
        raise ReleaseError("packaged storage retention script is missing")
    result = subprocess.run(
        [
            "node",
            str(script),
            "--store",
            storage,
            "--apply",
            "--authority-fd",
            str(gate_descriptor),
            "--lock-fd",
            str(lock_descriptor),
            "--deploy-lock-fd",
            str(deploy_descriptor),
            "--release-root",
            str(root),
            "--release-sha",
            release.name,
        ],
        cwd=release,
        env=env,
        check=False,
        pass_fds=(gate_descriptor, lock_descriptor, deploy_descriptor),
    )
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else os.sys.argv[1:])
    job = args[0] if len(args) == 1 else ""
    try:
        root = release_root()
        if job == RETENTION_JOB:
            with deploy_lock(root) as deploy_descriptor:
                lock_descriptor = acquire_job_lock(root, RETENTION_JOB)
                gate_descriptor = -1
                try:
                    gate, gate_descriptor = open_validated_gate(root, job)
                    release, env = runtime_environment(root)
                    if release.name != gate.get("authorized_release_sha"):
                        raise ReleaseError("scheduled job release changed after authorization")
                    os.chdir(release)
                    return run_retention(
                        root,
                        release,
                        env,
                        gate_descriptor,
                        lock_descriptor,
                        deploy_descriptor,
                    )
                finally:
                    if gate_descriptor >= 0:
                        os.close(gate_descriptor)
                    fcntl.flock(lock_descriptor, fcntl.LOCK_UN)
                    os.close(lock_descriptor)
        gate = validate_gate(root, job)
        release, env = runtime_environment(root)
        if release.name != gate.get("authorized_release_sha"):
            raise ReleaseError("scheduled job release changed after authorization")
        os.chdir(release)
        os.execvpe("node", ["node", "runtime/schedule.mjs", job], env)
    except (OSError, ReleaseError) as exc:
        print(f"NETCUP_SCHEDULE_BLOCKED: {exc}", file=os.sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
