"""Tests for Organic Opportunity Engine on the real shipped entry path."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.cohort import select_pilot
from scripts.organic.engine import build_opportunities, load_pseo_snapshot, run_engine
from scripts.organic.gates import indexability_quality_gate
from scripts.organic.score import CONTENT_VALUE_WEIGHTS, compute_content_value_score


PSEO = ROOT / "data" / "pseo"
GSC = ROOT / "seo" / "gsc-2026-07-30"


def test_weights_sum_100():
    assert sum(CONTENT_VALUE_WEIGHTS.values()) == 100


def test_score_prefers_bofu_and_service_fit():
    high = compute_content_value_score(
        intent_stage="bofu",
        service_fit=0.95,
        data_moat=0.6,
        demand_evidence=0.7,
        topical_authority=0.8,
        freshness_trigger=0.5,
        competitive_opportunity=0.5,
    )
    low = compute_content_value_score(
        intent_stage="tofu",
        service_fit=0.2,
        data_moat=0.1,
        demand_evidence=0.1,
        topical_authority=0.3,
        freshness_trigger=0.2,
        competitive_opportunity=0.2,
        penalties=["commodity_content", "thin_content"],
    )
    assert high["score"] > low["score"]
    assert high["score"] >= 55


def test_gate_blocks_high_score_without_provenance():
    g = indexability_quality_gate(
        distinct_intent=True,
        own_information=True,
        sample_size=50,
        semantic_differentiation=0.8,
        independent_utility=True,
        data_confidence=0.9,
        non_redundant=True,
        no_cannibalization=True,
        has_context_interpretation=True,
        identifiable_update=True,
        useful_internal_links=True,
        contextual_cta=True,
        has_provenance=False,
        content_value_score=95,
    )
    assert g["indexable"] is False
    assert "missing_provenance" in g["fails"]


def test_engine_on_live_pseo_snapshot():
    assert PSEO.exists(), "data/pseo must exist"
    snap = load_pseo_snapshot(PSEO)
    queries = []
    pages = []
    if (GSC / "Consultas.csv").exists():
        with (GSC / "Consultas.csv").open(encoding="utf-8") as f:
            queries = list(csv.DictReader(f))
    if (GSC / "Paginas.csv").exists():
        with (GSC / "Paginas.csv").open(encoding="utf-8") as f:
            pages = list(csv.DictReader(f))

    doc = build_opportunities(
        snap, gsc_queries=queries or None, gsc_pages=pages or None, as_of="2026-08-01"
    )
    assert doc["counts"]["total"] >= 5
    assert doc["counts"]["bofu"] >= 1
    # at least one opportunity with schema fields
    o0 = doc["opportunities"][0]
    for key in (
        "id",
        "topic",
        "cluster",
        "intent",
        "persona",
        "jtbd",
        "score",
        "action",
        "rationale",
        "publishability",
    ):
        assert key in o0
    # ordered by score desc
    scores = [o["score"] for o in doc["opportunities"]]
    assert scores == sorted(scores, reverse=True)
    # data-driven present if markets have enough sample
    markets = snap.get("markets") or []
    if any(int(m.get("contract_count") or 0) >= 8 for m in markets if isinstance(m, dict)):
        assert doc["counts"]["data_driven"] >= 1


def test_run_engine_writes_seo_opportunities(tmp_path: Path):
    out = tmp_path / "SEO_OPPORTUNITIES.json"
    doc = run_engine(pseo_dir=PSEO, out_path=out, as_of="2026-08-01")
    assert out.exists()
    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["schema_version"] == "seo-opportunities-v1"
    assert loaded["counts"]["total"] == doc["counts"]["total"]


def test_cli_run(tmp_path: Path):
    from scripts.organic.__main__ import main

    out = tmp_path / "SEO_OPPORTUNITIES.json"
    code = main(
        [
            "run",
            "--pseo-dir",
            str(PSEO),
            "--gsc-dir",
            str(GSC) if GSC.exists() else str(tmp_path),
            "--out",
            str(out),
            "--as-of",
            "2026-08-01",
        ]
    )
    assert code == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["counts"]["total"] > 0
    assert any(o["intent"] == "bofu" for o in data["opportunities"])


def test_cohort_diversity():
    snap = load_pseo_snapshot(PSEO)
    doc = build_opportunities(snap, as_of="2026-08-01")
    selected = select_pilot(doc["opportunities"], max_n=8)
    assert len(selected) >= 3
    slots = {s.get("cohort_slot") for s in selected}
    # at least two different slots
    assert len(slots) >= 2


def test_diagnosis_artifact():
    from scripts.organic.diagnosis import build_diagnosis

    d = build_diagnosis(ROOT)
    assert d["schema_version"] == "organic-diagnosis-v1"
    assert d["inventory"]["conteudos_html"] > 0
    assert d["gsc_baseline"]["total_impressions"] >= 0
    assert len(d["clusters"]) >= 5
    assert "markdown" in d
    assert "Gargalos" in d["markdown"] or "gargalos" in d["markdown"].lower()


def test_normative_editorial_not_unique_data_on_live_pseo():
    """Live problem_service rows are normative_editorial — must not be content moat."""
    from scripts.organic.engine import (
        _is_contract_aggregate_evidence,
        build_opportunities,
        load_pseo_snapshot,
    )

    snap = load_pseo_snapshot(PSEO)
    problems = snap.get("problem_service") or []
    if not problems:
        return
    # All current problem_service fixtures are normative_editorial
    for ps in problems:
        kind = str(ps.get("evidence_kind") or "")
        if kind == "normative_editorial":
            assert not _is_contract_aggregate_evidence(
                evidence_kind=kind,
                dataset=",".join(ps.get("sources") or []),
                sources=list(ps.get("sources") or []),
            )

    doc = build_opportunities(snap, as_of="2026-08-01")
    for o in doc["opportunities"]:
        if not o["id"].startswith("opp-ps-"):
            continue
        dl = o.get("datalake_evidence") or {}
        if str(dl.get("evidence_kind") or "") == "normative_editorial":
            assert o.get("unique_data_available") is False, o["id"]
            assert dl.get("public_label") == "editorial_pattern"
            assert dl.get("is_contract_aggregate") is False


def test_cohort_does_not_inject_contract_eyebrow_for_editorial():
    from scripts.organic.cohort import (
        FORBIDDEN_PUBLIC_FRAGMENTS,
        is_contract_aggregate_evidence,
        materialize_cohort_item,
        remove_organic_insight_blocks,
    )

    # Editorial pattern must not count as contract aggregate
    dl_editorial = {
        "evidence_kind": "normative_editorial",
        "dataset": "site-confenge-guides",
        "sources": ["site-confenge-guides"],
        "record_count": 48,
        "public_label": "editorial_pattern",
        "is_contract_aggregate": False,
        "methodology": "Padrão editorial-normativo.",
        "as_of": "2026-08-01",
    }
    assert is_contract_aggregate_evidence(dl_editorial) is False

    # Fake opportunity that previously would have poisoned HTML
    opp = {
        "id": "opp-ps-prob-test-editorial",
        "intent": "mofu",
        "action": "improve",
        "score": 60,
        "existing_url": "/conteudos/glosa-de-medicao-obra-publica/",
        "proposed_url": "/conteudos/glosa-de-medicao-obra-publica/",
        "unique_data_available": False,
        "datalake_evidence": dl_editorial,
        "suggested_cta": "Revisar medição",
        "service_fit": "medicoes-glosas-obras-publicas",
        "service_path": "/medicoes-glosas-obras-publicas/",
        "suggested_internal_links": ["/medicoes-glosas-obras-publicas/"],
        "indexability_gate": {"indexable": True, "decision": "indexable_candidate"},
    }
    # Ensure page starts without false insight
    path = ROOT / "conteudos/glosa-de-medicao-obra-publica/index.html"
    assert path.exists()
    html0 = remove_organic_insight_blocks(path.read_text(encoding="utf-8"))
    path.write_text(html0, encoding="utf-8")

    result = materialize_cohort_item(ROOT, opp, apply=True)
    html = path.read_text(encoding="utf-8")
    assert "Evidência de contratos públicos" not in html
    assert "Registros: 48" not in html
    assert "Contratos no recorte: 48" not in html
    assert "injected_contract_insight_block" not in result["changes"]

    # Market-style contract evidence SHOULD inject Portuguese contract eyebrow
    dl_market = {
        "evidence_kind": "market_benchmark",
        "dataset": "pncp_supplier_contracts",
        "sources": ["pncp_supplier_contracts"],
        "record_count": 24,
        "public_label": "contract_aggregate",
        "is_contract_aggregate": True,
        "methodology": (
            "Agregação de contratos com valor_total > 0 e arquétipo AEC no export."
        ),
        "as_of": "2026-08-01",
        "limitations": ["Amostra regional."],
    }
    assert is_contract_aggregate_evidence(dl_market) is True
    market_path = ROOT / "inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/index.html"
    if market_path.exists():
        market_path.write_text(
            remove_organic_insight_blocks(market_path.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        mopp = {
            "id": "opp-market-test",
            "intent": "tofu",
            "action": "improve",
            "score": 70,
            "existing_url": "/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/",
            "unique_data_available": True,
            "datalake_evidence": dl_market,
            "topic": "Analisamos 24 contratos no recorte SC.",
            "suggested_internal_links": ["/metodologia-inteligencia/"],
            "indexability_gate": {"indexable": True, "decision": "indexable_candidate"},
        }
        materialize_cohort_item(ROOT, mopp, apply=True)
        mhtml = market_path.read_text(encoding="utf-8")
        assert "Evidência de contratos públicos" in mhtml
        assert "Contratos no recorte: 24" in mhtml
        for frag in FORBIDDEN_PUBLIC_FRAGMENTS:
            if frag in ("datalake", "extra-cli"):
                assert frag not in mhtml.lower()


def test_radar_insight_methodology_not_english_on_disk():
    """Shipped radar insight must not contain English backstage methodology."""
    path = ROOT / "radar/edificacoes-publicas-pr/index.html"
    if not path.exists():
        return
    html = path.read_text(encoding="utf-8")
    assert "Open-status filter" not in html
    assert "never treat history as open" not in html.lower()
    if "data-organic-insight" in html:
        assert "Filtro de status aberto" in html or "editais" in html.lower()
