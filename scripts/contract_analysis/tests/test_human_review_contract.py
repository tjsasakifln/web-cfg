"""Shipped-path contract: READY_FOR_HUMAN_REVIEW cannot coexist with REJECT/P0.

Drives consume → quality → gate → review_packet from official-live-01 + overlay
and from knock-out records. Does not reimplement the gate.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import AUTHORIZED_ANALYSIS_ID, READY_FOR_HUMAN_REVIEW
from scripts.contract_analysis.approval import approval_allows_index
from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.quality import (
    DEPTH_REVIEW_REQUIRED,
    INDEX_READY_VERDICT,
    evaluate_quality,
    material_claims,
)
from scripts.contract_analysis.render import render_analysis_html
from scripts.contract_analysis.review_packet import (
    emit_review_packet,
    packet_hashes_match_rendered,
)
from scripts.contract_analysis.tests.helpers import masterpiece_record

FIXTURE_PACK = ROOT / "scripts/contract_analysis/fixtures/official-live-01"
ELIGIBLE_VERDICTS = {INDEX_READY_VERDICT, DEPTH_REVIEW_REQUIRED}
P0 = "P0"


def _stage_official(tmp_path, monkeypatch) -> dict:
    dest = tmp_path / "contract-analysis" / "official-live-01"
    shutil.copytree(FIXTURE_PACK, dest, dirs_exist_ok=True)
    for extra in ("pdf-pages", "pdf-binding.json"):
        path = dest / extra
        if path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    return load_canary()


def _quality_of(decision) -> dict:
    quality = decision.quality if isinstance(decision.quality, dict) else {}
    return quality


def _p0_codes(quality: dict) -> list[str]:
    return [
        str(item.get("code"))
        for item in (quality.get("findings") or [])
        if isinstance(item, dict) and item.get("severity") == P0
    ]


def test_official_live_ready_never_pairs_with_reject_or_p0(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    quality = _quality_of(decision)
    if decision.human_review_status == READY_FOR_HUMAN_REVIEW:
        assert quality.get("review_verdict") != "REJECT"
        assert quality.get("review_verdict") in ELIGIBLE_VERDICTS
        assert _p0_codes(quality) == []


def test_overlay_ready_flag_does_not_grant_ready_when_quality_rejects(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["editorial_status"] = "ready_for_human_review"
    rec["approved_for_index"] = False
    rec["thesis"] = "Este contrato é relevante."
    rec["thesis_falsifiable"] = False
    rec["citation_text"] = ""
    rec["correction_route"] = ""
    decision = evaluate_publication(rec, cohort=[rec])
    quality = _quality_of(decision)
    assert decision.state == "PUBLISHABLE_NOINDEX"
    assert quality.get("review_verdict") == "REJECT" or _p0_codes(quality)
    assert decision.human_review_status != READY_FOR_HUMAN_REVIEW


def test_ready_blocked_when_p0_finding_present(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["editorial_status"] = "ready_for_human_review"
    rec["approved_for_index"] = False
    rec["thesis"] = "Tem valor elevado."
    rec["thesis_falsifiable"] = False
    decision = evaluate_publication(rec, cohort=[rec])
    quality = _quality_of(decision)
    assert "thesis_absent_or_generic" in _p0_codes(quality)
    assert decision.human_review_status != READY_FOR_HUMAN_REVIEW


def test_official_material_claims_require_source_ref_and_locator(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    claims = material_claims(rec)
    assert claims, "official-live projection must expose material claims"
    quality = evaluate_quality(rec)
    unsourced = [
        item.get("claim_id")
        for item in claims
        if not (
            (item.get("source_ref") or item.get("source_id") or item.get("evidence_id") or item.get("source_refs"))
            and (item.get("locator") or item.get("locators"))
        )
    ]
    assert unsourced == [], unsourced
    assert quality.hard_gates["material_claims_sourced"] is True
    assert "claim_without_locator" not in {f.code for f in quality.findings}


def test_knockout_claim_without_source_and_locator_is_unsourced():
    rec = masterpiece_record()
    rec["claims"] = [
        {"claim_id": "orphan", "kind": "FACT", "text": "Afirmação material sem locator."},
    ]
    rec.pop("source_claim_matrix", None)
    quality = evaluate_quality(rec)
    assert quality.hard_gates["material_claims_sourced"] is False
    assert "claim_without_locator" in {f.code for f in quality.findings}


def test_canonical_object_requires_singular_falsifiable_thesis(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    thesis = str(rec.get("thesis") or "").strip()
    assert len(thesis) >= 80
    assert rec.get("thesis_falsifiable") is True
    quality = evaluate_quality(rec)
    assert quality.hard_gates["singular_falsifiable_thesis"] is True
    assert "thesis_absent_or_generic" not in {f.code for f in quality.findings}


def test_knockout_generic_thesis_on_canonical_object():
    rec = masterpiece_record(thesis="Este contrato é relevante.", insight_singular="Este contrato é relevante.", thesis_falsifiable=False)
    quality = evaluate_quality(rec)
    assert quality.hard_gates["singular_falsifiable_thesis"] is False
    assert "thesis_absent_or_generic" in {f.code for f in quality.findings}


def test_official_citation_text_and_correction_route_filled(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    assert str(rec.get("citation_text") or "").strip()
    assert str(rec.get("correction_route") or "").strip()
    quality = evaluate_quality(rec)
    assert quality.hard_gates["citation_text"] is True
    assert quality.hard_gates["correction_defined"] is True
    assert "citation_text_absent" not in {f.code for f in quality.findings}
    assert "correction_route_absent" not in {f.code for f in quality.findings}


def test_knockout_empty_citation_and_correction_fail_quality():
    rec = masterpiece_record(citation_text="", correction_route="")
    quality = evaluate_quality(rec)
    assert quality.hard_gates["citation_text"] is False
    assert quality.hard_gates["correction_defined"] is False
    codes = {f.code for f in quality.findings}
    assert "citation_text_absent" in codes
    assert "correction_route_absent" in codes


def test_packet_hashes_match_rendered_bytes(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    packet = emit_review_packet(rec, decision, rendered_html=html, root=tmp_path)
    assert packet_hashes_match_rendered(packet, rendered_html=html)
    (packet / "rendered-content.sha256").write_text("0" * 64 + "\n", encoding="utf-8")
    assert packet_hashes_match_rendered(packet, rendered_html=html) is False


def test_indexable_state_refused_when_approvals_empty(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["approved_for_index"] = True
    rec["editorial_status"] = "approved"
    rec.pop("material_hash", None)
    empty = tmp_path / "empty-approvals"
    empty.mkdir()
    (empty / "data" / "editorial" / "contract-analysis").mkdir(parents=True)
    (empty / "data" / "editorial" / "contract-analysis" / "approvals.json").write_text(
        json.dumps({"approvals": []}),
        encoding="utf-8",
    )
    allowed, reasons = approval_allows_index(rec, root=empty)
    assert allowed is False
    assert "approval_absent" in reasons or "approval_material_hash_absent" in reasons
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.indexable is False


def test_official_live_human_review_eligible_noindex(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    quality = _quality_of(decision)
    assert rec["id"] == AUTHORIZED_ANALYSIS_ID
    assert decision.state == "PUBLISHABLE_NOINDEX"
    assert decision.state != "PUBLISHABLE_INDEX"
    assert quality.get("review_verdict") in ELIGIBLE_VERDICTS
    assert _p0_codes(quality) == []
    if decision.human_review_status == READY_FOR_HUMAN_REVIEW:
        assert quality.get("review_verdict") in ELIGIBLE_VERDICTS
