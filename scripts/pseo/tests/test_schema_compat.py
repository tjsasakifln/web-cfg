"""Compatibility between extra-cli export schema and web-cfg consumer."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class TestSchemaCompat(unittest.TestCase):
    def test_manifest_schema_version_supported(self):
        from scripts.pseo.schema import SCHEMA_VERSIONS_OK, validate_snapshot

        snap = validate_snapshot(ROOT / "data" / "pseo")
        sv = snap["manifest"].get("schema_version")
        self.assertIn(sv, SCHEMA_VERSIONS_OK)

    def test_required_body_files_present(self):
        from scripts.pseo.schema import REQUIRED_FILES

        data = ROOT / "data" / "pseo"
        for name in REQUIRED_FILES:
            self.assertTrue((data / name).exists(), name)

    def test_problem_service_claim_evidence_shape(self):
        rows = json.loads((ROOT / "data/pseo/problem_service.json").read_text(encoding="utf-8"))
        self.assertIsInstance(rows, list)
        for row in rows:
            if row.get("evidence_kind") == "framework_with_market_density":
                self.assertTrue(row.get("claim_evidence") or row.get("official_references"))
                self.assertTrue(row.get("technical_guide_paths"))
                self.assertTrue(row.get("limitations"))

    def test_page_material_hash_stable_across_reload(self):
        from scripts.pseo.schema import validate_snapshot
        from scripts.pseo.score import (
            _material_signature,
            build_candidates,
            page_material_hash,
        )

        snap = validate_snapshot(ROOT / "data" / "pseo")
        cands = build_candidates(snap["data"], snap["manifest"])
        self.assertTrue(cands)
        for c in cands[:5]:
            h1 = page_material_hash(_material_signature(c))
            h2 = page_material_hash(_material_signature(c))
            self.assertEqual(h1, h2)
            self.assertEqual(len(h1), 64)


if __name__ == "__main__":
    unittest.main()
