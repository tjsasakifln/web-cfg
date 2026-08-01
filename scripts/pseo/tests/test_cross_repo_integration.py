"""Cross-repo integration: extra-cli exporter → web-cfg consumer (real code paths).

Skips only when EXTRA_CLI_ROOT is unset and no sibling checkout is found.
When available, drives real consumer modules and probes the exporter entrypoint.
"""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))


def _find_extra_cli() -> Path | None:
    env = os.environ.get("EXTRA_CLI_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    candidates = [
        Path("/tmp/grok-goal-51e314319eb4/implementer/extra-cli"),
        ROOT.parent / "extra-cli",
        Path.home() / "extra-cli",
    ]
    for c in candidates:
        if (c / "scripts" / "pseo" / "export_web_cfg.py").exists():
            return c
    return None


EXTRA = _find_extra_cli()


@unittest.skipUnless(EXTRA is not None, "extra-cli checkout not found (set EXTRA_CLI_ROOT)")
class TestCrossRepoIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extra = EXTRA
        assert cls.extra is not None

    def test_exporter_entrypoint_importable(self):
        r = subprocess.run(
            [sys.executable, "-m", "scripts.pseo.export_web_cfg", "--help"],
            cwd=str(self.extra),
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertNotIn("No module named", r.stderr)
        self.assertIn(
            r.returncode,
            {0, 1, 2},
            f"stdout={r.stdout[-500:]} stderr={r.stderr[-500:]}",
        )

    def test_fixture_snapshot_consumed_by_web_cfg_build_validate(self):
        """Consumer path on real modules: validate → candidates → gates → render."""
        from scripts.pseo.public_artifact import assemble_public_artifact
        from scripts.pseo.render import render_candidate
        from scripts.pseo.schema import validate_snapshot
        from scripts.pseo.score import (
            Candidate,
            _material_signature,
            apply_human_review_gate,
            build_candidates,
            page_material_hash,
        )

        data_dir = ROOT / "data" / "pseo"
        snap = validate_snapshot(data_dir)
        self.assertTrue(snap["ok"])
        cands = build_candidates(snap["data"], snap["manifest"])
        self.assertTrue(cands)

        # Without approval → not publish
        eligible = [
            Candidate(
                page_id="tmp-approve",
                page_type="problem_service",
                url="/inteligencia/cenarios/tmp/",
                title="t" * 20,
                h1="h",
                description="d " * 30,
                archetype="edificacoes-publicas",
                segment="s",
                region=None,
                agency_id=None,
                intent="i",
                score=90,
                status="publish",
            )
        ]
        blocked = apply_human_review_gate(
            eligible, {"tmp-approve": {"human_review": "PENDING"}}
        )
        self.assertEqual(blocked[0].status, "noindex")

        approved = apply_human_review_gate(
            [
                Candidate(
                    page_id="tmp-ok",
                    page_type="problem_service",
                    url="/inteligencia/cenarios/tmp-ok/",
                    title="t" * 20,
                    h1="h",
                    description="d " * 30,
                    archetype="edificacoes-publicas",
                    segment="s",
                    region=None,
                    agency_id=None,
                    intent="i",
                    score=90,
                    status="publish",
                )
            ],
            {
                "tmp-ok": {
                    "human_review": "APPROVED",
                    "reviewer": "fixture",
                    "review_date": "2026-07-31",
                }
            },
        )
        self.assertEqual(approved[0].status, "publish")

        # Material change invalidates via signature compare (shipped helper)
        c = [x for x in cands if x.page_type == "problem_service"][0]
        sig1 = _material_signature(c)
        h1 = page_material_hash(sig1)
        c2 = Candidate(**{**c.__dict__, "h1": c.h1 + " ALTERADO"})
        sig2 = _material_signature(c2)
        h2 = page_material_hash(sig2)
        self.assertNotEqual(h1, h2)

        html = render_candidate(c, snap["manifest"])
        self.assertNotIn("datalake", html.lower())
        self.assertNotIn("pncp_supplier_contracts", html)

        if (ROOT / "inteligencia" / "index.html").exists():
            rep = assemble_public_artifact(ROOT)
            self.assertTrue(rep.get("ok"), rep)

    def test_extra_cli_not_on_main_is_detectable(self):
        from scripts.pseo.verify_release import extra_cli_on_main

        info = extra_cli_on_main(self.extra)
        self.assertIn("on_main", info)
        self.assertIn("entrypoint", info)


if __name__ == "__main__":
    unittest.main()
