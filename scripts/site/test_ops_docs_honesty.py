#!/usr/bin/env python3
"""Assert restore/ops docs stay consistent with post-merge restore facts."""
from __future__ import annotations

import json
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


CAMPAIGN_DISPOSITION_JSON = ROOT / "docs" / "ops" / "PR_PORTFOLIO_DISPOSITION.json"
CAMPAIGN_DISPOSITION_MD = ROOT / "docs" / "ops" / "PR_PORTFOLIO_DISPOSITION.md"
SEVEN_LABELS = (
    "MERGE_AS_IS",
    "REBASE_THEN_MERGE",
    "CHERRY_PICK_UNIQUE_DELTA",
    "SUPERSEDED_BY_MAIN",
    "SUPERSEDED_BY_ANOTHER_PR",
    "HOLD_FOR_EVIDENCE",
    "REJECT",
)


CAMPAIGN_01_REPORT = (
    ROOT / "docs" / "integration" / "campaign-20260904" / "open-pr-convergence.md"
)
CAMPAIGN_01_LABELS = (
    "MERGE_CANDIDATE_CURRENT",
    "PORT_RESIDUAL_VIA_HANDOFF",
    "SUPERSEDED_CLOSE",
    "HOLD_WITH_EXPLICIT_TRIGGER",
    "DEPENDABOT_REFRESH_OR_CLOSE",
    "REJECT_REGRESSION",
)
CAMPAIGN_01_TABLE_HEADER = (
    "PR | base/head | arquivos | comportamento já em main | residual real | "
    "conflito estratégico | testes | decisão | ação | rollback"
)
CAMPAIGN_01_CLOSE_LABELS = {
    "SUPERSEDED_CLOSE",
    "REJECT_REGRESSION",
    "PORT_RESIDUAL_VIA_HANDOFF",
    "DEPENDABOT_REFRESH_OR_CLOSE",
}


def _campaign_01_table_rows(text: str) -> list[dict[str, str]]:
    header_line = next(
        (
            line
            for line in text.splitlines()
            if CAMPAIGN_01_TABLE_HEADER in line.replace("**", "")
        ),
        None,
    )
    assert header_line is not None, "campaign 01 classification table header missing"
    rows: list[dict[str, str]] = []
    started = False
    for line in text.splitlines():
        if CAMPAIGN_01_TABLE_HEADER in line.replace("**", ""):
            started = True
            continue
        if not started:
            continue
        if not line.startswith("|"):
            break
        if re.match(r"^\|\s*-+", line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 10:
            continue
        if not re.fullmatch(r"#?\d+", cells[0]):
            continue
        rows.append(
            {
                "pr": cells[0].lstrip("#"),
                "base_head": cells[1],
                "arquivos": cells[2],
                "ja_em_main": cells[3],
                "residual": cells[4],
                "conflito": cells[5],
                "testes": cells[6],
                "decisao": cells[7],
                "acao": cells[8],
                "rollback": cells[9],
            }
        )
    return rows


def test_campaign_01_open_pr_convergence_report():
    assert CAMPAIGN_01_REPORT.is_file(), (
        "missing docs/integration/campaign-20260904/open-pr-convergence.md"
    )
    text = CAMPAIGN_01_REPORT.read_text(encoding="utf-8")
    assert "WRITE_SET" in text and "DO_NOT_TOUCH_SET" in text
    assert "CAMPAIGN_ID=01" in text
    assert re.search(r"AUDITED_MAIN_SHA=[0-9a-f]{40}", text)
    assert "ABSORBED_OPS_NO_TRANSFORM=YES" in text
    assert "ABSORBED_RETENTION_TIMER=YES" in text
    assert "ABSORBED_MINIMIZED_LOGS=YES" in text
    assert "LCP_HOLD=YES" in text
    assert "RESIDUAL_HANDOFF=" in text
    assert "EQUIVALENCE_FILE_COUNT_IS_NOT_PROOF=YES" in text
    residual = re.search(r"RESIDUAL_HANDOFF=(\S+)", text)
    assert residual, "missing RESIDUAL_HANDOFF path"
    residual_path = ROOT / residual.group(1)
    assert residual_path.is_file(), f"missing residual handoff {residual.group(1)}"
    residual_text = residual_path.read_text(encoding="utf-8")
    assert re.search(r"SOURCE_COMMIT=[0-9a-f]{40}", residual_text)
    assert "target_path" in residual_text
    assert "LCP_HOLD=YES" in residual_text
    assert "goal 97" in residual_text.lower() or "goal 97" in residual_text
    rows = _campaign_01_table_rows(text)
    numbers = [int(row["pr"]) for row in rows]
    assert numbers, "classification table has no PR rows"
    assert len(numbers) == len(set(numbers)), f"duplicate PR rows: {numbers}"
    inventoried = re.search(
        r"Live GitHub on [0-9-]+ matched\s+both\.",
        text,
    )
    assert inventoried, "live GitHub inventory sentence missing"
    anchor = re.search(r"open set `([^`]+)`", text)
    assert anchor, "live/historical open-set anchor missing"
    live_set = [int(n) for n in re.findall(r"#(\d+)", anchor.group(1))]
    assert live_set, "open-set anchor has no PR numbers"
    assert sorted(numbers) == sorted(live_set), (
        f"table {sorted(numbers)} != live inventoried set {sorted(live_set)}"
    )
    for row in rows:
        assert row["decisao"] in CAMPAIGN_01_LABELS, (
            f"PR #{row['pr']} decisão {row['decisao']!r} not in six labels"
        )
        for key in (
            "base_head",
            "arquivos",
            "ja_em_main",
            "residual",
            "conflito",
            "testes",
            "acao",
            "rollback",
        ):
            assert row[key], f"PR #{row['pr']} missing {key}"
    assert any(int(row["pr"]) == 536 for row in rows), "live set must include #536"
    closed = {
        int(row["pr"])
        for row in rows
        if row["decisao"] in CAMPAIGN_01_CLOSE_LABELS and "close" in row["acao"].lower()
    }
    for match in re.finditer(r"WAIT FOR #(\d+)", text):
        target = int(match.group(1))
        assert target not in closed, (
            f"live WAIT FOR #{target} points at a closed/superseded PR"
        )
    print("OK test_campaign_01_open_pr_convergence_report")


def test_pr_portfolio_disposition_campaign_artifact():
    assert CAMPAIGN_DISPOSITION_JSON.is_file(), "missing docs/ops/PR_PORTFOLIO_DISPOSITION.json"
    assert CAMPAIGN_DISPOSITION_MD.is_file(), "missing docs/ops/PR_PORTFOLIO_DISPOSITION.md"
    doc = json.loads(CAMPAIGN_DISPOSITION_JSON.read_text(encoding="utf-8"))
    before = int(doc["OPEN_PRS_BEFORE"])
    after = int(doc["OPEN_PRS_AFTER"])
    assert after < before, f"OPEN_PRS_AFTER {after} is not lower than OPEN_PRS_BEFORE {before}"
    inventoried = doc.get("inventoried_pr_numbers") or [p["number"] for p in doc["prs"]]
    assert inventoried, "inventoried PR list empty"
    numbers = [int(p["number"]) for p in doc["prs"]]
    assert len(numbers) == len(set(numbers)), f"duplicate PR numbers in disposition: {numbers}"
    assert sorted(numbers) == sorted(int(n) for n in inventoried), (
        "every inventoried PR number must appear once in prs[]"
    )
    for pr in doc["prs"]:
        dest = pr["destination"]
        assert dest in SEVEN_LABELS, f"PR #{pr['number']} destination {dest!r} not in seven labels"
        for key in (
            "issue_owner",
            "paths",
            "semantic_overlap",
            "ci",
            "risk",
            "visitor_impact",
            "rollback",
        ):
            assert key in pr and pr[key] not in (None, ""), f"PR #{pr['number']} missing {key}"
    pr193 = next(p for p in doc["prs"] if int(p["number"]) == 193)
    lockstep = bool(pr193.get("lockstep_evidence") or (doc.get("node22_lighthouse13") or {}).get("lockstep_evidence"))
    if not lockstep:
        assert pr193["destination"] == "HOLD_FOR_EVIDENCE", (
            "#193 must be HOLD_FOR_EVIDENCE unless CI + Netlify preview lockstep evidence is attached"
        )
    md = CAMPAIGN_DISPOSITION_MD.read_text(encoding="utf-8")
    assert "OPEN_PRS_BEFORE:" in md and "OPEN_PRS_AFTER:" in md
    assert "WEB_PRODUCTION_CONVERGED_READY_FOR_ASAAS_MAPPING" in md or "WEB_CONVERGENCE_BLOCKED_" in md
    print("OK test_pr_portfolio_disposition_campaign_artifact")


def main() -> int:
    failed = 0
    for t in (
        test_required_branch_checks_status_is_applied,
        test_restore_report_post_merge_human_actions,
        test_portfolio_disposition_report_shape,
        test_pr_portfolio_disposition_campaign_artifact,
        test_campaign_01_open_pr_convergence_report,
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
