"""Negative tests for pSEO review CLI — must not write on blocked paths."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REVIEW = ROOT / "scripts" / "pseo" / "review.py"
REG = ROOT / "data" / "pseo" / "registry.json"


def _pending_page() -> str:
    data = json.loads(REG.read_text(encoding="utf-8"))
    for p in data.get("pages") or []:
        if p.get("human_review") not in {"APPROVED", "APPROVED_WITH_NOTES"}:
            return p["page_id"]
    raise RuntimeError("no pending page")


def _run(
    args: list[str],
    env: dict | None = None,
    *,
    clear_ci: bool = True,
) -> subprocess.CompletedProcess:
    e = {**os.environ, **(env or {})}
    if clear_ci and not (env or {}).keys() & {"CI", "GITHUB_ACTIONS"}:
        e.pop("GITHUB_ACTIONS", None)
        e.pop("CI", None)
    return subprocess.run(
        [sys.executable, str(REVIEW), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=e,
    )


def test_bare_approved_tester_notes_x():
    pid = _pending_page()
    before = REG.read_bytes()
    r = _run(["set", pid, "APPROVED", "--reviewer", "tester", "--notes", "x"])
    assert r.returncode != 0
    assert REG.read_bytes() == before


def test_partial_checklist_fails():
    pid = _pending_page()
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            pid,
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
            "--checklist",
            "sources_checked,cta_contextual",
        ],
        env={"ALLOW_HUMAN_APPROVAL": "1"},
        clear_ci=False,
    )
    assert r.returncode != 0
    assert REG.read_bytes() == before


def test_approved_without_material_hash_fails():
    """Skeptic: APPROVED must not succeed without --material-hash even if checklist OK."""
    import json
    from pathlib import Path

    data = json.loads(REG.read_text(encoding="utf-8"))
    pid = None
    for p in data.get("pages") or []:
        if p.get("human_review") not in {"APPROVED", "APPROVED_WITH_NOTES"}:
            pid = p["page_id"]
            break
    assert pid
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            pid,
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
            "--checklist",
            "sample_independence_verified,no_internal_slugs,sources_checked,"
            "claims_have_direct_evidence,no_duplicates_in_tables,"
            "meta_description_complete,cannibalization_checked,cta_contextual",
        ],
        env={"ALLOW_HUMAN_APPROVAL": "1"},
        clear_ci=False,
    )
    assert r.returncode != 0, r.stdout + r.stderr
    assert "material-hash" in (r.stderr + r.stdout).lower() or "hash" in (r.stderr + r.stdout).lower()
    assert REG.read_bytes() == before


def test_empty_reviewer_fails():
    pid = _pending_page()
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            pid,
            "APPROVED",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
        ]
    )
    assert r.returncode != 0
    assert REG.read_bytes() == before


def test_ci_env_blocks_approval():
    pid = _pending_page()
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            pid,
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
            "--checklist",
            "sample_independence_verified,no_internal_slugs,sources_checked,"
            "claims_have_direct_evidence,no_duplicates_in_tables,"
            "meta_description_complete,cannibalization_checked,cta_contextual",
            "--material-hash",
            "deadbeef",
        ],
        env={"CI": "true", "GITHUB_ACTIONS": "true", "ALLOW_HUMAN_APPROVAL": "1"},
        clear_ci=False,
    )
    assert r.returncode != 0, r.stdout + r.stderr
    assert REG.read_bytes() == before


def test_without_allow_human_approval_fails():
    pid = _pending_page()
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            pid,
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
            "--checklist",
            "sample_independence_verified,no_internal_slugs,sources_checked,"
            "claims_have_direct_evidence,no_duplicates_in_tables,"
            "meta_description_complete,cannibalization_checked,cta_contextual",
            "--material-hash",
            "deadbeef",
        ],
        env={},  # no ALLOW_HUMAN_APPROVAL
        clear_ci=True,
    )
    assert r.returncode != 0, r.stdout + r.stderr
    assert REG.read_bytes() == before


def test_bulk_comma_ids_fail():
    before = REG.read_bytes()
    r = _run(
        [
            "set",
            "page-a,page-b",
            "APPROVED",
            "--reviewer",
            "Maria Silva",
            "--notes",
            "Fontes e conteúdo conferidos com rigor adequado.",
            "--confirm",
        ]
    )
    assert r.returncode != 0
    assert REG.read_bytes() == before
