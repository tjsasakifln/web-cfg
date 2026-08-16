#!/usr/bin/env python3
"""Assert minimal shape of merge-blocking CI workflows.

These checks ensure site-ci and pSEO quality gates cannot silently soften
into non-blocking installs or continue-on-error on central fail paths.
They also encode the stable job names that branch protection must require.

Deliberate failure mode (for local demo):
  WORKFLOW_GATE_FORCE_FAIL=1 python3 scripts/site/test_workflow_gates.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
PSEO = ROOT / ".github" / "workflows" / "pseo.yml"
CODEQL = ROOT / ".github" / "workflows" / "codeql.yml"
AGGREGATOR = ROOT / "scripts" / "site" / "site_ci_aggregator.py"

# Stable check contexts documented in docs/ops/REQUIRED-BRANCH-CHECKS.md
EXPECTED_SITE_CI_JOB_NAME = "site-ci"
EXPECTED_PSEO_JOB_NAME = "pSEO quality gates"
AGGREGATOR_JOB_ID = "gates"
CHILD_JOB_IDS = ("lint", "unit", "build", "security", "e2e", "performance")

# Every npm command that was a required gate on origin/main site-ci.yml.
# Classified so a red child check name identifies the subsystem.
REQUIRED_COMMAND_CLASS = {
    "npm run test:workflow-gates": "lint",
    "npm run test:inbound-gates": "lint",
    "npm run editorial:truth": "lint",
    "npm run test:brand": "lint",
    "npm run test:copy": "lint",
    "npm run test:design": "lint",
    "npm run test:env-example": "lint",
    "npm run editorial:test": "unit",
    "npm run editorial:build": "unit",
    "npm run pseo:test": "unit",
    "npm run test:analytics": "unit",
    "npm run test:form-funnel": "unit",
    "npm run test:lead-function": "unit",
    "npm run test:lead-store-production": "unit",
    "npm run test:ops-auth": "unit",
    "npm run test:epic-td": "unit",
    "npm run test:script-modules": "unit",
    "npm run test:cta-whatsapp": "unit",
    "npm run test:release-filters": "unit",
    "npm run test:pseo-attribution": "unit",
    "npm run test:revops": "unit",
    "npm run test:schedules": "unit",
    "npm run test:tools": "unit",
    "npm run test:nurture": "unit",
    "npm run build:site": "build",
    "npm run test:secrets-scan": "security",
    "npm run pseo:validate": "security",
    "npm run pseo:audit": "security",
    "npm run audit:public-artifact": "security",
    "npm run validate:seo": "security",
    "npm run audit:css-usage": "security",
    "npm run test:redirects": "security",
    "npm run test:ui": "e2e",
    "npm run audit:axe": "e2e",
    "npm run test:tools-uiux-e2e": "e2e",
    "npm run test:lighthouse": "performance",
}


def _read(path: Path) -> str:
    assert path.is_file(), f"missing workflow: {path}"
    return path.read_text(encoding="utf-8")


def _job_block(text: str, job_id: str) -> str:
    """Return YAML text from `job_id:` until the next top-level job or EOF."""
    m = re.search(rf"(?m)^  {re.escape(job_id)}:\n", text)
    assert m, f"job id {job_id!r} not found"
    start = m.start()
    rest = text[start + 1 :]
    m2 = re.search(r"(?m)^  [A-Za-z0-9_-]+:\n", rest)
    end = start + 1 + (m2.start() if m2 else len(rest))
    return text[start:end]


def _has_main_pr_and_push(text: str) -> list[str]:
    errors: list[str] = []
    if not re.search(r"(?m)^on:\s*$", text) and "on:" not in text.split("\n", 3)[0:3]:
        # workflows use `on:` block
        pass
    # push to main
    if not re.search(
        r"push:\s*\n(?:\s+.+\n)*?\s+branches:\s*\[main\]", text
    ) and not re.search(r'push:\s*\n\s+branches:\s*\n\s+-\s+main', text):
        # also accept push: with branches: [main] on same structure as site-ci
        if "branches: [main]" not in text and "- main" not in text:
            errors.append("workflow must target main on push and/or list main branch")
    # pull_request present (to main preferred)
    if "pull_request" not in text:
        errors.append("workflow must run on pull_request")
    return errors


def _on_block(text: str) -> str:
    m = re.search(r"(?m)^on:\n", text)
    assert m, "workflow missing on: block"
    start = m.start()
    rest = text[start + 1 :]
    m2 = re.search(r"(?m)^[A-Za-z0-9_-]+:\n", rest)
    end = start + 1 + (m2.start() if m2 else len(rest))
    return text[start:end]


def test_site_ci_shape():
    text = _read(SITE_CI)
    errors: list[str] = []

    if not text.lstrip().startswith("name: site-ci"):
        errors.append("site-ci workflow name must be 'site-ci'")

    job = _job_block(text, AGGREGATOR_JOB_ID)
    if f"name: {EXPECTED_SITE_CI_JOB_NAME}" not in job and f'name: "{EXPECTED_SITE_CI_JOB_NAME}"' not in job:
        errors.append(
            f"site-ci job {AGGREGATOR_JOB_ID!r} must set name: {EXPECTED_SITE_CI_JOB_NAME!r} "
            "(stable GitHub check context)"
        )
    if "always()" not in job:
        errors.append("aggregator must use if: always() so it still runs when a child fails")
    if "scripts/site/site_ci_aggregator.py" not in job:
        errors.append("aggregator must invoke scripts/site/site_ci_aggregator.py")

    # Triggers — full gate on PR/push to main; no path filters that skip merge
    if "pull_request" not in text:
        errors.append("site-ci must run on pull_request")
    if "branches: [main]" not in text and "- main" not in text:
        errors.append("site-ci push must include main")
    on_block = _on_block(text)
    if re.search(r"(?m)^\s+paths:", on_block) or re.search(r"(?m)^\s+paths-ignore:", on_block):
        errors.append("site-ci must not use on.paths / on.paths-ignore (would skip merge gates)")

    # Hard npm ci — no soft fallback that hides lock desync
    if "npm ci" not in text:
        errors.append("site-ci must run npm ci")
    if re.search(r"npm ci\s*\|\|\s*npm install", text):
        errors.append("site-ci must not use 'npm ci || npm install' (hides lock failures)")
    if "npm install" in text and "npm ci" in text:
        if re.search(r"(?m)^\s+npm install\s*$", text) or "|| npm install" in text:
            errors.append("site-ci install must not fall back to bare npm install")

    # One npm ci per installing job; aggregator must not reinstall
    for job_id in CHILD_JOB_IDS:
        block = _job_block(text, job_id)
        ci_count = len(re.findall(r"\bnpm ci\b", block))
        if ci_count == 0:
            errors.append(f"child job {job_id} must run npm ci")
        elif ci_count > 1:
            errors.append(f"child job {job_id} must install at most once (found {ci_count} npm ci)")
        if re.search(r"(?m)^\s+continue-on-error:\s*true\s*$", block):
            errors.append(f"required child {job_id} must not use continue-on-error: true")
        if f"name: {job_id}" not in block and f'name: "{job_id}"' not in block:
            errors.append(f"child job {job_id} must set name: {job_id} (subsystem check context)")
    agg_ci = len(re.findall(r"\bnpm ci\b", job))
    if agg_ci:
        errors.append(f"aggregator must not run npm ci (found {agg_ci})")
    if re.search(r"(?m)^\s+continue-on-error:\s*true\s*$", job):
        errors.append("site-ci gates job must not use continue-on-error: true")

    # Full command inventory, classified into the named child that reports them
    for needle, job_id in REQUIRED_COMMAND_CLASS.items():
        if needle not in text:
            errors.append(f"site-ci missing required step command: {needle}")
            continue
        if needle not in _job_block(text, job_id):
            errors.append(f"{needle} must run in child job {job_id} (subsystem diagnosis)")

    # Node pin aligned with Netlify/PR1 restore
    if 'node-version: "20"' not in text and "node-version: '20'" not in text:
        errors.append('site-ci must pin node-version: "20" until deliberate Node 22 migration')

    # Post-build jobs consume the _site artifact; build must publish it
    build = _job_block(text, "build")
    if "site-ci-site" not in build or "upload-artifact" not in build:
        errors.append("build job must upload _site artifact site-ci-site")
    if not re.search(r"(?m)^\s+include-hidden-files:\s*true\s*$", build):
        errors.append(
            "build _site artifact must set include-hidden-files: true "
            "(.well-known/pseo-build.json is a required public file)"
        )
    for job_id in ("security", "e2e", "performance"):
        block = _job_block(text, job_id)
        if "download-artifact" not in block or "site-ci-site" not in block:
            errors.append(f"{job_id} must download _site artifact site-ci-site")
        if "needs:" not in block or "build" not in block:
            errors.append(f"{job_id} must need build")

    assert not errors, "site-ci shape failures:\n- " + "\n- ".join(errors)


def test_aggregator_fail_closed_against_shipped_workflow():
    """Drive the shipped evaluator against the real workflow YAML.

    A child failure / cancelled / required-skip must make the aggregator
    fail; all-success must pass. No hardcoded expected hashes.
    """
    sys.path.insert(0, str(AGGREGATOR.parent))
    import site_ci_aggregator as agg  # shipped module, not a copy

    text = _read(SITE_CI)
    required = agg.required_children_from_workflow(text)
    assert tuple(required) == CHILD_JOB_IDS, (
        f"aggregator needs must be {CHILD_JOB_IDS}, got {tuple(required)}"
    )

    success_needs = {name: {"result": "success"} for name in required}
    ok, bad = agg.evaluate_needs(success_needs, required)
    assert ok and not bad, f"all-success must pass, got bad={bad}"

    for result in ("failure", "cancelled", "skipped"):
        for child in required:
            needs = {name: {"result": "success"} for name in required}
            needs[child] = {"result": result}
            ok, bad = agg.evaluate_needs(needs, required)
            assert not ok, f"{child}={result} must fail the aggregator"
            assert any(child in item and result in item for item in bad), bad

    missing = {name: {"result": "success"} for name in required}
    del missing[required[0]]
    ok, bad = agg.evaluate_needs(missing, required)
    assert not ok and any(required[0] in item for item in bad)

    def _run(payload: dict) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["SITE_CI_NEEDS"] = json.dumps(payload)
        env.pop("WORKFLOW_GATE_FORCE_FAIL", None)
        return subprocess.run(
            [sys.executable, str(AGGREGATOR)],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    green = _run(success_needs)
    assert green.returncode == 0, green.stdout + green.stderr
    assert "SITE_CI_AGGREGATOR_OK" in green.stdout

    for result in ("failure", "cancelled", "skipped"):
        payload = {name: {"result": "success"} for name in required}
        payload[required[-1]] = {"result": result}
        red = _run(payload)
        assert red.returncode != 0, f"CLI must fail on {required[-1]}={result}"
        assert "SITE_CI_AGGREGATOR_FAIL" in (red.stdout + red.stderr)
        assert required[-1] in (red.stdout + red.stderr)


def test_pseo_shape():
    text = _read(PSEO)
    errors: list[str] = []

    if "name: pSEO quality gates" not in text.split("\n", 1)[0] and not text.lstrip().startswith(
        "name: pSEO quality gates"
    ):
        errors.append("workflow name must be 'pSEO quality gates'")

    job = _job_block(text, "pseo")
    if f"name: {EXPECTED_PSEO_JOB_NAME}" not in job and f'name: "{EXPECTED_PSEO_JOB_NAME}"' not in job:
        errors.append(
            f"pseo job must set name: {EXPECTED_PSEO_JOB_NAME!r} (stable GitHub check context)"
        )

    if "pull_request" not in text:
        errors.append("pseo must run on pull_request")
    if "branches: [main]" not in text and "- main" not in text:
        errors.append("pseo must scope push/PR to main (branches: [main])")

    if "npm ci" not in text:
        errors.append("pseo must run npm ci")
    if re.search(r"npm ci\s*\|\|\s*npm install", text):
        errors.append("pseo must not use 'npm ci || npm install'")
    # Soft "if lock then ci else install" also hides missing lock expectations
    if re.search(r"npm install", text) and "pip install" not in text.replace("npm install", ""):
        pass
    if "else npm install" in text or "npm install; fi" in text:
        errors.append("pseo must not fall back to npm install when lockfile missing/broken")

    if re.search(r"(?m)^\s+continue-on-error:\s*true\s*$", job):
        errors.append("pseo job must not use continue-on-error: true")

    for needle in (
        "npm run build:site",
        "npm run audit:public-artifact",
        "npm run pseo:validate",
        "npm run pseo:audit",
        "npm test",
    ):
        if needle not in text:
            errors.append(f"pseo missing required step command: {needle}")

    if 'node-version: "20"' not in text and "node-version: '20'" not in text:
        errors.append('pseo must pin node-version: "20" until deliberate Node 22 migration')

    assert not errors, "pseo shape failures:\n- " + "\n- ".join(errors)


def test_codeql_soft_fail_is_explicit():
    """CodeQL may soft-fail only while code scanning is org-disabled — must stay honest."""
    text = _read(CODEQL)
    assert "continue-on-error: true" in text
    assert "Code scanning" in text or "code scanning" in text.lower()
    # Must not claim to be a hard required security gate without enablement
    assert "do not block" in text.lower() or "until then" in text.lower()


def test_deliberate_force_fail_env():
    """Controlled negative path: env forces red so CI can prove the test blocks."""
    if os.environ.get("WORKFLOW_GATE_FORCE_FAIL") == "1":
        raise AssertionError(
            "deliberate workflow-gate failure (WORKFLOW_GATE_FORCE_FAIL=1) — "
            "restore by unsetting the env var"
        )


def main() -> int:
    tests = [
        test_site_ci_shape,
        test_aggregator_fail_closed_against_shipped_workflow,
        test_pseo_shape,
        test_codeql_soft_fail_is_explicit,
        test_deliberate_force_fail_env,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"OK {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"ERROR {t.__name__}: {e}")
    if failed:
        print(f"WORKFLOW_GATES_FAIL count={failed}")
        return 1
    print("WORKFLOW_GATES_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
