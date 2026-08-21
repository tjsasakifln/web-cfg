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
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"
PSEO = ROOT / ".github" / "workflows" / "pseo.yml"
CODEQL = ROOT / ".github" / "workflows" / "codeql.yml"
PACKAGE_JSON = ROOT / "package.json"
PACKAGE_LOCK = ROOT / "package-lock.json"
NETLIFY = ROOT / "netlify.toml"
NVMRC = ROOT / ".nvmrc"

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
        "npm run organic:test",
        "npm run test:diagnose-margin",
        "npm run editorial:test",
        "npm run discovery:test",
    ):
        if needle not in text:
            errors.append(f"site-ci missing required step command: {needle}")

    # Node pin aligned with Netlify / engines.node >=22.19 (#149)
    if 'node-version: "22"' not in text and "node-version: '22'" not in text:
        errors.append('site-ci must pin node-version: "22"')
    if 'node-version: "20"' in text or "node-version: '20'" in text:
        errors.append('site-ci must not pin node-version: "20" (Node 22 lockstep)')

    chrome_at = text.find("browser-actions/setup-chrome")
    ui_at = text.find("npm run test:ui")
    axe_at = text.find("npm run audit:axe")
    if chrome_at < 0:
        errors.append("site-ci must install Chrome via browser-actions/setup-chrome")
    if chrome_at >= 0 and ui_at >= 0 and chrome_at > ui_at:
        errors.append("site-ci must install Chrome before npm run test:ui")
    if chrome_at >= 0 and axe_at >= 0 and chrome_at > axe_at:
        errors.append("site-ci must install Chrome before npm run audit:axe")

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

    if 'node-version: "22"' not in text and "node-version: '22'" not in text:
        errors.append('pseo must pin node-version: "22"')
    if 'node-version: "20"' in text or "node-version: '20'" in text:
        errors.append('pseo must not pin node-version: "20" (Node 22 lockstep)')

    chrome_at = text.find("browser-actions/setup-chrome")
    npm_test_at = text.find("npm test")
    if chrome_at < 0:
        errors.append("pseo must install Chrome via browser-actions/setup-chrome")
    if chrome_at >= 0 and npm_test_at >= 0 and chrome_at > npm_test_at:
        errors.append("pseo must install Chrome before npm test")

    assert not errors, "pseo shape failures:\n- " + "\n- ".join(errors)


def _on_block(text: str) -> str:
    """YAML `on:` mapping only — used to forbid path filters that skip merge."""
    m = re.search(r"(?m)^on:\n", text)
    assert m, "workflow missing top-level on:"
    start = m.start()
    rest = text[start + 1 :]
    m2 = re.search(r"(?m)^[A-Za-z0-9_-]+:\n", rest)
    end = start + 1 + (m2.start() if m2 else len(rest))
    return text[start:end]


def test_merge_workflows_have_no_path_skip():
    """site-ci and pSEO must not skip on path filters. test:affected is local only."""
    for label, path in (("site-ci", SITE_CI), ("pseo", PSEO)):
        text = _read(path)
        on = _on_block(text)
        if re.search(r"(?m)^\s+paths:\s*$", on) or re.search(r"(?m)^\s+paths:\s*\[", on):
            raise AssertionError(f"{label} on.paths would skip merge work")
        if re.search(r"(?m)^\s+paths-ignore:", on):
            raise AssertionError(f"{label} on.paths-ignore would skip merge work")
        if "test:affected" in text:
            raise AssertionError(
                f"{label} must not run test:affected (local feedback only; merge stays full)"
            )


def test_pseo_still_requires_full_npm_test():
    text = _read(PSEO)
    if "npm test" not in text:
        raise AssertionError("pseo.yml must keep the full `npm test` merge gate")
    if re.search(r"npm test\s*\|\|", text) or "npm run test:affected" in text:
        raise AssertionError("pseo.yml must not soften or replace npm test with test:affected")


def test_node22_lighthouse13_lockstep():
    """Shipped files for #149. Must fail if Node 22 / Lighthouse 13 is reverted."""
    errors: list[str] = []

    pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    engines_node = str((pkg.get("engines") or {}).get("node") or "")
    if "22.19" not in engines_node:
        errors.append(
            f'package.json engines.node must include 22.19, got {engines_node!r}'
        )
    if re.search(r"(^|[^\d])20([^\d.]|$)", engines_node) and "22.19" not in engines_node:
        errors.append("package.json engines.node must not remain on the Node 20 pin")

    lh_range = str((pkg.get("devDependencies") or {}).get("lighthouse") or "")
    if not re.search(r"(^|[\^~>= ]*)13(\.|$)", lh_range.strip()):
        errors.append(f"package.json lighthouse must be 13.x, got {lh_range!r}")

    lock = json.loads(PACKAGE_LOCK.read_text(encoding="utf-8"))
    lh_lock = (lock.get("packages") or {}).get("node_modules/lighthouse") or {}
    lh_version = str(lh_lock.get("version") or "")
    if not lh_version.startswith("13."):
        errors.append(
            f"package-lock.json node_modules/lighthouse must be 13.x, got {lh_version!r}"
        )

    for label, path in (("site-ci", SITE_CI), ("pseo", PSEO)):
        text = _read(path)
        if 'node-version: "22"' not in text and "node-version: '22'" not in text:
            errors.append(f'{label} must contain node-version: "22"')
        if 'node-version: "20"' in text or "node-version: '20'" in text:
            errors.append(f'{label} must not contain node-version: "20"')

    nvmrc_text = NVMRC.read_text(encoding="utf-8").strip() if NVMRC.is_file() else ""
    if nvmrc_text != "22":
        errors.append(f'.nvmrc must be "22", got {nvmrc_text!r}')

    netlify = NETLIFY.read_text(encoding="utf-8")
    if not re.search(r'(?m)^\s*NODE_VERSION\s*=\s*"22"\s*$', netlify):
        errors.append('netlify.toml must set NODE_VERSION = "22"')
    if re.search(r'(?m)^\s*NODE_VERSION\s*=\s*"20"\s*$', netlify):
        errors.append("netlify.toml must not remain NODE_VERSION=20 (GHA/Netlify split-brain)")

    wf_dir = ROOT / ".github" / "workflows"
    for path in sorted(wf_dir.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        if "setup-node" not in text:
            continue
        if 'node-version: "20"' in text or "node-version: '20'" in text:
            errors.append(f"{path.name} still pins node-version: \"20\"")
        if 'node-version: "22"' not in text and "node-version: '22'" not in text:
            errors.append(f'{path.name} uses setup-node but does not pin node-version: "22"')

    assert not errors, "node22/lighthouse13 lockstep failures:\n- " + "\n- ".join(errors)


def test_codeql_soft_fail_is_explicit():
    """CodeQL may soft-fail only while code scanning is org-disabled — must stay honest."""
    text = _read(CODEQL)
    assert "continue-on-error: true" in text
    assert "Code scanning" in text or "code scanning" in text.lower()
    # Must not claim to be a hard required security gate without enablement
    assert "do not block" in text.lower() or "until then" in text.lower()


def test_copy_ci_is_check_not_write():
    """CI copy path must verify em-dashes without mutating the tree.

    `npm run scrub:em-dashes` remains the explicit fixer (`--write`).
    """
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    copy = pkg["scripts"]["test:copy"]
    if "scrub_em_dashes.py --write" in copy:
        raise AssertionError(
            "test:copy must not run scrub_em_dashes.py --write "
            "(CI/check cannot mutate tracked files)"
        )
    if "scrub_em_dashes.py --check" not in copy:
        raise AssertionError("test:copy must keep scrub_em_dashes.py --check")
    if "test_copy_gates.py" not in copy:
        raise AssertionError("test:copy must keep test_copy_gates.py")
    fixer = pkg["scripts"].get("scrub:em-dashes", "")
    if "scrub_em_dashes.py --write" not in fixer:
        raise AssertionError("scrub:em-dashes fixer must keep --write")
    site_ci = _read(SITE_CI)
    if "npm run test:copy" not in site_ci:
        raise AssertionError("site-ci must run npm run test:copy")


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
        test_merge_workflows_have_no_path_skip,
        test_pseo_still_requires_full_npm_test,
        test_node22_lighthouse13_lockstep,
        test_codeql_soft_fail_is_explicit,
        test_copy_ci_is_check_not_write,
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
