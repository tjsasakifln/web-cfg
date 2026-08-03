"""Structural + functional tests for inbound SEO engine deliverables."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def test_candidate_universe_min_300_and_fields() -> None:
    path = ROOT / "data" / "pseo" / "CANDIDATE-UNIVERSE.json"
    assert path.is_file(), "CANDIDATE-UNIVERSE.json missing — run discover_content_universe"
    univ = json.loads(path.read_text(encoding="utf-8"))
    assert univ["n_candidates"] >= 300
    assert "A" in univ["family_counts"]
    c = univ["candidates"][0]
    for k in (
        "candidate_id",
        "archetype",
        "proposed_url",
        "seo_opportunity_score",
        "status",
        "search_demand_unverified",
        "observation_count",
    ):
        assert k in c
    assert c["search_demand_unverified"] is True


def test_topic_graph_covers_60_domains() -> None:
    path = ROOT / "docs" / "editorial" / "SEO-TOPIC-GRAPH.json"
    assert path.is_file()
    g = json.loads(path.read_text(encoding="utf-8"))
    assert g["n_topics"] >= 60
    ids = {t["topic_id"] for t in g["topics"]}
    required = {
        "intel-selecao",
        "go-no-go",
        "reequilibrio",
        "glosa",
        "bdi",
        "sinapi",
        "sicro",
        "gestao-b2g",
        "relacao-fiscalizacao",
    }
    assert required.issubset(ids)
    for t in g["topics"]:
        assert t.get("pillar")
        assert t.get("service")
        assert t.get("question")


def test_intentions_and_briefs_thresholds() -> None:
    inv = json.loads((ROOT / "data" / "editorial" / "INTENTIONS.json").read_text(encoding="utf-8"))
    briefs = json.loads((ROOT / "data" / "editorial" / "BRIEFS-INDEX.json").read_text(encoding="utf-8"))
    assert inv["n_intentions"] >= 200
    assert briefs["n"] >= 80
    # sample brief file has required fields
    bid = briefs["briefs"][0]["brief_id"]
    bpath = ROOT / "data" / "editorial" / "BRIEFS" / f"{bid}.json"
    assert bpath.is_file()
    b = json.loads(bpath.read_text(encoding="utf-8"))
    for k in (
        "intention",
        "main_question",
        "outline",
        "official_sources",
        "cta",
        "internal_links",
        "update_criteria",
        "datalake_data",
    ):
        assert k in b


def test_approval_center_exists_no_auto_approve() -> None:
    html = (ROOT / "docs" / "review" / "TIAGO-SEO-APPROVAL-CENTER.html").read_text(encoding="utf-8")
    assert "APROVAR" in html
    assert "HUMAN_APPROVED" in html or "não" in html.lower()
    assert "approve_wave1_tiago" in html or "approve_cli" in html
    meta = json.loads(
        (ROOT / "docs" / "review" / "TIAGO-SEO-APPROVAL-CENTER.json").read_text(encoding="utf-8")
    )
    assert meta.get("auto_approves") is False


def test_national_manifest_denominators_honest() -> None:
    m = json.loads((ROOT / "data" / "pseo" / "manifest.json").read_text(encoding="utf-8"))
    counts = m.get("counts") or {}
    # After national ingest, expect multi-million available OR explicit local subset note
    avail = counts.get("national_records_available") or (m.get("denominators") or {}).get(
        "national_records_available"
    )
    assert avail is not None
    assert int(avail) >= 1_000_000 or counts.get("national_mode") is not True
    assert m.get("dataset_hash")
    assert m.get("source_commit_sha") or m.get("source_run_id")


def test_no_human_approved_stamped_by_engine_artifacts() -> None:
    """Engine-generated inventory must not claim HUMAN_APPROVED pages."""
    univ = json.loads((ROOT / "data" / "pseo" / "CANDIDATE-UNIVERSE.json").read_text(encoding="utf-8"))
    for c in univ["candidates"]:
        assert c.get("status") != "HUMAN_APPROVED"
        assert c.get("indexability_gate") == "human_approval_required"


def test_wave1_package_all_html_exists_no_phantoms() -> None:
    """Wave 1 review packet must only list real registry HTML (no phantom URLs)."""
    from pathlib import Path as P

    pkg_path = ROOT / "data" / "pseo" / "WAVE1-PACKAGE.json"
    assert pkg_path.is_file()
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    assert pkg["n"] >= 15
    assert pkg.get("all_html_exists") is True
    assert len(pkg.get("type_counts") or {}) >= 4
    for p in pkg["pages"]:
        url = p.get("url") or ""
        assert "unknown" not in url
        assert (ROOT / url.strip("/") / "index.html").is_file(), url
    # Approval center lists APROVAR for real package
    html = (ROOT / "docs" / "review" / "TIAGO-SEO-APPROVAL-CENTER.html").read_text(
        encoding="utf-8"
    )
    assert "APROVAR" in html
    # at least one wave URL appears
    assert any(p["url"] in html for p in pkg["pages"][:5])


def test_editorial_review_package_not_orphaned() -> None:
    """Approval-center editorial + hubs must be reachable from homepage."""
    g = json.loads((ROOT / "docs" / "seo" / "INTERNAL-LINK-GRAPH.json").read_text(encoding="utf-8"))
    assert g.get("n_editorial_review_orphans", 1) == 0
    assert g.get("n_wave1_review_orphans", 1) == 0
    assert g.get("n_intended_orphans", 1) == 0
    assert g.get("ok") is True
    nodes = {n["url"]: n for n in g.get("nodes") or []}
    for url in (
        "/guias-contratos-obras/",
        "/lei-14133-obras/",
        "/guias-contratos-obras/checklist-pedido-aditivo/",
        "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    ):
        n = nodes.get(url)
        assert n is not None, url
        assert n.get("depth_from_homepage") is not None, url
        assert n.get("orphan") is False, url
