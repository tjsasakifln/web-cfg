"""Unit tests for shipped pSEO pipeline (schema, score, fail-closed, no leak)."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
import sys

sys.path.insert(0, str(ROOT))

from scripts.pseo.schema import SnapshotError, validate_snapshot
from scripts.pseo.score import build_candidates, decide_status, score_components, total_from_breakdown
from scripts.pseo.similarity import find_similar_pairs, jaccard, tokenize


class TestSchemaFailClosed(unittest.TestCase):
    def setUp(self):
        self.src = ROOT / "data" / "pseo"
        self.assertTrue((self.src / "manifest.json").exists())

    def test_valid_snapshot(self):
        r = validate_snapshot(self.src)
        self.assertTrue(r["ok"])
        self.assertIn("dataset_hash", r["manifest"])

    def test_corrupt_checksum_fails(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td)
            for p in self.src.glob("*.json"):
                shutil.copy(p, dest / p.name)
            markets = dest / "markets.json"
            markets.write_text(markets.read_text(encoding="utf-8") + " ", encoding="utf-8")
            with self.assertRaises(SnapshotError) as ctx:
                validate_snapshot(dest)
            self.assertIn("checksum", str(ctx.exception).lower())

    def test_missing_file_fails(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td)
            for p in self.src.glob("*.json"):
                if p.name == "prices.json":
                    continue
                shutil.copy(p, dest / p.name)
            with self.assertRaises(SnapshotError):
                validate_snapshot(dest)


class TestScore(unittest.TestCase):
    def test_weights_sum_range(self):
        b = score_components(
            icp_fit=1,
            intent_clarity=1,
            evidence_strength=1,
            class_confidence=1,
            comparability=1,
            freshness=1,
            differentiation=1,
            service_cta=1,
            anti_cannibal=1,
        )
        self.assertEqual(total_from_breakdown(b), 100)

    def test_decide_status(self):
        self.assertEqual(decide_status(90, []), "publish")
        self.assertEqual(decide_status(70, []), "noindex")
        self.assertEqual(decide_status(50, []), "reject")
        self.assertEqual(decide_status(99, ["fail"]), "reject")

    def test_human_review_blocks_publish(self):
        from scripts.pseo.score import Candidate, apply_human_review_gate

        c = Candidate(
            page_id="x",
            page_type="market",
            url="/inteligencia/mercados/x/",
            title="t",
            h1="h",
            description="d " * 20,
            archetype="edificacoes-publicas",
            segment="s",
            region="SC",
            agency_id=None,
            intent="y",
            score=95,
            status="publish",
        )
        out = apply_human_review_gate([c], {"x": {"human_review": "PENDING"}})
        self.assertEqual(out[0].status, "noindex")
        out2 = apply_human_review_gate(
            [
                Candidate(
                    page_id="y",
                    page_type="market",
                    url="/inteligencia/mercados/y/",
                    title="t",
                    h1="h",
                    description="d " * 20,
                    archetype="edificacoes-publicas",
                    segment="s",
                    region="SC",
                    agency_id=None,
                    intent="y",
                    score=95,
                    status="publish",
                )
            ],
            {
                "y": {
                    "human_review": "APPROVED",
                    "review_dataset_hash": "abc",
                }
            },
            dataset_hash="abc",
        )
        self.assertEqual(out2[0].status, "publish")

    def test_no_max_publish_constant(self):
        import scripts.pseo.build as build_mod

        self.assertFalse(hasattr(build_mod, "MAX_PUBLISH"))
        self.assertFalse(hasattr(build_mod, "cap_publish"))

    def test_build_candidates_from_real_snapshot(self):
        snap = validate_snapshot(ROOT / "data" / "pseo")
        cands = build_candidates(snap["data"], snap["manifest"])
        self.assertGreater(len(cands), 3)
        self.assertTrue(any(c.page_type == "market" for c in cands))
        # scores must vary — not decorative constants
        scores = {c.score for c in cands}
        self.assertGreater(len(scores), 1)
        blob = json.dumps([c.as_dict() for c in cands])
        self.assertNotIn("score_total", blob)
        self.assertNotIn("commercial_state", blob)
        # breakdown must include new ICP features
        for c in cands:
            self.assertIn("icp_adherence", c.score_breakdown)
            self.assertIn("classification_confidence", c.score_breakdown)


class TestSimilarity(unittest.TestCase):
    def test_jaccard(self):
        a = tokenize("mercado de pavimentacao em santa catarina contratos orgaos")
        b = tokenize("mercado de pavimentacao em santa catarina contratos orgaos mediana")
        self.assertGreater(jaccard(a, b), 0.7)
        self.assertEqual(jaccard(set(), set()), 1.0)

    def test_pairs(self):
        pairs = find_similar_pairs(
            [("a", "alpha beta gamma delta"), ("b", "alpha beta gamma delta epsilon")],
            threshold=0.5,
        )
        self.assertTrue(pairs)


class TestNoProprietaryInData(unittest.TestCase):
    def test_data_dir(self):
        text = ""
        for p in (ROOT / "data" / "pseo").glob("*.json"):
            if p.name == "registry.json":
                continue
            text += p.read_text(encoding="utf-8")
        for needle in ("score_total", "commercial_state", "human_notes", "do_not_contact", "suggested_offer"):
            self.assertNotIn(needle, text)


class TestResolveRelatedUrls(unittest.TestCase):
    def test_strips_missing_siblings(self):
        from scripts.pseo.score import Candidate, resolve_related_urls

        keep = Candidate(
            page_id="m1",
            page_type="market",
            url="/inteligencia/mercados/edificacoes-publicas-sc/",
            title="t",
            h1="h",
            description="d " * 20,
            archetype="edificacoes-publicas",
            segment="Edificações",
            region="SC",
            agency_id=None,
            intent="x",
            score=90,
            status="publish",
            related_urls=[
                "/inteligencia/precos/edificacoes-publicas-sc/",  # missing
                "/inteligencia/mercados/",  # hub
                "/diagnostico-pre-licitacao/",  # static pillar
            ],
        )
        sibling = Candidate(
            page_id="p1",
            page_type="price",
            url="/inteligencia/precos/edificacoes-publicas-rs/",
            title="t2",
            h1="h2",
            description="d2 " * 20,
            archetype="edificacoes-publicas",
            segment="Edificações",
            region="RS",
            agency_id=None,
            intent="y",
            score=90,
            status="publish",
            related_urls=["/inteligencia/mercados/edificacoes-publicas-sc/"],
        )
        out = resolve_related_urls([keep, sibling], site_root=ROOT)
        kept_urls = out[0].related_urls
        self.assertNotIn("/inteligencia/precos/edificacoes-publicas-sc/", kept_urls)
        self.assertIn("/inteligencia/mercados/", kept_urls)
        self.assertIn("/diagnostico-pre-licitacao/", kept_urls)
        # sibling market url exists as written candidate
        self.assertIn("/inteligencia/mercados/edificacoes-publicas-sc/", out[1].related_urls)

    def test_price_descriptions_include_segment_region(self):
        snap = validate_snapshot(ROOT / "data" / "pseo")
        from scripts.pseo.score import build_candidates

        cands = build_candidates(snap["data"], snap["manifest"])
        prices = [c for c in cands if c.page_type == "price"]
        self.assertTrue(prices)
        descs = [c.description for c in prices]
        self.assertEqual(len(descs), len(set(descs)), "price descriptions must be unique")
        for c in prices:
            # description must name the object/segment and be specific (not obs-count-only mold)
            self.assertTrue(
                "Faixa de valores" in c.description or "Benchmark" in c.description,
                c.description,
            )
            import unicodedata
            def _fold(s: str) -> str:
                s = unicodedata.normalize("NFKD", s.lower())
                return "".join(ch for ch in s if not unicodedata.combining(ch))
            desc_f = _fold(c.description)
            self.assertTrue(
                c.segment and any(
                    _fold(tok) in desc_f
                    for tok in str(c.segment).replace("—", " ").replace("-", " ").split()
                    if len(tok) > 3
                ),
                msg=f"segment tokens missing from: {c.description} segment={c.segment}",
            )
            self.assertRegex(c.description, r"\d+\s+(observaç|contratos)")


if __name__ == "__main__":
    unittest.main()
