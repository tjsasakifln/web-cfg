"""Semantic gates and editorial fixtures for the 15 known defects."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
import sys

sys.path.insert(0, str(ROOT))

from scripts.pseo.score import (
    semantic_agency_fails,
    semantic_price_fails,
    semantic_radar_fails,
    semantic_problem_fails,
    apply_human_review_gate,
    Candidate,
)
from scripts.pseo.editorial_audit import audit_page, run_editorial_audit


class TestSemanticGates(unittest.TestCase):
    def test_agency_caxias_like_rejects(self):
        a = {
            "agency_name": "MRS-PREFEITURA MUNICIPAL DE CAXIAS DO SUL",
            "contract_count": 49,
            "supplier_count": 1,
            "period_start": "2026-07-03",
            "period_end": "2026-07-03",
            "seasonality": [{"period": "2026-07", "contract_count": 49}],
            "sample_metrics": {
                "primary_contract_count": 36,
                "unique_supplier_count": 1,
                "temporal_span_days": 0,
                "max_single_day_share": 1.0,
                "exercise_count": 1,
            },
        }
        fails = semantic_agency_fails(a)
        self.assertTrue(any("ingestion_prefix" in f for f in fails))
        self.assertTrue(any("suppliers" in f for f in fails))
        self.assertTrue(any("temporal_span" in f for f in fails))
        self.assertTrue(any("max_single_day" in f for f in fails))

    def test_price_concentrated_rejects(self):
        p = {
            "observation_count": 19,
            "denominator_type": "contrato_integral",
            "period_start": "2026-07-03",
            "period_end": "2026-07-03",
            "public_examples": [
                {"orgao_nome": "MESMO", "valor": 1000},
                {"orgao_nome": "MESMO", "valor": 2000},
                {"orgao_nome": "MESMO", "valor": 3000},
            ],
            "sample_metrics": {
                "primary_contract_count": 19,
                "unique_buyer_count": 1,
                "unique_supplier_count": 1,
                "temporal_span_days": 0,
                "max_buyer_share": 1.0,
            },
        }
        fails = semantic_price_fails(p)
        self.assertTrue(any("buyer" in f for f in fails))

    def test_radar_contract_url_and_zero(self):
        o = {
            "open_count": 3,
            "duplicate_rate": 0,
            "items": [
                {"objeto": "a", "orgao_nome": "x", "data_encerramento": "2026-08-01", "valor_estimado": 0, "link_pncp": "https://pncp.gov.br/app/contratos/1/2026/1"},
                {"objeto": "b", "orgao_nome": "y", "data_encerramento": "2026-08-01", "valor_estimado": 10, "link_pncp": "https://pncp.gov.br/app/editais/1/2026/1", "value_status": "known"},
                {"objeto": "c", "orgao_nome": "z", "data_encerramento": "2026-08-01", "valor_estimado": 20, "link_pncp": "https://pncp.gov.br/app/editais/1/2026/2", "value_status": "known"},
            ],
        }
        fails = semantic_radar_fails(o)
        self.assertTrue(any("contract_url" in f for f in fails))
        self.assertTrue(any("zero_used" in f for f in fails))

    def test_radar_duplicates(self):
        item = {"objeto": "Pavimentação Indaial", "orgao_nome": "Indaial", "data_encerramento": "2026-08-01", "valor_estimado": 100, "link_pncp": "https://pncp.gov.br/app/editais/1/2026/1", "value_status": "known"}
        o = {"open_count": 3, "duplicate_rate": 0, "items": [item, dict(item), dict(item)]}
        fails = semantic_radar_fails(o)
        self.assertTrue(any("duplicate" in f for f in fails))

    def test_problem_generic_evidence(self):
        fails = semantic_problem_fails({"theme": "aditivos", "evidence_count": 48})
        self.assertTrue(any("aditivo" in f or "evidence" in f for f in fails))

    def test_approval_invalidated_on_dataset_change(self):
        c = Candidate(
            page_id="x", page_type="market", url="/x/", title="t", h1="h",
            description="d " * 20, archetype=None, segment=None, region="SC",
            agency_id=None, intent="y", score=95, status="publish",
        )
        out = apply_human_review_gate(
            [c],
            {"x": {"human_review": "APPROVED", "review_dataset_hash": "old"}},
            dataset_hash="new",
        )
        self.assertEqual(out[0].status, "noindex")
        self.assertTrue(any("dataset_changed" in r for r in out[0].reasons))


class TestEditorialAudit(unittest.TestCase):
    def test_detects_ingestion_prefix_and_slug(self):
        reg = {
            "page_id": "t1",
            "url": "/inteligencia/orgaos/x/",
            "page_type": "agency",
            "status": "noindex",
            "human_review": "NEEDS_DATA_FIX",
            "title": "MRS-PREFEITURA MUNICIPAL DE CAXIAS DO SUL",
            "h1": "MRS-PREFEITURA",
            "description": "Dossiê com manutencao-predial-engenharia no texto cortado no mei",
            "sources": ["pncp"],
            "observation_count": 49,
            "reasons": ["suppliers<3"],
        }
        # write temp html
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            # audit_page without html uses reg fields
            r = audit_page(reg, None)
            codes = {i.code for i in r.issues}
            self.assertIn("ingestion_prefix_name", codes)

    def test_meta_truncation(self):
        reg = {
            "page_id": "t2", "url": "/x/", "page_type": "problem_service",
            "status": "noindex", "human_review": "NEEDS_CONTENT_FIX",
            "title": "Problema", "h1": "Problema",
            "description": "Texto que termina no mei",
            "sources": [], "observation_count": 0, "reasons": [],
        }
        r = audit_page(reg, None)
        # may or may not flag incomplete - check truncation mid-word with ...
        reg["description"] = "Inconsistência entre orçamento e edital em obras públ..."
        r2 = audit_page(reg, None)
        codes = {i.code for i in r2.issues}
        self.assertTrue("meta_desc_truncated" in codes or "meta_desc_incomplete" in codes)


class TestReviewBlocksBulkAndChecklist(unittest.TestCase):
    def test_no_bulk_approve_api(self):
        import scripts.pseo.review as review
        src = Path(review.__file__).read_text(encoding="utf-8")
        # Docstring may mention bulk auto-approve is forbidden; no bulk command exists
        self.assertNotIn("def cmd_bulk", src)
        self.assertNotIn("bulk_approve", src)
        self.assertIn("def cmd_audit", src)
        self.assertIn("approval blocked", src)
        self.assertIn("no bulk auto-approve", src.lower())

    def test_set_requires_checklist(self):
        from scripts.pseo import review as rev
        # dry: call cmd_set with APPROVED without checklist should return 3
        # only if page exists
        reg = json.loads((ROOT / "data/pseo/registry.json").read_text(encoding="utf-8"))
        if not reg.get("pages"):
            self.skipTest("no registry pages")
        pid = reg["pages"][0]["page_id"]
        code = rev.main(["set", pid, "APPROVED", "--reviewer", "tester", "--notes", "x"])
        self.assertEqual(code, 3)


if __name__ == "__main__":
    unittest.main()
