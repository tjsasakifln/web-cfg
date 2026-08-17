"""Drive shipped quality/gate/approval/render/review-packet on the 30 cases."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis.approval import ApprovalError, approve_many, approve_one
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.invalidate import apply_correction, apply_fast_withdraw, apply_refresh
from scripts.contract_analysis.quality import (
    DEPTH_REVIEW_REQUIRED,
    HUMAN_REVIEW_PENDING,
    INDEX_READY_VERDICT,
    evaluate_quality,
    non_boilerplate_word_count,
)
from scripts.contract_analysis.render import DRAFT_AUTHOR, render_analysis_html
from scripts.contract_analysis.review_packet import emit_review_packet, packet_complete
from scripts.contract_analysis.tests.helpers import complete_live_record, entity_swap_clone, masterpiece_record


def _codes(result) -> set[str]:
    return {f.code for f in result.findings}


def test_01_pncp_paraphrase_rejected():
    rec = complete_live_record(
        thesis="Este contrato é relevante porque tem valor elevado.",
        insight_singular="Este contrato é relevante para o mercado público local.",
        executive_summary="A empresa no órgão do município executa o objeto pelo valor publicado.",
        why_analysis="Contrato de grande valor.",
        utility_beyond_source="Ver empresa órgão município números no PNCP.",
        pncp_paraphrase=True,
        thesis_falsifiable=False,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert quality.review_verdict == "REJECT"
    assert "pncp_paraphrase" in _codes(quality) or not quality.hard_gates["not_pncp_paraphrase"]


def test_02_large_contract_without_thesis_rejected():
    rec = complete_live_record(
        thesis="Tem valor elevado.",
        insight_singular="Contrato de grande valor merece atenção.",
        thesis_falsifiable=False,
        ficha={
            **complete_live_record()["ficha"],
            "valor_label": "R$ 400.000.000,00",
        },
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "thesis_absent_or_generic" in _codes(quality)


def test_03_filler_2500_words_rejected():
    filler = " ".join(
        ["O contrato público de licitação pública e análise técnica segue o edital PNCP."] * 280
    )
    rec = complete_live_record(
        body=filler,
        executive_summary=filler[:400],
        keyword_stuffing=True,
        padding_sections=True,
        claims=[{"claim_id": "only", "text": "Há um contrato.", "source_ref": "x", "locator": "y"}],
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.non_boilerplate_words >= 2500 or quality.review_verdict == "REJECT"
    assert quality.review_verdict == "REJECT"
    assert "filler" in _codes(quality) or "long_low_density" in _codes(quality)


def test_04_short_dense_gets_depth_review_not_auto_advance():
    rec = masterpiece_record(body="Texto denso e curto sobre deslocamento de âncora de preço residual.")
    assert non_boilerplate_word_count(rec) < 1500
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    if quality.hard_gates_all and quality.score >= 90:
        assert quality.review_verdict == DEPTH_REVIEW_REQUIRED
    else:
        assert quality.depth_review_required is True


def test_05_claim_without_locator():
    rec = masterpiece_record(
        claims=[
            {
                "claim_id": "bare",
                "kind": "FACT",
                "text": "Há um aditivo material sem qualquer locator.",
            }
        ],
        source_claim_matrix=[],
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "claim_without_locator" in _codes(quality)
    assert not quality.hard_gates["material_claims_sourced"]


def test_06_calculation_without_unit():
    rec = masterpiece_record(
        calculations=[
            {
                "kind": "CALCULATION",
                "text": "A variação foi 12 sem dimensão explícita.",
                "reproducible": True,
                "formula": "12",
            }
        ]
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "calculation_without_unit" in _codes(quality)


def test_07_unreproducible_calculation():
    rec = masterpiece_record(
        calculations=[
            {
                "kind": "CALCULATION",
                "text": "O impacto econômico é 1800000 BRL.",
                "unit": "BRL",
                "period": "2024",
                "base": "saldo",
            }
        ]
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "calculation_unreproducible" in _codes(quality)


def test_08_inference_labeled_as_fact():
    rec = masterpiece_record(
        facts=[
            {
                "kind": "FACT",
                "text": "Interpretação técnica CONFENGE: inferimos que o aditivo causou prejuízo.",
                "source_ref": "x",
                "locator": "y",
                "claim_id": "bad",
            }
        ],
        epistemic_collapse=True,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "inference_as_fact" in _codes(quality)


def test_09_informal_comparison():
    rec = masterpiece_record(
        comparisons=[{"text": "Mais caro que o contrato vizinho.", "peer_id": "x"}],
        comparability_authorized=False,
        informal_comparison=True,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "informal_comparison" in _codes(quality)


def test_10_counterproof_omitted():
    rec = masterpiece_record(counterproof="")
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "counterproof_omitted" in _codes(quality)


def test_11_improper_causality():
    rec = masterpiece_record(
        interpretation=[
            {
                "kind": "INFERENCE",
                "text": "O aditivo causou prejuízo e portanto causou perda de margem da contratada.",
            }
        ],
        improper_causality=True,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "improper_causality" in _codes(quality)


def test_12_atypical_to_irregular():
    rec = masterpiece_record(
        interpretation=[{"kind": "INFERENCE", "text": "A composição é atípica e portanto irregular."}]
    )
    decision = evaluate_publication(rec, cohort=[rec])
    quality = evaluate_quality(rec, cohort=[rec])
    assert decision.state == "REJECT"
    assert "atipico_as_irregular" in _codes(quality)


def test_13_accusation():
    rec = masterpiece_record(
        interpretation=[{"kind": "INFERENCE", "text": "Há fraude e ilegalidade no aditivo."}]
    )
    decision = evaluate_publication(rec, cohort=[rec])
    quality = evaluate_quality(rec, cohort=[rec])
    assert decision.state == "REJECT"
    assert "accusation" in _codes(quality)


def test_14_near_duplicate():
    rec = masterpiece_record()
    clone = entity_swap_clone(rec)
    clone["id"] = "clone-masterpiece"
    clone["slug"] = "clone-masterpiece"
    quality = evaluate_quality(rec, cohort=[rec, clone])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "near_duplicate" in _codes(quality)


def test_15_boilerplate_over_20():
    boiler = (
        "Análise técnica de contrato público. Não é caso CONFENGE. Não é case de cliente. "
        "Não é customer success. Não é review. Não é parecer jurídico. "
    ) * 40
    rec = masterpiece_record(body=boiler, executive_summary=boiler[:200])
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert quality.boilerplate_ratio > 0.20 or "boilerplate_over_20" in _codes(quality)


def test_16_keyword_stuffing():
    rec = masterpiece_record(keyword_stuffing=True)
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "keyword_stuffing" in _codes(quality)


def test_17_generic_title_meta():
    rec = masterpiece_record(
        title="Análise técnica de contrato público",
        meta_description="Análise técnica de contrato público",
        h1="Análise técnica de contrato público",
        generic_intro=True,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "generic_title_meta" in _codes(quality)


def test_18_schema_not_visible():
    rec = masterpiece_record(schema_not_visible=True)
    quality = evaluate_quality(rec, cohort=[rec], schema=[{"description": "texto que nunca aparece na página"}])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "schema_not_visible" in _codes(quality)


def test_19_decorative_chart():
    rec = masterpiece_record(charts=[{"decorative": True, "alt": "onda azul"}])
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "decorative_chart" in _codes(quality)


def test_20_missing_alt():
    rec = masterpiece_record(charts=[{"useful": True, "alt": ""}])
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "alt_missing" in _codes(quality)


def test_21_fixture_as_live():
    rec = masterpiece_record(
        catalog_mode="fixture",
        claimed_live=True,
        reason_codes=["fixture_as_live"],
        is_fixture=True,
        test_only=True,
    )
    decision = evaluate_publication(rec, cohort=[rec])
    quality = evaluate_quality(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "fixture_as_live" in _codes(quality)


def test_22_divergent_hash():
    rec = masterpiece_record(content_hash_verified=False, hash_divergent=True)
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "divergent_or_missing_hash" in _codes(quality)


def test_23_unconfirmed_human_authorship():
    rec = masterpiece_record(
        author={"name": "Engº Tiago Sasaki"},
        human_authorship_confirmed=False,
        editorial_status="pending",
        approved_for_index=False,
    )
    quality = evaluate_quality(rec, cohort=[rec])
    html = render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "unconfirmed_human_authorship" in _codes(quality)
    assert DRAFT_AUTHOR in html
    byline_at = html.find('class="authority-byline"')
    byline = html[byline_at : byline_at + 500] if byline_at >= 0 else ""
    assert "Engº Tiago Sasaki" not in byline


def test_24_mass_approval_forbidden():
    rec = masterpiece_record()
    with pytest.raises(ApprovalError, match="mass_approval_forbidden"):
        approve_many([rec, rec])


def test_25_index_without_individual_approval():
    rec = masterpiece_record(approved_for_index=False)
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.indexable is False


def test_26_invalidation_and_freshness(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:x", root=tmp_path)
    rec["approved_for_index"] = False
    refreshed = apply_refresh(rec, evidence_pack_version="9.0", content_hash="new")
    assert evaluate_publication(refreshed, cohort=[refreshed]).state != "PUBLISHABLE_INDEX"
    corrected = apply_correction(rec, {"date": "2026-08-17", "text": "correção"})
    assert evaluate_publication(corrected, cohort=[corrected]).state != "PUBLISHABLE_INDEX"


def test_27_rollback(tmp_path):
    rec = complete_live_record()
    approve_one(rec, actor="editor", rollback="git:x", root=tmp_path)
    withdrawn = apply_fast_withdraw(rec, reason="rollback", actor="editor", root=tmp_path)
    assert evaluate_publication(withdrawn, cohort=[withdrawn]).state != "PUBLISHABLE_INDEX"


def test_28_mobile_accessibility_on_render():
    rec = masterpiece_record()
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    quality = evaluate_quality(rec, cohort=[rec], rendered_html=html)
    assert "<h1>" in html
    assert "skip-link" in html or quality.hard_gates["mobile_accessible"]
    assert 'lang="pt-BR"' in html
    assert "scope=" in html


def test_29_collapses_after_entity_strip():
    rec = complete_live_record(
        title="Contrato",
        executive_summary="A empresa X no órgão Y do município Z vale 10.",
        why_analysis="Números.",
        insight_singular="A empresa no órgão do município tem valor.",
        utility_beyond_source="Ver empresa órgão município números.",
        thesis="A empresa no órgão do município tem valor.",
        body="Empresa órgão município 10.",
        facts=[{"kind": "FACT", "text": "Empresa órgão município 10."}],
        calculations=[],
        interpretation=[],
        cannot_conclude="Nada.",
        methodology="Ler.",
        limitations="Pouca coisa.",
    )
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert "collapses_after_entity_strip" in _codes(quality)


def test_30_masterpiece_stops_at_human_review_pending(tmp_path):
    rec = masterpiece_record()
    quality = evaluate_quality(rec, cohort=[rec])
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    quality_html = evaluate_quality(rec, cohort=[rec], rendered_html=html)
    assert quality.review_verdict == INDEX_READY_VERDICT, (quality.score, quality.dimensions, quality.findings, quality.hard_gates)
    assert quality.score >= 90
    assert min(quality.dimensions.values()) >= 80
    assert quality.hard_gates_all is True
    assert not any(f.severity in {"P0", "P1"} for f in quality.findings)
    assert quality_html.review_verdict == INDEX_READY_VERDICT
    assert decision.state == "PUBLISHABLE_NOINDEX"
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.human_review_status == HUMAN_REVIEW_PENDING
    assert decision.review_recommendation == INDEX_READY_VERDICT
    assert decision.indexable is False
    assert "noindex" in decision.robots
    assert "Rascunho editorial noindex" in html
    assert "HUMAN_REVIEW_PENDING" in html
    byline_at = html.find('class="authority-byline"')
    byline = html[byline_at : byline_at + 500] if byline_at >= 0 else ""
    assert DRAFT_AUTHOR in byline
    assert "Engº Tiago Sasaki" not in byline
    dest = emit_review_packet(rec, decision, rendered_html=html, root=tmp_path)
    assert packet_complete(dest)
    activation = json.loads((dest / "activation-plan.json").read_text(encoding="utf-8"))
    assert activation["applied"] is False
    assert activation["forbidden_in_this_campaign"] is True
    # Campaign artifact path never becomes INDEX.
    assert rec.get("approved_for_index") is False


def test_score_does_not_compensate_failed_hard_gate():
    rec = masterpiece_record(counterproof="", informal_comparison=True)
    quality = evaluate_quality(rec, cohort=[rec])
    assert quality.review_verdict != INDEX_READY_VERDICT
    assert quality.hard_gates_all is False


def test_campaign_never_writes_publishable_index_on_masterpiece():
    rec = masterpiece_record()
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
