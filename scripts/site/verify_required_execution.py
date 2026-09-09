#!/usr/bin/env python3
"""Verify that named mandatory CI steps actually ran for one exact SHA.

The workflow's final evidence job calls the GitHub Actions API only after the
gate job completes.  A green aggregate status is insufficient: a required
step that is absent, skipped, neutral, cancelled, or belongs to another SHA
must fail this verifier.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.request import Request, urlopen


SUCCESS = "success"
UNACCEPTABLE = {"skipped", "neutral", "cancelled", "timed_out", "failure", "action_required"}
# These steps have one explicit, verifiable applicability condition: exporting
# the production artifact. Ordinary PR validation exercises the local build.
RELEASE_ONLY_STEPS = {
    "Pin release build clock to the commit",
    "Release artifact carries a usable anti-abuse widget",
    "Export exact gated public artifact",
}


def validate_run(payload: dict[str, Any], *, expected_sha: str, required_job: str, required_steps: list[str], release_artifact: bool = False) -> list[str]:
    """Return every execution-evidence defect for one API payload."""
    errors: list[str] = []
    run = payload.get("run") or {}
    observed_sha = str(run.get("head_sha") or "")
    if observed_sha != expected_sha:
        errors.append(f"run SHA is {observed_sha or '<missing>'}, expected {expected_sha}")

    if not required_steps:
        errors.append("mandatory step selection is empty")
    jobs = payload.get("jobs") or []
    # Reusable workflows prefix nested job names, e.g.
    # "exact SHA through site-ci / site-validation".  The final segment is
    # still the stable job identity; do not accept an arbitrary substring.
    job = next(
        (
            item
            for item in jobs
            if item.get("name") == required_job
            or str(item.get("name") or "").endswith(" / " + required_job)
        ),
        None,
    )
    if not job:
        return errors + [f"required job missing: {required_job}"]
    if job.get("conclusion") != SUCCESS:
        errors.append(f"required job {required_job!r} conclusion is {job.get('conclusion')!r}")

    by_name = {str(step.get("name")): step for step in (job.get("steps") or [])}
    for name, step in by_name.items():
        conclusion = step.get("conclusion")
        if conclusion == "skipped" and name in RELEASE_ONLY_STEPS and not release_artifact:
            continue
        if conclusion != SUCCESS:
            errors.append(f"validation step {name!r} did not execute successfully: {conclusion!r}")
    if release_artifact:
        for name in RELEASE_ONLY_STEPS:
            if name not in by_name:
                errors.append(f"release step missing: {name}")
    for name in required_steps:
        step = by_name.get(name)
        if not step:
            errors.append(f"required step missing: {name}")
            continue
        conclusion = str(step.get("conclusion") or "")
        if conclusion != SUCCESS:
            qualifier = "unacceptable" if conclusion in UNACCEPTABLE else "not successful"
            errors.append(f"required step {name!r} {qualifier}: {conclusion or '<missing>'}")
    return errors


def _api_json(url: str, token: str) -> dict[str, Any]:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}"})
    with urlopen(request, timeout=30) as response:  # nosec B310 -- GitHub API URL is constructed below
        return json.loads(response.read().decode("utf-8"))


def live_payload(*, repo: str, run_id: str, token: str) -> dict[str, Any]:
    api = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}"
    run = _api_json(api, token)
    jobs: list[dict[str, Any]] = []
    page = 1
    while True:
        result = _api_json(f"{api}/jobs?per_page=100&page={page}", token)
        jobs.extend(result.get("jobs") or [])
        if len(jobs) >= int(result.get("total_count") or 0) or not (result.get("jobs") or []):
            break
        page += 1
    return {"run": run, "jobs": jobs}


def self_test() -> int:
    good = {"run": {"head_sha": "a" * 40}, "jobs": [{"name": "site-ci", "conclusion": "success", "steps": [{"name": "Build public site", "conclusion": "success"}]}]}
    assert not validate_run(good, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    skipped = json.loads(json.dumps(good))
    skipped["jobs"][0]["steps"][0]["conclusion"] = "skipped"
    assert validate_run(skipped, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    neutral = json.loads(json.dumps(good))
    neutral["jobs"][0]["steps"][0]["conclusion"] = "neutral"
    assert validate_run(neutral, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    missing = json.loads(json.dumps(good))
    missing["jobs"][0]["steps"] = []
    assert validate_run(missing, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    pr = json.loads(json.dumps(good))
    # PR runs identify the source branch tip in head_sha, while checkout uses
    # the synthetic merge candidate separately in the workflow.
    pr["run"]["head_sha"] = "b" * 40
    assert not validate_run(pr, expected_sha="b" * 40, required_job="site-ci", required_steps=["Build public site"])
    assert validate_run(pr, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    prefixed = json.loads(json.dumps(good))
    prefixed["jobs"][0]["name"] = "exact SHA through site-ci / site-ci"
    assert not validate_run(prefixed, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    assert validate_run(good, expected_sha="a" * 40, required_job="site-ci", required_steps=[])
    optional = json.loads(json.dumps(good))
    optional["jobs"][0]["steps"].append({"name": "Pin release build clock to the commit", "conclusion": "skipped"})
    assert not validate_run(optional, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    assert validate_run(optional, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"], release_artifact=True)
    unlisted = json.loads(json.dumps(good))
    unlisted["jobs"][0]["steps"].append({"name": "Additional mandatory check", "conclusion": "skipped"})
    assert validate_run(unlisted, expected_sha="a" * 40, required_job="site-ci", required_steps=["Build public site"])
    print("REQUIRED_EXECUTION_SELF_TEST_OK fixtures=push,pr,reusable negative_seed=skipped,neutral,missing,empty-selection")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo")
    parser.add_argument("--run-id")
    parser.add_argument("--sha")
    parser.add_argument("--required-job", default="site-ci")
    parser.add_argument("--required-step", action="append", default=[])
    parser.add_argument("--fixture")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.fixture:
        payload = json.loads(open(args.fixture, encoding="utf-8").read())
    else:
        if not (args.repo and args.run_id and args.sha):
            parser.error("--repo, --run-id and --sha are required without --fixture")
        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if not token:
            parser.error("GITHUB_TOKEN is required for live verification")
        payload = live_payload(repo=args.repo, run_id=args.run_id, token=token)
    errors = validate_run(payload, expected_sha=args.sha or "", required_job=args.required_job, required_steps=args.required_step, release_artifact=os.environ.get("RELEASE_ARTIFACT_REQUIRED") == "1")
    if errors:
        print("REQUIRED_EXECUTION_FAIL\n- " + "\n- ".join(errors), file=sys.stderr)
        return 1
    print(f"REQUIRED_EXECUTION_OK sha={args.sha} job={args.required_job} steps={len(args.required_step)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
