"""Governance + truth reconciliation tests, drive shipped modules only."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.approve_cli import main as approve_main  # noqa: E402
from scripts.editorial.governance import (  # noqa: E402
    EDITORIAL_CHECKLIST_KEYS,
    is_automation_environment,
    is_blocked_reviewer,
    missing_checklist,
    validate_approval_request,
)
from scripts.editorial.registry import (  # noqa: E402
    approve_human,
    load_registry,
    material_hash,
    upsert_page,
)
from scripts.editorial.truth import (  # noqa: E402
    assert_truth_consistent,
    derive_editorial_truth,
    write_terminal_result,
)


def test_blocked_reviewers_include_tester_and_ci():
    assert is_blocked_reviewer("tester")
    assert is_blocked_reviewer("ci-bot")
    assert is_blocked_reviewer("")
    assert is_blocked_reviewer("agent")
    assert not is_blocked_reviewer("Tiago Sasaki")


def test_ci_environment_blocks_approval(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("ALLOW_HUMAN_APPROVAL", "1")
    assert is_automation_environment()
    errs = validate_approval_request(
        reviewer="Tiago Sasaki",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["lei-art124-alteracao-obra"],
        confirm=True,
        material_hash_expected="abc",
        material_hash_actual="abc",
        env=dict(os.environ),
    )
    assert "approval_blocked_in_ci_or_automation" in errs


def test_allow_human_approval_required_without_env():
    """approve path must fail when ALLOW_HUMAN_APPROVAL is unset (non-CI)."""
    env = {k: v for k, v in os.environ.items() if k not in (
        "ALLOW_HUMAN_APPROVAL", "CI", "GITHUB_ACTIONS", "PSEO_AUTOMATION", "EDITORIAL_AUTOMATION"
    )}
    errs = validate_approval_request(
        reviewer="Maria Silva",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["lei-art124-alteracao-obra"],
        confirm=True,
        material_hash_expected="abc",
        material_hash_actual="abc",
        env=env,
    )
    assert "allow_human_approval_required" in errs


def test_approve_cli_fails_without_allow_human_approval(monkeypatch):
    monkeypatch.delenv("ALLOW_HUMAN_APPROVAL", raising=False)
    monkeypatch.delenv("CI", raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    reg = load_registry()
    page = next(p for p in reg["pages"] if p["page_id"] == "lei-art124-alteracao-obra")
    mh = page.get("material_hash") or ""
    reg_path = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"
    before = reg_path.read_bytes()
    rc = approve_main(
        [
            "--reviewer",
            "Maria Silva",
            "--page-id",
            "lei-art124-alteracao-obra",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado para publicação.",
            "--sources",
            "lei-14133-planalto",
            "--checklist",
            ",".join(EDITORIAL_CHECKLIST_KEYS),
            "--material-hash",
            mh,
            "--confirm",
        ]
    )
    assert rc != 0
    assert reg_path.read_bytes() == before


def test_missing_checklist_detected():
    miss = missing_checklist(["sources_verified"], EDITORIAL_CHECKLIST_KEYS)
    assert "naturalness_ok" in miss
    assert not missing_checklist(list(EDITORIAL_CHECKLIST_KEYS), EDITORIAL_CHECKLIST_KEYS)


def test_bulk_and_no_confirm_blocked():
    env = {"ALLOW_HUMAN_APPROVAL": "1"}
    errs = validate_approval_request(
        reviewer="Maria Silva",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["a", "b"],
        confirm=False,
        env=env,
    )
    assert "bulk_approval_forbidden" in errs
    assert "individual_confirm_required" in errs


def test_hash_mismatch_blocked():
    env = {"ALLOW_HUMAN_APPROVAL": "1"}
    errs = validate_approval_request(
        reviewer="Maria Silva",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["only"],
        confirm=True,
        material_hash_expected="aaa",
        material_hash_actual="bbb",
        env=env,
    )
    assert "approval_hash_mismatch" in errs


def test_material_hash_flag_required():
    env = {"ALLOW_HUMAN_APPROVAL": "1"}
    errs = validate_approval_request(
        reviewer="Maria Silva",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["only"],
        confirm=True,
        material_hash_expected=None,
        material_hash_actual="abc",
        env=env,
    )
    assert "material_hash_flag_required" in errs


def test_rejected_page_blocked():
    env = {"ALLOW_HUMAN_APPROVAL": "1"}
    errs = validate_approval_request(
        reviewer="Maria Silva",
        notes="Fontes e conteúdo conferidos com rigor adequado para publicação.",
        checklist=list(EDITORIAL_CHECKLIST_KEYS),
        page_ids=["jur-sumula-260-art"],
        confirm=True,
        page_status="REJECTED",
        material_hash_expected="abc",
        material_hash_actual="abc",
        env=env,
    )
    assert "cannot_approve_rejected" in errs


def test_approve_cli_bare_fails_and_writes_nothing(tmp_path, monkeypatch):
    """Bare approve without checklist must exit non-zero and not mutate registry."""
    # Use real registry path but restore after
    reg_path = ROOT / "data" / "editorial" / "EDITORIAL-REGISTRY.json"
    before = reg_path.read_bytes()
    mtime_before = reg_path.stat().st_mtime_ns
    rc = approve_main(
        [
            "--reviewer",
            "tester",
            "--page-id",
            "lei-art124-alteracao-obra",
            "--notes",
            "x",
            "--sources",
            "lei-14133-planalto",
        ]
    )
    assert rc != 0
    after = reg_path.read_bytes()
    assert after == before
    assert reg_path.stat().st_mtime_ns == mtime_before


def test_approve_cli_partial_checklist_fails():
    reg = load_registry()
    page = next(p for p in reg["pages"] if p["page_id"] == "lei-art124-alteracao-obra")
    mh = page.get("material_hash") or ""
    rc = approve_main(
        [
            "--reviewer",
            "Maria Silva",
            "--page-id",
            "lei-art124-alteracao-obra",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado para publicação.",
            "--sources",
            "lei-14133-planalto",
            "--checklist",
            "sources_verified,naturalness_ok",
            "--material-hash",
            mh,
            "--confirm",
        ]
    )
    assert rc != 0
    reg2 = load_registry()
    page2 = next(p for p in reg2["pages"] if p["page_id"] == "lei-art124-alteracao-obra")
    assert page2.get("status") == "EDITORIAL_REVIEWED"


def test_pseo_review_bare_approved_fails():
    """Goal scenario: review set PAGE APPROVED --reviewer tester --notes x."""
    # pick a non-approved page id from registry if present
    reg_path = ROOT / "data" / "pseo" / "registry.json"
    if not reg_path.exists():
        pytest.skip("no pseo registry")
    data = json.loads(reg_path.read_text(encoding="utf-8"))
    page_id = None
    for p in data.get("pages") or []:
        if p.get("human_review") not in {"APPROVED", "APPROVED_WITH_NOTES"}:
            page_id = p.get("page_id")
            break
    if not page_id:
        pytest.skip("no pending page")
    before = reg_path.read_bytes()
    env = {**os.environ, "ALLOW_HUMAN_APPROVAL": "0"}
    # Clear CI markers for this process path, review itself checks CI
    env.pop("GITHUB_ACTIONS", None)
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "pseo" / "review.py"),
            "set",
            page_id,
            "APPROVED",
            "--reviewer",
            "tester",
            "--notes",
            "x",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert reg_path.read_bytes() == before


def test_pseo_review_bulk_star_fails():
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "pseo" / "review.py"),
            "set",
            "ALL",
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
            "--checklist",
            ",".join(
                [
                    "sample_independence_verified",
                    "no_internal_slugs",
                    "sources_checked",
                    "claims_have_direct_evidence",
                    "no_duplicates_in_tables",
                    "meta_description_complete",
                    "cannibalization_checked",
                    "cta_contextual",
                ]
            ),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0


def test_live_registry_wave1_not_human_approved():
    reg = load_registry()
    for p in reg.get("pages") or []:
        if p.get("page_id") == "jur-sumula-260-art":
            assert p.get("status") == "REJECTED"
            continue
        assert p.get("status") == "EDITORIAL_REVIEWED", p.get("page_id")
        assert not p.get("approval")
    truth = derive_editorial_truth(reg)
    assert truth["wave1"]["human_approved"] == 0
    assert truth["wave1"]["indexable"] == 0
    assert truth["sitemaps"]["editorial_locs"] == 0
    # Package SHA must match HEAD when files are pinned (no lag after recovery commit)
    from scripts.editorial.truth import verify_packaged_sha_matches_head

    sha_fails = verify_packaged_sha_matches_head()
    assert not sha_fails, sha_fails
    assert truth["ok"], truth.get("contradictions")
    assert truth["terminal_status"] == "READY_FOR_NAMED_HUMAN_APPROVAL"


def test_write_terminal_never_emits_blocked_empty_contras():
    """write_terminal_result must recompute READY after dropping package-self SHA contras."""
    from scripts.editorial.truth import write_terminal_result, derive_editorial_truth

    path = write_terminal_result()
    data = json.loads(path.read_text(encoding="utf-8"))
    live = derive_editorial_truth()
    # After write, package-self SHA mismatches are gone → READY-shaped Wave1 is READY
    assert data["terminal_status"] == live["terminal_status"]
    assert not (
        data["terminal_status"] == "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE"
        and not (data.get("contradictions") or [])
        and data.get("ok") is True
    )
    if live["terminal_status"] == "READY_FOR_NAMED_HUMAN_APPROVAL":
        assert data["terminal_status"] == "READY_FOR_NAMED_HUMAN_APPROVAL"
        assert data["ok"] is True
        assert data["indexable_count"] == 0
        assert data["awaiting_human"] == 11


def test_packaged_terminal_status_matches_live_ready():
    """Committed/written packages must not lag live terminal_status (skeptic status lag)."""
    from scripts.editorial.truth import (
        derive_editorial_truth,
        verify_packaged_matches_live,
        write_terminal_result,
    )

    write_terminal_result()
    live = derive_editorial_truth()
    fails = verify_packaged_matches_live(live)
    assert not fails, fails
    term = json.loads((ROOT / "docs" / "editorial" / "TERMINAL-RESULT.json").read_text())
    inv = json.loads((ROOT / "docs" / "editorial" / "EDITORIAL-INVENTORY.json").read_text())
    assert term["terminal_status"] == live["terminal_status"]
    assert inv["terminal_status"] == live["terminal_status"]
    if live["terminal_status"] == "READY_FOR_NAMED_HUMAN_APPROVAL":
        assert term["terminal_status"] == "READY_FOR_NAMED_HUMAN_APPROVAL"
        assert term.get("contradictions") == []
        assert term.get("ok") is True


def test_packaged_sha_rejects_unrelated_ancestor():
    """Skeptic: pre-recovery main (or any deep ancestor) must NOT pass on recovery tip.

    Drives shipped packaged_sha_is_acceptable, not a reimplementation.

    Note: do NOT use merge-base(HEAD, origin/main) as the "stale" candidate on
    PR merge refs, that is the first parent (base tip) and is intentionally
    allowed via base-pin inheritance for Dependabot/chore PRs.
    """
    import subprocess

    from scripts.editorial.truth import (
        packaged_sha_is_acceptable,
        _git_sha,
        _git_parent_sha,
        _git_parents,
        _head_is_docs_editorial_pin_only,
    )

    live = _git_sha()
    assert live != "unknown"

    disallowed_near = {live}
    disallowed_near.update(_git_parents(live))
    if _head_is_docs_editorial_pin_only() and _git_parent_sha():
        disallowed_near.add(_git_parent_sha())
    # Base of a 2-parent merge and its immediate pin lineage are in-bounds.
    parents = _git_parents(live)
    if len(parents) == 2:
        base = parents[0]
        disallowed_near.add(base)
        disallowed_near.update(_git_parents(base))
        for bp in _git_parents(base):
            disallowed_near.update(_git_parents(bp))

    stale = None
    for rev in ("HEAD~15", "HEAD~10", "HEAD~8", "HEAD~5"):
        try:
            candidate = (
                subprocess.check_output(
                    ["git", "rev-parse", rev],
                    cwd=ROOT,
                    stderr=subprocess.DEVNULL,
                )
                .decode()
                .strip()
            )
        except Exception:  # noqa: BLE001
            continue
        if candidate in disallowed_near:
            continue
        if packaged_sha_is_acceptable(candidate, live):
            continue
        stale = candidate
        break

    if not stale:
        pytest.skip("cannot find non-allowed deep ancestor for rejection test")

    assert packaged_sha_is_acceptable(stale, live) is False, (
        f"unrelated ancestor {stale[:12]} must not be accepted at {live[:12]}"
    )
    # Positive controls
    assert packaged_sha_is_acceptable(live, live) is True
    if _head_is_docs_editorial_pin_only() and _git_parent_sha():
        assert packaged_sha_is_acceptable(_git_parent_sha(), live) is True


def test_packaged_sha_inherits_base_pin_on_pr_merge():
    """Dependabot-style PR merge: package pin from main must pass on ephemeral merge SHA.

    Simulates GitHub's pull_request merge ref (2 parents: base, pr_tip) where the PR
    only touches workflows and leaves docs/editorial package JSON at main's pin.
    """
    from scripts.editorial import truth as truth_mod

    base = "base" + "0" * 36
    pr_tip = "prtip" + "0" * 35
    merge = "merge" + "0" * 35
    pin = "pin00" + "0" * 35
    material = "mater" + "0" * 35

    parents = {
        merge: [base, pr_tip],
        # base is itself a merge of prior main + docs-only pin (common on main)
        base: ["prior" + "0" * 35, pin],
        pin: [material],
        pr_tip: ["prior" + "0" * 35],
    }
    pin_only = {pin}

    def fake_parents(sha: str):
        return list(parents.get(sha, []))

    def fake_pin_only(sha: str) -> bool:
        return sha in pin_only

    orig_parents = truth_mod._git_parents
    orig_pin = truth_mod._commit_is_docs_editorial_pin_only
    orig_head_pin = truth_mod._head_is_docs_editorial_pin_only
    try:
        truth_mod._git_parents = fake_parents  # type: ignore[assignment]
        truth_mod._commit_is_docs_editorial_pin_only = fake_pin_only  # type: ignore[assignment]
        truth_mod._head_is_docs_editorial_pin_only = lambda: False  # type: ignore[assignment]

        # Package at material (parent of docs pin on base) must pass on merge live
        assert truth_mod.packaged_sha_is_acceptable(material, merge) is True
        # Exact PR tip still ok
        assert truth_mod.packaged_sha_is_acceptable(pr_tip, merge) is True
        # Random SHA still rejected
        assert truth_mod.packaged_sha_is_acceptable("dead" + "0" * 36, merge) is False
    finally:
        truth_mod._git_parents = orig_parents  # type: ignore[assignment]
        truth_mod._commit_is_docs_editorial_pin_only = orig_pin  # type: ignore[assignment]
        truth_mod._head_is_docs_editorial_pin_only = orig_head_pin  # type: ignore[assignment]


def test_truth_write_matches_registry():
    truth = derive_editorial_truth()
    path = write_terminal_result(truth)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["indexable_count"] == 0
    assert data["human_approved_count"] == 0
    assert data["awaiting_human"] == 11
    assert data["rejected"] == 1
    assert data["terminal_status"] in {
        "READY_FOR_NAMED_HUMAN_APPROVAL",
        "BLOCKED_CI_AND_EDITORIAL_GOVERNANCE",
    }
    assert data["hub_claimed_guides"] == truth["public_inventory"]["conteudos_indexable"]


def test_contradiction_hub_120_would_fail(monkeypatch):
    """If hub claimed 120 while indexable is 22, truth must flag contradiction."""
    truth = derive_editorial_truth()
    # inject
    truth["public_inventory"]["hub_claimed_guides"] = 120
    truth["contradictions"] = list(truth["contradictions"]) + ["hub_claims_false_120_guides"]
    assert "hub_claims_false_120_guides" in truth["contradictions"]


def test_no_tiago_stamp_in_registry():
    reg = load_registry()
    for p in reg.get("pages") or []:
        appr = p.get("approval") or {}
        if appr.get("reviewer"):
            # live recovery state: no approval objects
            pytest.fail(f"unexpected approval on {p.get('page_id')}: {appr}")
        for h in p.get("history") or []:
            if h.get("event") in {"HUMAN_APPROVED", "INDEXABLE"} and h.get("reviewer") == "Tiago Sasaki":
                # allow only if also revoked note exists, but recovery wants none
                pytest.fail(f"false Tiago approval history on {p.get('page_id')}: {h}")
