"""Drive shipped consume/gate/render against the official-live 1.1 pack."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import (
    AUTHORIZED_ANALYSIS_ID,
    AUTHORIZED_DOSSIER_CONTENT_HASH,
    AUTHORIZED_LISTING_SHA256,
    AUTHORIZED_PDF_SHA256,
    AUTHORIZED_PRODUCER_COMMIT,
    AUTHORIZED_ROOT_CONTENT_HASH,
    CONTENT_CLASS_ANALYSIS,
    READY_FOR_HUMAN_REVIEW,
)
from scripts.contract_analysis.quality import DEPTH_REVIEW_REQUIRED, INDEX_READY_VERDICT
from scripts.contract_analysis.approval import material_hash
from scripts.contract_analysis.calc import official_brl_per_m2, published_value_per_area
from scripts.contract_analysis.consume import load_canary, load_extra_cli_bundle
from scripts.contract_analysis.gate import evaluate_cohort, evaluate_publication
from scripts.contract_analysis.handoff import HANDOFF_READY, inspect_handoff, verify_sha256sums
from scripts.contract_analysis.pdf_clauses import pages_14_15_contain_cited_clauses
from scripts.contract_analysis.render import (
    analysis_urls_in_sitemaps,
    render_analysis_html,
    sitemap_locs,
    write_sitemap,
)
from scripts.contract_analysis.review_packet import emit_review_packet, packet_complete

FIXTURE_PACK = ROOT / "scripts/contract_analysis/fixtures/official-live-01"
PROHIBITED = (
    "sobrepreço",
    "superfaturamento",
    "fraude",
    "má-fé",
    "incapacidade técnica",
    "ilegalidade",
    "CASO_CONFENGE",
    "case study",
    "customer success",
)


def _stage_rendezvous(tmp_path: Path) -> Path:
    dest = tmp_path / "contract-analysis" / "official-live-01"
    shutil.copytree(FIXTURE_PACK, dest, dirs_exist_ok=True)
    for extra in ("pdf-pages", "pdf-binding.json"):
        path = dest / extra
        if path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()
    return dest


def test_official_pack_verifies_with_shipped_handoff(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    ok, reasons = verify_sha256sums(dest)
    assert ok is True, reasons
    result = inspect_handoff()
    assert result["status"] == HANDOFF_READY
    assert result["producer_commit"] == AUTHORIZED_PRODUCER_COMMIT
    assert result["root_content_hash"] == AUTHORIZED_ROOT_CONTENT_HASH
    assert result["analysis_ids"] == [AUTHORIZED_ANALYSIS_ID]


def test_semantically_mutated_manifest_cannot_remain_handoff_ready(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    manifest_path = dest / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["consumer"] = "mutated-consumer"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ready_path = dest / "READY.json"
    ready = json.loads(ready_path.read_text(encoding="utf-8"))
    ready["manifest_sha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    ready_path.write_text(
        json.dumps(ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sums_path = dest / "SHA256SUMS.txt"
    rows = []
    for raw in sums_path.read_text(encoding="utf-8").splitlines():
        _digest, rel = raw.split(None, 1)
        rel = rel.strip()
        rows.append(f"{hashlib.sha256((dest / rel).read_bytes()).hexdigest()}  {rel}")
    sums_path.write_text("\n".join(rows) + "\n", encoding="utf-8")

    ok, reasons = verify_sha256sums(dest)
    assert ok, reasons
    result = inspect_handoff()
    assert result["status"] != HANDOFF_READY
    checked = next(row for row in result["checked"] if row["path"] == str(dest))
    assert checked["rendezvous_verified"] is True
    assert checked["hashes_ok"] is False
    assert "manifest_hash_unverified" in checked["reasons"]


def test_xor_ready_blocked(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    assert (dest / "READY.json").is_file()
    assert not (dest / "BLOCKED.json").exists()
    (dest / "BLOCKED.json").write_text(json.dumps({"status": "BLOCKED"}), encoding="utf-8")
    (dest / "READY.json").unlink()
    from scripts.contract_analysis.handoff import HANDOFF_BLOCKED

    result = inspect_handoff()
    assert result["status"] == HANDOFF_BLOCKED


def test_decimal_published_value_per_area():
    result = published_value_per_area("719177.48", "4710.00")
    assert result == Decimal("152.6916")
    assert official_brl_per_m2() == Decimal("152.6916")
    assert isinstance(result, Decimal)


def test_pages_14_15_from_hash_bound_extracts():
    binding = json.loads((FIXTURE_PACK / "pdf-binding.json").read_text(encoding="utf-8"))
    assert binding["pdf_sha256"] == AUTHORIZED_PDF_SHA256
    pages = {
        14: (FIXTURE_PACK / "pdf-pages" / "page-14.txt").read_text(encoding="utf-8"),
        15: (FIXTURE_PACK / "pdf-pages" / "page-15.txt").read_text(encoding="utf-8"),
    }
    ok, reasons = pages_14_15_contain_cited_clauses(pages)
    assert ok is True, reasons
    assert "12.2" in pages[14]
    assert "12.3" in pages[14]
    assert "Coluna 35" in pages[14]


def test_consume_official_pack_projects_locked_facts(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    bundle = load_canary()
    assert bundle["source_kind"] == "official_live"
    assert bundle["catalog_mode"] == "official_live"
    assert bundle["test_only"] is False
    assert bundle["evaluated"] == 1
    rec = bundle["records"][0]
    assert rec["id"] == AUTHORIZED_ANALYSIS_ID
    assert rec["content_hash"] == AUTHORIZED_DOSSIER_CONTENT_HASH
    assert rec["official_live"] is True
    assert rec["handoff_status"] == "HANDOFF_READY"
    assert rec["producer_publication_authorization"] is False
    assert rec["producer_index_authorization"] is False
    assert rec["approved_for_index"] is False
    assert rec["content_class"] == CONTENT_CLASS_ANALYSIS
    ficha = rec["ficha"]
    assert ficha["municipio_unidade_publicada"] == "Teresina"
    assert "São Gonçalo do Piauí" in (ficha.get("municipio_objeto_publicado") or ficha.get("objeto") or "")
    assert any("152.6916" in str(item.get("result") or item.get("text")) for item in rec["calculations"])
    listing_bound = any(
        item.get("sha256") == AUTHORIZED_LISTING_SHA256 for item in rec.get("sources") or []
    ) or any(item.get("sha256") == AUTHORIZED_LISTING_SHA256 for item in rec.get("facts") or [])
    pdf_bound = any(
        item.get("sha256") == AUTHORIZED_PDF_SHA256 for item in (rec.get("sources") or []) + (rec.get("facts") or [])
    )
    assert listing_bound
    assert pdf_bound


def test_fixture_pack_cannot_become_official_live():
    fixture = ROOT / "scripts/contract_analysis/fixtures/extra-cli-export"
    rec = load_extra_cli_bundle(fixture)["records"][0]
    rec["official_live"] = True
    rec["claimed_live"] = True
    rec["approved_for_index"] = True
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert rec["is_fixture"] is True or rec["catalog_mode"] == "fixture"


def test_gate_is_publishable_noindex_never_index(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    bundle = load_canary()
    decisions = evaluate_cohort(bundle["records"])
    assert len(decisions) == 1
    decision = decisions[0]
    assert decision.analysis_id == AUTHORIZED_ANALYSIS_ID
    assert decision.state == "PUBLISHABLE_NOINDEX"
    assert decision.state != "PUBLISHABLE_INDEX"
    assert decision.indexable is False
    assert decision.sitemap is False
    assert "noindex,nofollow" in decision.robots
    assert decision.human_review_status == READY_FOR_HUMAN_REVIEW
    quality = decision.quality or {}
    assert quality.get("review_verdict") in {INDEX_READY_VERDICT, DEPTH_REVIEW_REQUIRED}
    assert quality.get("review_verdict") != "REJECT"
    assert not any(
        isinstance(item, dict) and item.get("severity") == "P0" for item in (quality.get("findings") or [])
    )
    rec = bundle["records"][0]
    assert rec.get("producer_index_authorization") is False
    assert rec.get("publication_authorization") in {None, False}
    assert rec.get("thesis")
    assert rec.get("citation_text")
    assert rec.get("correction_route")


def test_render_hashes_stable_and_visible(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    rec = load_canary()["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html1 = render_analysis_html(rec, decision)
    html2 = render_analysis_html(rec, decision)
    assert html1 == html2
    h1 = hashlib.sha256(html1.encode("utf-8")).hexdigest()
    h2 = hashlib.sha256(html2.encode("utf-8")).hexdigest()
    assert h1 == h2
    m1 = material_hash(rec)
    m2 = material_hash(rec)
    assert m1 == m2
    assert "noindex,nofollow" in html1
    assert CONTENT_CLASS_ANALYSIS in html1 or "ANÁLISE TÉCNICA DE CONTRATO PÚBLICO" in html1
    assert "Teresina" in html1
    assert "São Gonçalo do Piauí" in html1
    assert "Coluna 35" in html1
    assert "12.2" in html1 and "12.3" in html1
    assert "152.6916" in html1 or "152,6916" in html1
    assert "valor global" in html1.lower() or "valor_global" in html1.lower()
    assert "caso confenge" in html1.lower()
    cannot = rec.get("cannot_conclude") or ""
    assert cannot.lower().startswith("não se afirma") or "não se afirma" in cannot.lower()
    for lemma in ("sobrepreço", "superfaturamento", "fraude", "má-fé"):
        if lemma in html1.lower() or lemma in html1:
            assert "não se afirma" in html1.lower()


def test_official_slug_absent_from_sitemaps(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    rec = load_canary()["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    assert decision.state != "PUBLISHABLE_INDEX"
    assert sitemap_locs([(rec, decision)]) == []
    write_sitemap([(rec, decision)])
    isolated = Path(__import__("os").environ["CONFENGE_CONTRACT_ANALYSIS_ROOT"])
    written = isolated / "sitemap-analises-contratos.xml"
    if written.is_file():
        text = written.read_text(encoding="utf-8")
        assert rec["slug"] not in text
        assert AUTHORIZED_ANALYSIS_ID not in text
    members = analysis_urls_in_sitemaps(isolated)
    assert rec["slug"] not in " ".join(members)


def test_review_packet_hash_bound_not_approval(tmp_path, monkeypatch):
    dest = _stage_rendezvous(tmp_path)
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(tmp_path))
    rec = load_canary()["records"][0]
    decision = evaluate_publication(rec, cohort=[rec])
    html = render_analysis_html(rec, decision)
    packet = emit_review_packet(rec, decision, rendered_html=html, root=tmp_path)
    assert packet_complete(packet)
    founder = (packet / "FOUNDER_DECISION_REQUIRED.txt").read_text(encoding="utf-8")
    assert "APPROVE_FOR_INDEX_FOLLOWUP" in founder
    assert "REJECT_WITH_REASON" in founder
    assert "PUBLISHABLE_NOINDEX" in founder
    review = (packet / "REVIEW.md").read_text(encoding="utf-8")
    assert READY_FOR_HUMAN_REVIEW in review or "READY_FOR_HUMAN_REVIEW" in review
    assert "approve_one" in review
    activation = json.loads((packet / "activation-plan.json").read_text(encoding="utf-8"))
    assert activation["applied"] is False
    assert activation["forbidden_in_this_campaign"] is True
    assert rec.get("approved_for_index") is False
