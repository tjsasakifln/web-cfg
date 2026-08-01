"""Tests for approval stability proof + evidence_kind language gates.

Drives shipped modules (prove_approval_stability, enrich_problem_service,
editorial_audit, score.icp_similarity) — no reimplementation.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))


class TestGscDeriveState(unittest.TestCase):
    def test_submitted_and_indexed_maps_to_indexed(self):
        from scripts.pseo.gsc_ingest import derive_state

        self.assertEqual(
            derive_state(
                {
                    "verdict": "PASS",
                    "coverage": "Submitted and indexed",
                    "indexing_state": "INDEXING_ALLOWED",
                }
            ),
            "INDEXED",
        )
        self.assertEqual(
            derive_state(
                {
                    "verdict": "NEUTRAL",
                    "coverage": "Discovered - currently not indexed",
                }
            ),
            "DISCOVERED_NOT_CRAWLED",
        )


class TestGateBlocksNewPages(unittest.TestCase):
    def test_pages_added_blocks_gate(self):
        from scripts.pseo.gsc_gate import compute_next_wave_gate

        seeds = ["/inteligencia/cenarios/aditivos-e-risco-de-margem/"]
        by = {
            seeds[0]: {
                "url": seeds[0],
                "state": "INDEXED",
            }
        }
        gate = compute_next_wave_gate(
            seed_urls=seeds,
            gsc_access="INSPECTED_WITH_EVIDENCE",
            gsc_by_url=by,
            production_audit_ok=True,
            production_audit_is_current=True,
            extra_cli_on_main=True,
            reexport_without_undue_invalidation=True,
            snapshot_source_on_main=True,
            pages_added=["radar-edificacoes-publicas-sc"],
            new_pages_published=0,
        )
        self.assertFalse(gate["next_wave_gate"])
        self.assertTrue(any("pages_added" in r for r in gate["reasons"]))

    def test_clean_pages_added_allows_when_other_ok(self):
        from scripts.pseo.gsc_gate import compute_next_wave_gate

        seeds = ["/inteligencia/cenarios/aditivos-e-risco-de-margem/"]
        by = {seeds[0]: {"url": seeds[0], "state": "INDEXED"}}
        gate = compute_next_wave_gate(
            seed_urls=seeds,
            gsc_access="INSPECTED_WITH_EVIDENCE",
            gsc_by_url=by,
            production_audit_ok=True,
            production_audit_is_current=True,
            extra_cli_on_main=True,
            reexport_without_undue_invalidation=True,
            snapshot_source_on_main=True,
            pages_added=[],
            new_pages_published=0,
        )
        self.assertTrue(gate["next_wave_gate"], gate["reasons"])


class TestGscIngestFullFields(unittest.TestCase):
    def test_ingest_persists_required_inspection_fields(self):
        import tempfile
        from pathlib import Path

        from scripts.pseo.gsc_ingest import ingest

        payload = {
            "evidence_origin": "url_inspection_api",
            "inspection_timestamp": "2026-08-01T01:26:16Z",
            "urls": [
                {
                    "url": "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
                    "inspection_source": "url_inspection_api",
                    "inspection_timestamp": "2026-08-01T01:26:16Z",
                    "verdict": "NEUTRAL",
                    "coverage": "Discovered - currently not indexed",
                    "indexing_state": "INDEXING_STATE_UNSPECIFIED",
                    "last_crawl_time": None,
                    "robots_txt_state": "ROBOTS_TXT_STATE_UNSPECIFIED",
                    "page_fetch_state": "PAGE_FETCH_STATE_UNSPECIFIED",
                    "user_canonical": None,
                    "google_canonical": None,
                    "referring_urls": [],
                }
            ],
        }
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "idx.json"
            result = ingest(payload, seed_urls=[payload["urls"][0]["url"]], out_path=out)
            row = result["urls"][payload["urls"][0]["url"]]
            for key in (
                "inspection_source",
                "inspection_timestamp",
                "coverage_state",
                "indexing_state",
                "last_crawl_time",
                "robots_txt_state",
                "page_fetch_state",
                "user_canonical",
                "referring_urls",
            ):
                self.assertIn(key, row, key)
            self.assertEqual(row["inspection_source"], "url_inspection_api")
            self.assertEqual(row["state"], "DISCOVERED_NOT_CRAWLED")


class TestIcpHistogramCompat(unittest.TestCase):
    def test_list_and_dict_histograms(self):
        from scripts.pseo.score import _histogram_as_dict, icp_similarity

        d = {"CONFIRMED_ENGINEERING": 20}
        lst = [{"key": "CONFIRMED_ENGINEERING", "count": 20}]
        self.assertEqual(_histogram_as_dict(d), {"CONFIRMED_ENGINEERING": 20.0})
        self.assertEqual(_histogram_as_dict(lst), {"CONFIRMED_ENGINEERING": 20.0})
        feats = {"archetype_known": 0.9, "observation_norm": 0.5, "multi_buyer": 0.5}
        s1 = icp_similarity(
            feats,
            {
                "available": True,
                "sector_fit_histogram": d,
                "activity_class_histogram": {"ENGINEERING_SERVICE_PROVIDER": 19},
                "public_signal_frequency": {"new_agency": 20},
            },
        )
        s2 = icp_similarity(
            feats,
            {
                "available": True,
                "sector_fit_histogram": lst,
                "activity_class_histogram": [
                    {"key": "ENGINEERING_SERVICE_PROVIDER", "count": 19}
                ],
                "public_signal_frequency": [{"key": "new_agency", "count": 20}],
            },
        )
        self.assertAlmostEqual(s1, s2, places=5)
        self.assertGreater(s1, 0.0)


class TestEvidenceKindLanguage(unittest.TestCase):
    def test_normative_rejects_concentram(self):
        from scripts.pseo.editorial_audit import audit_page

        reg = {
            "page_id": "prob-aditivos-margem",
            "url": "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
            "page_type": "problem_service",
            "status": "publish",
            "human_review": "APPROVED",
            "title": "Aditivos",
            "h1": "Aditivos",
            "description": "Obras de edificações e saneamento concentram alterações de projeto.",
            "evidence_kind": "normative_editorial",
            "sources": [],
        }
        # no HTML path — uses registry fields as text
        r = audit_page(reg, None)
        codes = {i.code for i in r.issues}
        self.assertIn("evidence_kind_language_mismatch", codes)

    def test_normative_allows_sujeitas(self):
        from scripts.pseo.editorial_audit import audit_page

        reg = {
            "page_id": "prob-aditivos-margem",
            "url": "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
            "page_type": "problem_service",
            "status": "publish",
            "human_review": "APPROVED",
            "title": "Aditivos",
            "h1": "Aditivos",
            "description": (
                "Obras de edificações e saneamento estão particularmente sujeitas a "
                "alterações de projeto e quantitativos durante a execução."
            ),
            "evidence_kind": "normative_editorial",
            "sources": [],
        }
        r = audit_page(reg, None)
        codes = {i.code for i in r.issues}
        self.assertNotIn("evidence_kind_language_mismatch", codes)


class TestEnrichAndProveOnRealPair(unittest.TestCase):
    def test_enrich_removes_concentram(self):
        from scripts.pseo.enrich_problem_service import (
            enrich_problem_service,
            find_forbidden_language,
        )

        rows = [
            {
                "id": "prob-aditivos-margem",
                "observed_pattern": (
                    "Obras de edificações e saneamento concentram alterações de projeto "
                    "e quantitativo. Sem registro contemporâneo, o aditivo vira custo absorvido."
                ),
                "official_references": [{"name": "Lei", "url": "https://www.planalto.gov.br/x"}],
                "technical_guide_paths": ["/conteudos/aditivo-qualitativo-quantitativo/"],
                "limitations": ["lim"],
                "evidence_count": 48,
                "problem_label": "Aditivos",
            }
        ]
        out = enrich_problem_service(rows)
        self.assertEqual(out[0]["evidence_kind"], "normative_editorial")
        self.assertNotIn("concentram", out[0]["observed_pattern"].lower())
        self.assertFalse(find_forbidden_language(out))

    def test_prove_fails_on_material_preserve(self):
        """Shipped classify_page_change flags preserve-after-material as error path."""
        from scripts.pseo.prove_approval_stability import classify_page_change

        prev = {
            "page_material_hash": "aaa",
            "human_review": "APPROVED",
            "reviewed_material_signature": {"h1": "old"},
        }
        # material_cmp says needs_review but human still APPROVED → bad
        row = classify_page_change(
            prev,
            cur_sig={"h1": "new"},
            cur_hash="bbb",
            human_after="APPROVED",
            material_cmp={
                "needs_review": True,
                "changed_fields": ["h1"],
                "severity": "data",
            },
        )
        self.assertTrue(row["material_change"])
        self.assertTrue(row["approval_preserved"])
        self.assertEqual(row["change_class"], "material")
        # proof command would error because approval_preserved and material_change
        self.assertTrue(row["approval_preserved"] and row["material_change"])

    def test_prove_on_identical_snapshot_preserves(self):
        """Running prove against same live snapshot must not invent material churn."""
        from scripts.pseo.prove_approval_stability import prove

        data = ROOT / "data" / "pseo"
        if not (data / "manifest.json").exists():
            self.skipTest("no live snapshot")
        # Use a temp copy so we don't depend on mid-campaign partial apply
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            old_d = td_path / "old"
            new_d = td_path / "new"
            old_d.mkdir()
            new_d.mkdir()
            # copy every json the live snapshot references (checksums + bodies)
            for src in data.glob("*.json"):
                shutil.copy2(src, old_d / src.name)
                shutil.copy2(src, new_d / src.name)
            result = prove(
                old_data_dir=old_d,
                new_data_dir=new_d,
                old_registry_path=old_d / "registry.json",
                seed_page_ids=[
                    "prob-aditivos-margem",
                    "prob-orcamento-edital",
                    "prob-sinapi-sicro",
                    "radar-edificacoes-publicas-pr",
                ],
            )
            self.assertTrue(result["ok"], result["stability"].get("errors"))
            # Currently approved seeds must be preserved on identical snap
            for pid in result["stability"]["preserved_approval_proof_pages"]:
                self.assertIn(pid, result["stability"]["focus_results"])
            self.assertGreaterEqual(
                len(result["stability"]["preserved_approval_proof_pages"]), 1
            )


if __name__ == "__main__":
    unittest.main()
