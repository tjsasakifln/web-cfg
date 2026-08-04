#!/usr/bin/env python3
"""Assert minimal shape of merge-blocking CI workflows.

These checks ensure site-ci and pSEO quality gates cannot silently soften
into non-blocking installs or continue-on-error on central fail paths.
They also encode the stable job names that branch protection must require.

Deliberate failure mode (for local demo):
  WORKFLOW_GATE_FORCE_FAIL=1 python3 scripts/site/test_workflow_gates.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
PSEO = ROOT / ".github" / "workflows" / "pseo.yml"
CODEQL = ROOT / ".github" / "workflows" / "codeql.yml"

# Stable check contexts documented in docs/ops/REQUIRED-BRANCH-CHECKS.md
EXPECTED_SITE_CI_JOB_NAME = "site-ci"
EXPECTED_PSEO_JOB_NAME = "pSEO quality gates"


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


def test_site_ci_shape():
    text = _read(SITE_CI)
    errors: list[str] = []

    if not text.lstrip().startswith("name: site-ci"):
        errors.append("site-ci workflow name must be 'site-ci'")

    job = _job_block(text, "gates")
    if f"name: {EXPECTED_SITE_CI_JOB_NAME}" not in job and f'name: "{EXPECTED_SITE_CI_JOB_NAME}"' not in job:
        errors.append(
            f"site-ci job 'gates' must set name: {EXPECTED_SITE_CI_JOB_NAME!r} "
            "(stable GitHub check context)"
        )

    # Triggers
    if "pull_request" not in text:
        errors.append("site-ci must run on pull_request")
    if "branches: [main]" not in text and "- main" not in text:
        errors.append("site-ci push must include main")

    # Hard npm ci — no soft fallback that hides lock desync
    install = ""
    m = re.search(
        r"(?ms)name:\s*Install dependencies\n\s+run:\s*\|\n((?:\s{10,}.*\n)+)",
        text,
    )
    if not m:
        # fallback: any install step
        m = re.search(r"(?ms)Install dependencies.*?run:\s*\|\n((?:\s{8,}.*\n)+)", text)
    if m:
        install = m.group(1)
    if "npm ci" not in text:
        errors.append("site-ci must run npm ci")
    if re.search(r"npm ci\s*\|\|\s*npm install", text):
        errors.append("site-ci must not use 'npm ci || npm install' (hides lock failures)")
    if "npm install" in text and "npm ci" in text:
        # allow pip install only
        if re.search(r"(?m)^\s+npm install\s*$", text) or "|| npm install" in text:
            errors.append("site-ci install must not fall back to bare npm install")

    # No continue-on-error on job or non-upload steps
    if re.search(r"(?m)^\s+continue-on-error:\s*true\s*$", job):
        # upload may use if: always() but not continue-on-error true on gates
        # Allow only if solely under a clearly named non-gate step — forbid any true
        errors.append("site-ci gates job must not use continue-on-error: true")

    # Central scripts must appear
    for needle in (
        "npm run build:site",
        "npm run pseo:validate",
        "npm run pseo:audit",
        "npm run audit:public-artifact",
        "npm run test:lead-function",
    ):
        if needle not in text:
            errors.append(f"site-ci missing required step command: {needle}")

    # Node pin aligned with Netlify/PR1 restore
    if 'node-version: "20"' not in text and "node-version: '20'" not in text:
        errors.append('site-ci must pin node-version: "20" until deliberate Node 22 migration')

    assert not errors, "site-ci shape failures:\n- " + "\n- ".join(errors)


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
