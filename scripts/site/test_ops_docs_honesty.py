#!/usr/bin/env python3
"""Assert restore/ops docs stay consistent with post-merge restore facts."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ROOT / "docs" / "ops" / "REQUIRED-BRANCH-CHECKS.md"
REPORT = ROOT / "docs" / "ops" / "RESTORE-GREEN-MAIN-REPORT.md"


def test_required_branch_checks_status_is_applied():
    text = REQUIRED.read_text(encoding="utf-8")
    head = "\n".join(text.splitlines()[:10])
    assert "PENDING HUMAN" not in head, (
        "REQUIRED-BRANCH-CHECKS.md header must not say PENDING HUMAN after API apply"
    )
    assert re.search(r"Status:\s*APPLIED", head, re.I), (
        "REQUIRED-BRANCH-CHECKS.md header must declare Status: APPLIED (API)"
    )
    assert "site-ci" in text and "pSEO quality gates" in text
    assert "was **not** modified by automation" not in text
    print("OK test_required_branch_checks_status_is_applied")


def test_restore_report_post_merge_human_actions():
    text = REPORT.read_text(encoding="utf-8")
    assert "Fundir #41" not in text
    assert "**Merged**" in text or "Merged" in text
    assert "#41" in text and "#44" in text
    assert "WAVE1-FIRST-COHORT" in text or "coorte" in text.lower()
    assert "WAVE1-POST-APPROVAL-RUNBOOK" in text or "runbook" in text.lower()
    assert "site-ci" in text and "pSEO quality gates" in text
    assert "49d61778" in text
    sec7 = text.split("## 7.")[-1] if "## 7." in text else ""
    assert sec7, "section 7 missing"
    assert "Fundir" not in sec7
    assert "Confirmar" in sec7 or "UI" in sec7
    print("OK test_restore_report_post_merge_human_actions")


def main() -> int:
    failed = 0
    for t in (
        test_required_branch_checks_status_is_applied,
        test_restore_report_post_merge_human_actions,
    ):
        try:
            t()
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
    if failed:
        print(f"OPS_DOCS_HONESTY_FAIL count={failed}")
        return 1
    print("OPS_DOCS_HONESTY_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
