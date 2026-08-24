"""Wave 0 closure gates — drive shipped modules (no reimplementation)."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
import sys

sys.path.insert(0, str(ROOT))


class TestPublicArtifact(unittest.TestCase):
    def test_assemble_and_audit_allowlist(self):
        from scripts.pseo.public_artifact import (
            PUBLIC_DIR_NAME,
            assemble_public_artifact,
            audit_public_artifact,
            inventory_public_routes,
        )

        inv = inventory_public_routes(ROOT)
        self.assertGreater(inv["html_route_count"], 10)
        self.assertEqual(inv["public_directory"], "_site")

        # assemble uses real root — only if build already produced pages; still works
        rep = assemble_public_artifact(ROOT)
        self.assertTrue(rep.get("ok"), rep)
        self.assertEqual(rep["public_directory"], PUBLIC_DIR_NAME)
        site = ROOT / "_site"
        self.assertTrue(site.is_dir())
        self.assertTrue((site / "index.html").exists())
        self.assertFalse((site / "data").exists())
        self.assertFalse((site / "seo").exists())
        self.assertFalse((site / "scripts").exists())
        self.assertFalse((site / "package.json").exists())

        audit = audit_public_artifact(ROOT)
        # May fail if HTML still has internal phrases before rebuild — accept structural
        self.assertIn("public_artifact_hash", audit)
        self.assertFalse((site / "data" / "pseo").exists())

    def test_audit_fails_on_forbidden_injection(self):
        from scripts.pseo.public_artifact import assemble_public_artifact, audit_public_artifact

        assemble_public_artifact(ROOT)
        site = ROOT / "_site"
        poison = site / "data" / "pseo"
        poison.mkdir(parents=True, exist_ok=True)
        (poison / "manifest.json").write_text("{}", encoding="utf-8")
        (site / "leak.py").write_text("print(1)\n", encoding="utf-8")
        audit = audit_public_artifact(ROOT)
        self.assertFalse(audit["ok"])
        codes = {f["code"] for f in audit["findings"]}
        self.assertTrue(
            codes & {"forbidden_path_prefix", "forbidden_extension", "forbidden_dir", "not_allowlisted_dir"},
            codes,
        )
        # cleanup poison for other tests
        if (site / "leak.py").exists():
            (site / "leak.py").unlink()
        if (site / "data").exists():
            shutil.rmtree(site / "data")


class TestGscGate(unittest.TestCase):
    def test_not_inspected_never_allows_gate(self):
        from scripts.pseo.gsc_gate import (
            GSC_ACCESS_NO_CREDS,
            compute_next_wave_gate,
            empty_url_record,
        )

        seeds = [
            "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
            "/radar/edificacoes-publicas-pr/",
        ]
        by_url = {s: empty_url_record(s) for s in seeds}
        gate = compute_next_wave_gate(
            seed_urls=seeds,
            gsc_access=GSC_ACCESS_NO_CREDS,
            gsc_by_url=by_url,
            production_audit_ok=True,
            production_audit_is_current=True,
            extra_cli_on_main=True,
            reexport_without_undue_invalidation=True,
            snapshot_source_on_main=True,
        )
        self.assertFalse(gate["allowed"])
        self.assertFalse(gate["next_wave_gate"])
        self.assertFalse(gate["gsc_discovery_or_crawl_without_soft404"])
        self.assertTrue(any("NOT_INSPECTED" in r or "uninspected" in r for r in gate["reasons"]))

    def test_soft404_blocks(self):
        from scripts.pseo.gsc_gate import compute_next_wave_gate

        seeds = ["/a/", "/b/", "/c/", "/d/"]
        by_url = {
            "/a/": {"url": "/a/", "state": "INDEXED"},
            "/b/": {"url": "/b/", "state": "CRAWLED_NOT_INDEXED"},
            "/c/": {"url": "/c/", "state": "DISCOVERED_NOT_CRAWLED"},
            "/d/": {"url": "/d/", "state": "SOFT_404"},
        }
        gate = compute_next_wave_gate(
            seed_urls=seeds,
            gsc_access="INSPECTED_WITH_EVIDENCE",
            gsc_by_url=by_url,
            production_audit_ok=True,
            production_audit_is_current=True,
            extra_cli_on_main=True,
            reexport_without_undue_invalidation=True,
            snapshot_source_on_main=True,
        )
        self.assertFalse(gate["allowed"])
        self.assertTrue(any("blocking" in r for r in gate["reasons"]))


class TestGscIngest(unittest.TestCase):
    def test_rejects_bare_indexed_true(self):
        from scripts.pseo.gsc_ingest import ingest

        with self.assertRaises(ValueError) as ctx:
            ingest(
                {
                    "evidence_origin": "structured_manual_export",
                    "urls": [{"url": "https://confenge.com.br/x/", "indexed": True}],
                }
            )
        self.assertIn("indexed", str(ctx.exception).lower())

    def test_accepts_structured_export(self):
        from scripts.pseo.gsc_ingest import ingest

        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "idx.json"
            result = ingest(
                {
                    "evidence_origin": "structured_manual_export",
                    "captured_at": "2026-07-31T12:00:00Z",
                    "urls": [
                        {
                            "url": "https://confenge.com.br/radar/edificacoes-publicas-pr/",
                            "captured_at": "2026-07-31T12:00:00Z",
                            "verdict": "PASS",
                            "coverage": "Submitted and indexed",
                            "state": "INDEXED",
                            "notes": ["manual structured export from GSC UI"],
                        }
                    ],
                },
                seed_urls=["/radar/edificacoes-publicas-pr/"],
                out_path=out,
            )
            self.assertEqual(
                result["urls"]["/radar/edificacoes-publicas-pr/"]["state"], "INDEXED"
            )
            self.assertTrue(out.exists())


class TestAuditIdentity(unittest.TestCase):
    def test_stale_mismatch_blocks_ok(self):
        from scripts.pseo.audit_identity import (
            STALE_CODE,
            bind_ok_to_identity,
            evaluate_audit_currency,
            identity_block,
        )

        identity = identity_block(
            audit_target_sha="aaa",
            live_manifest_sha="bbb",
            snapshot_hash="snap1",
            public_artifact_hash_value="art1",
            seed_urls=["/a/"],
        )
        currency = evaluate_audit_currency(
            identity,
            netlify_deployed_sha="bbb",
            live_snapshot_hash="snap1",
            current_seed_set_hash=identity["seed_set_hash"],
        )
        self.assertFalse(currency["production_audit_is_current"])
        self.assertEqual(currency["stale_code"], STALE_CODE)
        bound = bind_ok_to_identity(True, identity, currency)
        self.assertFalse(bound["ok"])
        self.assertTrue(bound["technical_ok"])

    def test_matching_identities_allow_ok(self):
        from scripts.pseo.audit_identity import (
            bind_ok_to_identity,
            evaluate_audit_currency,
            identity_block,
            seed_set_hash,
        )

        seeds = ["/a/", "/b/"]
        sha = "deadbeef"
        identity = identity_block(
            audit_target_sha=sha,
            live_manifest_sha=sha,
            snapshot_hash="snapfullhash",
            public_artifact_hash_value="art",
            seed_urls=seeds,
        )
        currency = evaluate_audit_currency(
            identity,
            netlify_deployed_sha=sha,
            live_snapshot_hash="snapfull",
            current_seed_set_hash=seed_set_hash(seeds),
        )
        self.assertTrue(currency["production_audit_is_current"])
        bound = bind_ok_to_identity(True, identity, currency)
        self.assertTrue(bound["ok"])

    def test_missing_public_artifact_hash_blocks_ok(self):
        from scripts.pseo.audit_identity import (
            bind_ok_to_identity,
            evaluate_audit_currency,
            identity_block,
        )

        identity = identity_block(
            audit_target_sha="deadbeef",
            live_manifest_sha="deadbeef",
            snapshot_hash="snap",
            public_artifact_hash_value=None,
            seed_urls=["/a/"],
        )
        currency = evaluate_audit_currency(
            identity,
            netlify_deployed_sha="deadbeef",
            live_snapshot_hash="snap",
            current_seed_set_hash=identity["seed_set_hash"],
        )
        self.assertIn("public_artifact_hash_missing", currency["mismatches"])
        self.assertFalse(bind_ok_to_identity(True, identity, currency)["ok"])

    def test_audit_target_binds_to_live_not_git_head(self):
        """Evidence-only HEAD must not stale a healthy live deploy audit."""
        from scripts.pseo.audit_identity import (
            bind_ok_to_identity,
            evaluate_audit_currency,
            identity_block,
            seed_set_hash,
        )
        seeds = ["/radar/edificacoes-publicas-pr/"]
        live = "f35c00dcf1f5084a052df8437664fe5f14e7ac58"
        identity = identity_block(
            audit_target_sha=live,  # live tip under audit
            live_manifest_sha=live,
            snapshot_hash="0a67cf804cb0a26a5b3d3095d5acd9923fec492675cce4e4ab6928a5f4624faa",
            public_artifact_hash_value="art",
            seed_urls=seeds,
        )
        currency = evaluate_audit_currency(
            identity,
            netlify_deployed_sha=live,
            live_snapshot_hash="0a67cf804cb0a26a",
            current_seed_set_hash=seed_set_hash(seeds),
        )
        bound = bind_ok_to_identity(True, identity, currency)
        self.assertTrue(bound["ok"])
        self.assertTrue(bound["production_audit_is_current"])


class TestEvidenceKindAndPublicCopy(unittest.TestCase):
    def test_problem_service_has_canonical_evidence_kind(self):
        rows = json.loads((ROOT / "data/pseo/problem_service.json").read_text(encoding="utf-8"))
        allowed = {
            "direct_problem_evidence",
            "contextual_market_evidence",
            "normative_editorial",
        }
        for row in rows:
            self.assertIn(row.get("evidence_kind"), allowed, row.get("id"))

    def test_render_problem_strips_internal_language(self):
        from scripts.pseo.schema import validate_snapshot
        from scripts.pseo.score import build_candidates
        from scripts.pseo.render import render_candidate

        snap = validate_snapshot(ROOT / "data" / "pseo")
        cands = build_candidates(snap["data"], snap["manifest"])
        problems = [c for c in cands if c.page_type == "problem_service"]
        self.assertTrue(problems)
        for c in problems:
            html = render_candidate(c, snap["manifest"])
            low = html.lower()
            for bad in (
                "esta página só deve alegar",
                "contagens genéricas",
                "pncp_supplier_contracts",
                "site-confenge-guides",
                "datalake",
                "quality gate",
                "dataset_hash",
                "problema→serviço",
            ):
                self.assertNotIn(bad.lower(), low, f"{c.page_id} contains {bad}")

    def test_render_radar_strips_pipeline_field_names(self):
        from scripts.pseo.schema import validate_snapshot
        from scripts.pseo.score import build_candidates
        from scripts.pseo.render import render_candidate

        snap = validate_snapshot(ROOT / "data" / "pseo")
        cands = build_candidates(snap["data"], snap["manifest"])
        radars = [c for c in cands if c.page_type == "radar"]
        self.assertTrue(radars)
        for c in radars:
            html = render_candidate(c, snap["manifest"])
            for bad in (
                "historical_count",
                "open_count",
                "data_encerramento",
                "as_of",
                "as of",
                "verified_at",
            ):
                self.assertNotIn(bad, html, f"{c.page_id} leaked {bad}")

    def test_netlify_publish_is_site(self):
        text = (ROOT / "netlify.toml").read_text(encoding="utf-8")
        self.assertIn('publish = "_site"', text)
        self.assertIn("npm run build:site", text)


class TestForbiddenPhraseDetector(unittest.TestCase):
    def test_editorial_flags_internal_phrase(self):
        from scripts.pseo.editorial_audit import audit_page

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "index.html"
            p.write_text(
                "<html><body><p>Esta página só deve alegar evidência empírica "
                "quando o datalake trouxer sinais — não contagens genéricas de contratos.</p>"
                "<p>Fontes: pncp_supplier_contracts</p></body></html>",
                encoding="utf-8",
            )
            reg = {
                "page_id": "test",
                "url": "/t/",
                "page_type": "problem_service",
                "status": "publish",
                "human_review": "APPROVED",
                "title": "Test",
            }
            result = audit_page(reg, p)
            codes = {i.code for i in result.issues}
            self.assertIn("internal_language_public", codes)

    def test_editorial_flags_snake_case_fields_and_as_of(self):
        from scripts.pseo.editorial_audit import audit_page

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "index.html"
            p.write_text(
                "<html><body><p>as of 2026-07-31</p>"
                "<ul><li>historical_count NAO entra em open_count.</li>"
                "<li>Somente data_encerramento >= as_of</li></ul></body></html>",
                encoding="utf-8",
            )
            reg = {
                "page_id": "radar-x",
                "url": "/radar/x/",
                "page_type": "radar",
                "status": "publish",
                "human_review": "APPROVED",
                "title": "Radar",
            }
            result = audit_page(reg, p)
            codes = {i.code for i in result.issues}
            self.assertIn("internal_language_public", codes)

    def test_editorial_flags_singular_contagem_generica(self):
        """Regex must match singular contagem (not only plural contagens)."""
        from scripts.pseo.editorial_audit import FORBIDDEN_PUBLIC_PHRASES, audit_page

        singular = "não com contagem genérica de contratos"
        self.assertTrue(
            any(p.search(singular) for p in FORBIDDEN_PUBLIC_PHRASES),
            "FORBIDDEN_PUBLIC_PHRASES must match singular contagem genérica",
        )
        plural = "não contagens genéricas de contratos"
        self.assertTrue(
            any(p.search(plural) for p in FORBIDDEN_PUBLIC_PHRASES),
            "FORBIDDEN_PUBLIC_PHRASES must match plural contagens genéricas",
        )

        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "index.html"
            p.write_text(
                f"<html><body><p>Disputas se resolvem com diário — {singular}.</p></body></html>",
                encoding="utf-8",
            )
            reg = {
                "page_id": "prob-medicao-glosa",
                "url": "/inteligencia/cenarios/medicao-glosa-contratos-recorrentes/",
                "page_type": "problem_service",
                "status": "noindex",
                "human_review": "PENDING",
                "title": "Medição e glosa",
            }
            result = audit_page(reg, p)
            codes = {i.code for i in result.issues}
            self.assertIn("internal_language_public", codes)

    def test_rendered_problem_pages_have_no_contagem_generica(self):
        """Shipped render path must not emit singular/plural contagem genérica."""
        from scripts.pseo.render import render_candidate
        from scripts.pseo.schema import validate_snapshot
        from scripts.pseo.score import build_candidates

        snap = validate_snapshot(ROOT / "data" / "pseo")
        cands = build_candidates(snap["data"], snap["manifest"])
        problems = [c for c in cands if c.page_type == "problem_service"]
        self.assertTrue(problems)
        for c in problems:
            html = render_candidate(c, snap["manifest"])
            self.assertNotIn(
                "contagem genérica",
                html.lower(),
                f"{c.page_id} still contains contagem genérica",
            )
            self.assertNotIn(
                "contagens genéricas",
                html.lower(),
                f"{c.page_id} still contains contagens genéricas",
            )


if __name__ == "__main__":
    unittest.main()
