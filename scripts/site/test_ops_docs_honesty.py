#!/usr/bin/env python3
"""Assert restore/ops docs stay consistent with post-merge restore facts."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ROOT / "docs" / "ops" / "REQUIRED-BRANCH-CHECKS.md"
REPORT = ROOT / "docs" / "ops" / "RESTORE-GREEN-MAIN-REPORT.md"
PORTFOLIO = ROOT / "docs" / "ops" / "CONFENGE-WEB-CFG-PR-PORTFOLIO-DISPOSITION-01.md"

ALLOWED_DESTINATIONS = (
    "MERGED_DIRECT",
    "FIXED_AND_MERGED",
    "ABSORBED_BY_INTEGRATION_PR",
    "CLOSED_ALREADY_LANDED",
    "CLOSED_SUPERSEDED",
    "CLOSED_DEFERRED_TO_ISSUE",
    "CLOSED_NO_INCREMENTAL_VALUE",
    "CLOSED_WRONG_AUTHORITY",
    "CLOSED_DEPENDENCY_REPLACED",
    "ACTIVE_WITH_EXACT_BLOCKER",
)

TERMINAL_KEYS = (
    "CAMPAIGN:",
    "MAIN_SHA_BEFORE:",
    "MAIN_SHA_AFTER:",
    "OPEN_PRS_BEFORE:",
    "OPEN_PRS_AFTER:",
    "MERGED_DIRECT:",
    "FIXED_AND_MERGED:",
    "ABSORBED:",
    "CLOSED_ALREADY_LANDED:",
    "CLOSED_SUPERSEDED:",
    "CLOSED_DEFERRED:",
    "CLOSED_NO_VALUE:",
    "CLOSED_WRONG_AUTHORITY:",
    "ACTIVE_WITH_BLOCKER:",
    "INTEGRATION_PRS:",
    "BRANCHES_DELETED:",
    "ISSUES_CLOSED:",
    "ISSUES_LEFT_OPEN:",
    "CI:",
    "DEPLOY:",
    "PUBLIC_RUNTIME_CHANGED:",
    "EMAIL_SENT:",
    "SPEND:",
    "CHARGE:",
    "DNS_MUTATION:",
    "INDEXATION_CHANGE:",
    "FINAL_VERDICT:",
)


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


def test_portfolio_disposition_report_shape():
    assert PORTFOLIO.is_file(), "missing docs/ops/CONFENGE-WEB-CFG-PR-PORTFOLIO-DISPOSITION-01.md"
    text = PORTFOLIO.read_text(encoding="utf-8")
    assert "America/Sao_Paulo" in text
    assert "PR | TÍTULO | DESTINO | SHA/PR DE DESTINO | ISSUE | ISSUE STATE | BRANCH | OBSERVAÇÃO" in text
    for key in TERMINAL_KEYS:
        assert key in text, f"missing terminal key {key}"
    assert "DEPLOY=NOT_REQUIRED_NO_PUBLIC_RUNTIME_CHANGE" in text or re.search(
        r"DEPLOY:\s+\S+", text
    )
    assert "EMAIL_SENT:" in text and "false" in text.lower()
    dest_lines = [
        line
        for line in text.splitlines()
        if re.match(
            r"^\|\s*#?(92|93|132|133|134|135|136|138|139|140|141|142|143|144|145|146|147)\s*\|",
            line,
        )
        and any(dest in line for dest in ALLOWED_DESTINATIONS)
    ]
    assert len(dest_lines) == 17, f"expected 17 destination rows, got {len(dest_lines)}"
    print("OK test_portfolio_disposition_report_shape")


def main() -> int:
    failed = 0
    for t in (
        test_required_branch_checks_status_is_applied,
        test_restore_report_post_merge_human_actions,
        test_portfolio_disposition_report_shape,
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
