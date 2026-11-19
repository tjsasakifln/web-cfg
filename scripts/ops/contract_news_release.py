"""Read-only barrier between Netcup release acceptance and news publication."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

REPOSITORY = "tjsasakifln/web-cfg"
WORKFLOW = ".github/workflows/netcup-release.yml"
PROMOTE_JOB = "Authorized atomic promote"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
ACTIVE_STATUSES = {"queued", "in_progress", "waiting", "pending", "requested"}
CONCLUSIONS = {"success", "failure", "neutral", "cancelled", "skipped", "timed_out",
               "action_required", "stale", "startup_failure"}


class ReleaseGateError(ValueError):
    pass


def positive_integer(value: object) -> bool:
    return type(value) is int and value > 0


def api_collection(endpoint: str, field: str) -> list[dict]:
    """Parse all gh pagination pages; never relay stderr or API response text."""
    try:
        result = subprocess.run(
            ["gh", "api", "--hostname", "github.com", "--method", "GET", "--paginate", endpoint],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, UnicodeError, subprocess.TimeoutExpired):
        raise ReleaseGateError("release_api_unavailable") from None
    if result.returncode:
        raise ReleaseGateError("release_api_unavailable")
    if not result.stdout or len(result.stdout.encode()) > MAX_RESPONSE_BYTES:
        raise ReleaseGateError("release_api_invalid_response")
    decoder, offset, total, rows = json.JSONDecoder(), 0, None, []
    raw = result.stdout
    try:
        while raw[offset:].strip():
            offset += len(raw[offset:]) - len(raw[offset:].lstrip())
            page, offset = decoder.raw_decode(raw, offset)
            if (not isinstance(page, dict) or type(page.get("total_count")) is not int
                    or not 0 <= page["total_count"] <= 10_000
                    or not isinstance(page.get(field), list)
                    or (total is not None and page["total_count"] != total)):
                raise ValueError
            total = page["total_count"]
            rows.extend(page[field])
        if (total is None or len(rows) != total
                or any(not isinstance(row, dict) or not positive_integer(row.get("id")) for row in rows)
                or len({row["id"] for row in rows}) != len(rows)):
            raise ValueError
    except (ValueError, TypeError, RecursionError):
        raise ReleaseGateError("release_api_invalid_response") from None
    return rows


def latest_release(runs: list[dict], sha: str) -> tuple[dict | None, str]:
    for run in runs:
        if (run.get("name") != "netcup-release" or run.get("path") != WORKFLOW
                or run.get("head_sha") != sha or run.get("head_branch") != "main"
                or not isinstance(run.get("repository"), dict)
                or run["repository"].get("full_name") != REPOSITORY
                or not isinstance(run.get("head_repository"), dict)
                or run["head_repository"].get("full_name") != REPOSITORY
                or run.get("event") not in ("push", "workflow_dispatch")):
            raise ReleaseGateError("release_identity_mismatch")
        if (not positive_integer(run.get("run_number")) or not positive_integer(run.get("run_attempt"))
                or not isinstance(run.get("status"), str)
                or run.get("status") not in ACTIVE_STATUSES | {"completed"}
                or (run.get("status") == "completed" and (not isinstance(run.get("conclusion"), str)
                                                        or run.get("conclusion") not in CONCLUSIONS))
                or (run.get("status") != "completed" and run.get("conclusion") is not None)):
            raise ReleaseGateError("release_api_invalid_response")
    if not runs:
        return None, "waiting_for_release_run"
    # Re-running an older run preserves its ID and creation order. Any active
    # attempt for this exact release blocks publication, including older runs.
    if any(run["status"] != "completed" for run in runs):
        return None, "waiting_for_release_completion"
    latest = max(runs, key=lambda run: (run["run_number"], run["id"]))
    if latest["conclusion"] != "success":
        return None, "release_not_successful"
    return latest, "release_accepted"


def check_release(sha: str, repository: str, ref: str) -> dict:
    if repository != REPOSITORY or ref != "refs/heads/main" or not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ReleaseGateError("invalid_release_context")
    endpoint = (f"repos/{REPOSITORY}/actions/workflows/netcup-release.yml/runs"
                f"?branch=main&head_sha={sha}&per_page=100")
    selected, status = latest_release(api_collection(endpoint, "workflow_runs"), sha)
    if selected is None:
        return {"ready": False, "status": status}
    run_id, attempt = selected["id"], selected["run_attempt"]
    jobs = api_collection(
        f"repos/{REPOSITORY}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100", "jobs")
    promotion = [job for job in jobs if job.get("name") == PROMOTE_JOB]
    if len(promotion) > 1:
        raise ReleaseGateError("release_api_invalid_response")
    if not promotion:
        return {"ready": False, "status": "release_promotion_not_successful"}
    job = promotion[0]
    if (not positive_integer(job.get("run_id")) or not positive_integer(job.get("run_attempt"))
            or job.get("run_id") != run_id or job.get("run_attempt") != attempt
            or job.get("head_sha") != sha or job.get("head_branch") != "main"):
        raise ReleaseGateError("release_job_identity_mismatch")
    if job.get("status") != "completed" or job.get("conclusion") != "success":
        return {"ready": False, "status": "release_promotion_not_successful"}
    # A new run or attempt may have started while jobs were being read. This
    # barrier never treats an earlier promotion as proof for that new attempt.
    current, status = latest_release(api_collection(endpoint, "workflow_runs"), sha)
    if current is None:
        return {"ready": False, "status": status}
    if (current["id"], current["run_attempt"]) != (run_id, attempt):
        return {"ready": False, "status": "release_changed_during_check"}
    return {"ready": True, "status": "release_accepted", "run_id": run_id, "run_attempt": attempt}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--ref", required=True)
    args = parser.parse_args(argv)
    exit_code = 0
    try:
        result = check_release(args.release_sha, args.repository, args.ref)
    except ReleaseGateError as exc:
        result = {"ready": False, "status": str(exc)}
        exit_code = 1
    print(json.dumps(result, sort_keys=True))
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as handle:
            print("ready=" + str(result["ready"]).lower(), file=handle)
            print("status=" + result["status"], file=handle)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
