"""Drive the shipped striking-distance noindex gate (#127)."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.striking_distance import (
    DECISIONS_PATH,
    approval_errors,
    approval_payload_hash,
    evaluate_striking_distance,
    is_noindex,
    load_decisions,
    may_flip_index,
    page_material_hash,
)


def _delegated_row(tmp_path: Path) -> dict:
    rel = "conteudos/chuva/index.html"
    page = tmp_path / rel
    page.parent.mkdir(parents=True)
    page.write_text(
        '<html><head><meta content="noindex,follow" name="robots"></head>'
        '<body><main><h1>Material revisado</h1></main></body></html>',
        encoding="utf-8",
    )
    row = {
        "path": "/conteudos/chuva/",
        "html": rel,
        "decision": "REWRITE_THEN_INDEX",
        "canary": True,
        "rewrite_complete": True,
        "approve_cli_indexable": True,
    }
    approval = {
        "approval_type": "OWNER_DELEGATED_APPROVAL",
        "status": "INDEXABLE",
        "decision_authority": "owner / Tiago Sasaki",
        "material_author": "agente desta campanha / test fixture author",
        "reviewer_executor": "revisão adversarial independente / test fixture reviewer",
        "approval_basis": "owner-delegated review 2026-08-29",
        "approved_at": "2026-08-29",
        "manual_human_review": False,
        "material_hash": page_material_hash(row, tmp_path),
        "review_results": {
            "factual_legal_adversarial": True,
            "originality_anti_doorway": True,
            "query_ownership_cannibalization": True,
            "skeptical_visitor_copy_ux": True,
            "responsive_js_off_keyboard_accessibility": True,
        },
    }
    approval["approval_hash"] = approval_payload_hash(approval)
    row["approval"] = approval
    return row


def test_committed_decisions_release_only_the_approved_rain_canary():
    data = load_decisions()
    assert data["canary_cap"] == 1
    report = evaluate_striking_distance(data=data)
    assert report["ok"], report["fails"]
    target = "/conteudos/chuva-prorrogacao-prazo-obra-publica/"
    assert report["indexed_live"] == [target]
    assert report["decisions"]["/conteudos/chuva-prorrogacao-prazo-obra-publica/"] == (
        "REWRITE_THEN_INDEX"
    )
    assert report["decisions"]["/conteudos/aditivo-qualitativo-quantitativo/"] == (
        "KEEP_NOINDEX"
    )
    assert report["decisions"][
        "/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/"
    ] == "KEEP_NOINDEX"
    rows = {row["path"]: row for row in data["urls"]}
    target_html = (ROOT / rows[target]["html"]).read_text(encoding="utf-8")
    assert is_noindex(target_html) is False
    assert approval_errors(rows[target]) == []
    assert may_flip_index(rows[target]) is True
    for path in (
        "/conteudos/aditivo-qualitativo-quantitativo/",
        "/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/",
    ):
        row = rows[path]
        html = (ROOT / row["html"]).read_text(encoding="utf-8")
        assert is_noindex(html), row["path"]
        assert may_flip_index(row) is False


def test_indexed_canary_without_approve_cli_fails_closed():
    data = copy.deepcopy(load_decisions())
    data["urls"][0]["approve_cli_indexable"] = False
    report = evaluate_striking_distance(data=data)
    assert report["ok"] is False
    assert any("unauthorized_index" in f or "canary_indexed" in f for f in report["fails"])


def test_second_canary_exceeds_cap():
    data = copy.deepcopy(load_decisions())
    for row in data["urls"]:
        row["canary"] = True
    report = evaluate_striking_distance(data=data)
    assert report["ok"] is False
    assert "canary_cap_exceeded" in report["fails"]


def test_decisions_file_is_the_source():
    raw = json.loads(DECISIONS_PATH.read_text(encoding="utf-8"))
    assert raw["issue"] == 127
    assert len(raw["urls"]) == 3


def test_owner_delegated_approval_is_honest_hash_bound_and_allows_robots_flip(
    tmp_path: Path,
):
    row = _delegated_row(tmp_path)
    assert approval_errors(row, tmp_path) == []
    assert may_flip_index(row, tmp_path) is True

    page = tmp_path / row["html"]
    before_hash = page_material_hash(row, tmp_path)
    page.write_text(
        page.read_text(encoding="utf-8").replace("noindex,follow", "index,follow"),
        encoding="utf-8",
    )
    assert page_material_hash(row, tmp_path) == before_hash
    assert approval_errors(row, tmp_path) == []
    assert may_flip_index(row, tmp_path) is True


def test_owner_delegated_approval_cannot_claim_manual_human_review(tmp_path: Path):
    row = _delegated_row(tmp_path)
    row["approval"]["manual_human_review"] = True
    row["approval"]["approval_hash"] = approval_payload_hash(row["approval"])
    assert "owner_delegated_must_not_claim_manual_human_review" in approval_errors(
        row, tmp_path
    )
    assert may_flip_index(row, tmp_path) is False


def test_owner_delegated_approval_invalidates_after_material_change(tmp_path: Path):
    row = _delegated_row(tmp_path)
    page = tmp_path / row["html"]
    page.write_text(
        page.read_text(encoding="utf-8").replace("Material revisado", "Material alterado"),
        encoding="utf-8",
    )
    assert "approval_material_hash_mismatch" in approval_errors(row, tmp_path)
    assert may_flip_index(row, tmp_path) is False


def test_owner_delegated_approval_requires_every_substantive_review(tmp_path: Path):
    row = _delegated_row(tmp_path)
    row["approval"]["review_results"]["factual_legal_adversarial"] = False
    row["approval"]["approval_hash"] = approval_payload_hash(row["approval"])
    assert any(
        error.startswith("owner_delegated_review_incomplete")
        for error in approval_errors(row, tmp_path)
    )
    assert may_flip_index(row, tmp_path) is False


def test_self_approval_fails_closed_even_with_consistent_hashes(tmp_path: Path):
    """The author cannot also be the reviewer, no matter how tidy the hashes are.

    Regression for the #491 defect: OWNER_DELEGATED_APPROVAL let the same party
    that wrote the page also write its own PASS and compute the hashes that
    made that self-approval look valid. material_hash and approval_hash are
    both perfectly consistent here — the record still must fail closed because
    reviewer_executor equals material_author.
    """
    row = _delegated_row(tmp_path)
    row["approval"]["reviewer_executor"] = row["approval"]["material_author"]
    row["approval"]["approval_hash"] = approval_payload_hash(row["approval"])

    # Hash consistency alone is not enough: both hashes still validate.
    assert row["approval"]["material_hash"] == page_material_hash(row, tmp_path)
    assert row["approval"]["approval_hash"] == approval_payload_hash(row["approval"])

    errors = approval_errors(row, tmp_path)
    assert "self_approval_forbidden" in errors
    assert may_flip_index(row, tmp_path) is False


def test_self_approval_is_case_and_whitespace_insensitive(tmp_path: Path):
    """A cosmetically different but identical reviewer string still self-approves."""
    row = _delegated_row(tmp_path)
    row["approval"]["reviewer_executor"] = "  " + row["approval"]["material_author"].upper() + "  "
    row["approval"]["approval_hash"] = approval_payload_hash(row["approval"])
    assert "self_approval_forbidden" in approval_errors(row, tmp_path)
    assert may_flip_index(row, tmp_path) is False


def test_distinct_independent_reviewer_passes(tmp_path: Path):
    """Naming a reviewer distinct from the author is exactly what should pass."""
    row = _delegated_row(tmp_path)
    assert row["approval"]["material_author"] != row["approval"]["reviewer_executor"]
    assert approval_errors(row, tmp_path) == []
    assert may_flip_index(row, tmp_path) is True


def test_missing_material_author_fails_closed(tmp_path: Path):
    row = _delegated_row(tmp_path)
    del row["approval"]["material_author"]
    row["approval"]["approval_hash"] = approval_payload_hash(row["approval"])
    assert "missing_material_author" in approval_errors(row, tmp_path)
    assert may_flip_index(row, tmp_path) is False


def test_shipped_chuva_approval_names_an_independent_reviewer():
    """The real #127 record must not regress into naming itself as its own reviewer."""
    data = load_decisions()
    rows = {row["path"]: row for row in data["urls"]}
    approval = rows["/conteudos/chuva-prorrogacao-prazo-obra-publica/"]["approval"]
    assert approval["material_author"]
    assert approval["reviewer_executor"]
    assert approval["material_author"] != approval["reviewer_executor"]
    assert approval["manual_human_review"] is False
