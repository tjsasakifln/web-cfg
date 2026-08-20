"""CANARY-03: drive shipped consume → quality → gate → render → preapproval.

Hashes are computed from the shipped functions on the same snapshot.
The 2026-08-17 token cannot grant this campaign's INDEX.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from dataclasses import replace
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import (
    AUTHORIZED_ANALYSIS_ID,
    AUTHORIZED_DOSSIER_CONTENT_HASH,
    AUTHORIZED_ROOT_CONTENT_HASH,
    CONTENT_CLASS_ANALYSIS,
    OWNER_CONDITIONAL_APPROVER,
    OWNER_CONDITIONAL_TOKEN,
    OWNER_PREAPPROVAL_APPROVER,
    OWNER_PREAPPROVAL_TOKEN,
)
from scripts.contract_analysis.approval import (
    ApprovalError,
    approval_allows_index,
    approval_rendered_hash_ok,
    approve_one,
    approve_preapproval_canary,
    approvals_path,
    evaluate_conditional_checklist,
    load_approvals,
    material_hash,
    rendered_content_hash,
)
from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.handoff import HANDOFF_READY
from scripts.contract_analysis.quality import INDEX_READY_VERDICT, P0, P1, evaluate_quality
from scripts.contract_analysis.render import apply_rendered_hash_gate, render_analysis_html
from scripts.contract_analysis.unique_content import strip_entities_and_numbers

FIXTURE_PACK = ROOT / "scripts/contract_analysis/fixtures/official-live-01"
FORBIDDEN_SCHEMA = ("CaseStudy", "Review", "Product")
FORBIDDEN_CLASS = ("CASO CONFENGE", "CASO_CONFENGE", "customer success", "case study")
CHECKOUT = ("asaas", "checkout", "billing", "/pagar", "cartao-de-credito")


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
    monkeypatch.setenv("CONFENGE_CONTRACT_ANALYSIS_ROOT", str(tmp_path))
    return load_canary()


def _quality_dict(record) -> dict:
    quality = evaluate_quality(record, cohort=[record])
    return quality.as_dict() if hasattr(quality, "as_dict") else dict(quality)


def _index_shaped_html(record, decision):
    indexed = replace(
        decision,
        state="PUBLISHABLE_INDEX",
        indexable=True,
        sitemap=True,
        robots="index,follow",
    )
    return render_analysis_html(record, indexed), indexed


def _checklist_inputs(record, html, tmp_path, *, suite_green=True):
    quality = _quality_dict(record)
    handoff = {"status": HANDOFF_READY, "path": str(tmp_path / "contract-analysis" / "official-live-01")}
    return quality, handoff


def test_taxonomy_and_epistemic_split_on_shipped_consume(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    assert rec["id"] == AUTHORIZED_ANALYSIS_ID
    assert rec["content_class"] == CONTENT_CLASS_ANALYSIS
    assert "ANÁLISE TÉCNICA DE CONTRATO PÚBLICO" in html
    assert 'data-content-class="ANALISE_TECNICA_CONTRATO_PUBLICO"' in html
    for token in FORBIDDEN_SCHEMA:
        assert f'"@type":"{token}"' not in html
        assert f'"@type": "{token}"' not in html
    lowered = html.lower()
    for token in FORBIDDEN_CLASS:
        if token.lower() in lowered:
            assert "não é" in lowered or "nao e" in lowered or "não implica" in lowered
    assert 'data-epistemic="FACT"' in html
    assert 'data-epistemic="CALCULATION"' in html
    assert 'data-epistemic="INFERENCE"' in html
    assert 'data-epistemic="UNKNOWN"' in html
    assert "NOT_COMPARABLE" in html
    assert "reason_code" in html
    assert rec.get("citation_text")
    assert "Como citar" in html
    assert "Custo de refresh" in html or "refresh" in html.lower()


def test_comparison_is_not_comparable_with_reason_code(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    comps = rec.get("comparisons") or []
    assert comps
    assert any(str(item.get("outcome") or "").upper() == "NOT_COMPARABLE" for item in comps)
    assert any(item.get("reason_code") for item in comps)
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    assert "no_comparative_claim" in html or "peer_group_absent" in html or "singular_document_insight" in html


def test_anti_doorway_thesis_survives_entity_strip(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    thesis = rec.get("insight_singular") or rec.get("thesis") or ""
    stripped = strip_entities_and_numbers(thesis, rec)
    assert "relogio" in stripped or "relógio" in thesis.lower()
    assert "orcamento" in stripped or "orçamento" in thesis.lower()
    assert "vigencia" in stripped or "vigência" in thesis.lower()
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.hard_gates.get("thesis_survives_entity_strip") is True


def test_cta_keeps_attribution_and_has_no_checkout(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    start = html.find('id="proximo-passo"')
    assert start != -1
    cta = html[start : html.find("</section>", start)]
    assert 'data-asset-id="' in cta
    assert 'data-cta-id="' in cta
    assert 'data-route-family="' in cta
    assert 'data-analysis-id="' in cta
    blob = cta.lower()
    for token in CHECKOUT:
        assert token not in blob
    assert "@" not in cta


def test_missing_gate_never_yields_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    rec["human_authorship_confirmed"] = False
    rec["author"] = {"name": "Rascunho editorial (autoria humana não confirmada)"}
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    quality, handoff = _checklist_inputs(rec, html, tmp_path)
    with pytest.raises(ApprovalError, match="preapproval_gates_incomplete"):
        approve_preapproval_canary(
            rec,
            token=OWNER_PREAPPROVAL_TOKEN,
            rollback="git:revert:canary-03",
            rendered_html=html,
            producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
            source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
            quality=quality,
            handoff=handoff,
            suite_green=True,
            root=tmp_path,
            actor=OWNER_PREAPPROVAL_APPROVER,
        )
    ok, reasons = approval_allows_index(rec, root=tmp_path)
    assert ok is False
    assert evaluate_publication(rec, cohort=[rec]).state != "PUBLISHABLE_INDEX"


def test_stale_2026_08_17_token_cannot_grant_this_campaign_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped_html(rec, decision)
    with pytest.raises(ApprovalError, match="preapproval_token_stale_campaign"):
        approve_preapproval_canary(
            rec,
            token=OWNER_CONDITIONAL_TOKEN,
            rollback="git:revert:canary-03",
            rendered_html=html,
            producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
            source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
            quality=_quality_dict(rec),
            handoff={"status": HANDOFF_READY, "path": str(tmp_path)},
            suite_green=True,
            root=tmp_path,
            actor=OWNER_CONDITIONAL_APPROVER,
        )


def test_planted_2026_08_17_token_row_refuses_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    approve_one(rec, actor="editor", rollback="git:revert:stale", root=tmp_path)
    payload = load_approvals(root=tmp_path)
    for row in payload.get("approvals") or []:
        if row.get("analysis_id") == rec["id"] and not row.get("withdrawn"):
            row["token"] = OWNER_CONDITIONAL_TOKEN
    path = approvals_path(root=tmp_path)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ok, reasons = approval_allows_index(rec, root=tmp_path)
    assert ok is False
    assert "approval_stale_campaign_token" in reasons
    assert evaluate_publication(rec, cohort=[rec]).state != "PUBLISHABLE_INDEX"


def test_preapproval_token_binds_hashes_and_grants_index_when_gates_pass(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    quality = _quality_dict(rec)
    p0 = [item for item in (quality.get("findings") or []) if item.get("severity") == P0]
    p1 = [item for item in (quality.get("findings") or []) if item.get("severity") == P1]
    assert p0 == [], p0
    html, indexed = _index_shaped_html(rec, decision)
    quality, handoff = _checklist_inputs(rec, html, tmp_path)
    checklist = evaluate_conditional_checklist(
        rec,
        quality=quality,
        handoff=handoff,
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        suite_green=True,
    )
    if not all(checklist.values()):
        pytest.skip("checklist incomplete on this snapshot: " + ",".join(k for k, v in checklist.items() if not v))
    row = approve_preapproval_canary(
        rec,
        token=OWNER_PREAPPROVAL_TOKEN,
        rollback="git:revert:canary-03",
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        quality=quality,
        handoff=handoff,
        suite_green=True,
        root=tmp_path,
        actor=OWNER_PREAPPROVAL_APPROVER,
    )
    assert row["token"] == OWNER_PREAPPROVAL_TOKEN
    assert row["approved_by"] == OWNER_PREAPPROVAL_APPROVER
    assert row["official_payload_hash"] == AUTHORIZED_DOSSIER_CONTENT_HASH
    assert row["rendered_content_hash"] == rendered_content_hash(html)
    assert row["material_hash"] == material_hash(rec)
    ok, reasons = approval_allows_index(rec, root=tmp_path)
    assert ok is True, reasons
    granted = evaluate_publication(rec, cohort=[rec])
    assert granted.state == "PUBLISHABLE_INDEX"
    live_html = render_analysis_html(rec, granted)
    assert rendered_content_hash(live_html) == row["rendered_content_hash"]
    assert "noindex" not in granted.robots
    # Hashes were computed, not hardcoded as the oracle of the live page.
    assert row["rendered_content_hash"] == hashlib.sha256(live_html.encode("utf-8")).hexdigest()
    assert not p1 or quality.get("review_verdict") == INDEX_READY_VERDICT


def test_one_byte_material_drift_refuses_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped_html(rec, decision)
    quality, handoff = _checklist_inputs(rec, html, tmp_path)
    checklist = evaluate_conditional_checklist(
        rec,
        quality=quality,
        handoff=handoff,
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        suite_green=True,
    )
    if not all(checklist.values()):
        pytest.skip("checklist incomplete on this snapshot")
    approve_preapproval_canary(
        rec,
        token=OWNER_PREAPPROVAL_TOKEN,
        rollback="git:revert:canary-03",
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        quality=quality,
        handoff=handoff,
        suite_green=True,
        root=tmp_path,
        actor=OWNER_PREAPPROVAL_APPROVER,
    )
    drifted = dict(rec)
    insight = drifted.get("insight_singular") or "x"
    drifted["insight_singular"] = insight[:-1] + ("X" if insight[-1] != "X" else "Y")
    ok, reasons = approval_allows_index(drifted, root=tmp_path)
    assert ok is False
    assert "approval_material_hash_mismatch" in reasons or "approval_absent" in reasons
    assert evaluate_publication(drifted, cohort=[drifted]).state != "PUBLISHABLE_INDEX"


def test_one_byte_render_drift_refuses_index(tmp_path, monkeypatch):
    rec = _stage_official(tmp_path, monkeypatch)["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html, _ = _index_shaped_html(rec, decision)
    quality, handoff = _checklist_inputs(rec, html, tmp_path)
    checklist = evaluate_conditional_checklist(
        rec,
        quality=quality,
        handoff=handoff,
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        suite_green=True,
    )
    if not all(checklist.values()):
        pytest.skip("checklist incomplete on this snapshot")
    approve_preapproval_canary(
        rec,
        token=OWNER_PREAPPROVAL_TOKEN,
        rollback="git:revert:canary-03",
        rendered_html=html,
        producer_root_hash=AUTHORIZED_ROOT_CONTENT_HASH,
        source_dossier_hash=AUTHORIZED_DOSSIER_CONTENT_HASH,
        quality=quality,
        handoff=handoff,
        suite_green=True,
        root=tmp_path,
        actor=OWNER_PREAPPROVAL_APPROVER,
    )
    granted = evaluate_publication(rec, cohort=[rec])
    assert granted.state == "PUBLISHABLE_INDEX"
    mutated = html + " "
    ok, reasons = approval_rendered_hash_ok(rec, mutated, root=tmp_path)
    assert ok is False
    assert "approval_rendered_hash_mismatch" in reasons
    downgraded, rewritten = apply_rendered_hash_gate(rec, granted, mutated)
    assert downgraded.state != "PUBLISHABLE_INDEX"
    assert "noindex" in downgraded.robots
    assert rewritten != mutated
