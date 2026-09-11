"""Drive shipped assemble/audit so nested casos/.../data CSVs publish and private trees do not."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import (  # noqa: E402
    assemble_public_artifact,
    audit_public_artifact,
    is_authorized_public_nested_data_dir,
    is_authorized_public_nested_data_file,
)
from scripts.pseo.reproducible import collect_input_shas  # noqa: E402

SENTINELS = [
    "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
    "casos/demonstrativo-projeto-privado/data/orcamento.csv",
    "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
    "casos/demonstrativo-projeto-privado/data/revisao.csv",
]
VERIFIER = ROOT / "scripts" / "site" / "verify_promised_public_resources.mjs"

QUANTITATIVOS = """# exemplo demonstrativo; revisao=R01
id;descricao;unidade;quantidade;elementos;prancha;formula;desconto;revisao
Q-PISO-01;Revestimento cerâmico de piso;m2;4.32;SL-01;PR-ARQ-R01;2.40*1.80;sem desconto;R01
"""
ORCAMENTO = """# exemplo demonstrativo; revisao=R01
id;quantidade_id;servico;unidade;quantidade;preco_unitario;valor;classe_preco;elementos;revisao
ORC-PISO-01;Q-PISO-01;Revestimento cerâmico de piso;m2;4.32;85.00;367.20;hypothetical;SL-01;R01
ORC-SUBTOTAL;;Subtotal do recorte;BRL;;;367.20;hypothetical;;R01
"""
COORDENACAO = """# exemplo demonstrativo; revisao=R01
id;tipo;estado;local;evidencia;encaminhamento;elementos;falha_comprovada;revisao
CF-GEO-01;geometric;resolved_in_R01;Parede leste;Sobreposição;Rebaixar verga;WN-01 B-01;true;R01
"""
REVISAO = """# exemplo demonstrativo; revisao=R01
id;documento;constatacao;base;acao;tipo_conferencia;achado_relacionado;elementos;revisao
RF-01;PR-ARQ-R00;Verga invade viga;Conferência geométrica;Rebaixar verga;arithmetic_documental_coherence;CF-GEO-01;WN-01 B-01;R01
"""
PAGE = """<html><head><link rel="stylesheet" href="/styles.css"></head>
<body>
<p><a href="data/quantitativos.csv">Baixar quantitativos.csv</a></p>
<p><a href="data/orcamento.csv">Baixar orcamento.csv</a></p>
<p><a href="data/coordenacao.csv">Baixar coordenacao.csv</a></p>
<p><a href="data/revisao.csv">Baixar revisao.csv</a></p>
</body></html>
"""
DESCRIPTOR = {
    "schema": "confenge.demonstrative-sample-descriptor/1.0",
    "proof_id": "demo-private-project-pilot-2026-09",
    "url": "/casos/demonstrativo-projeto-privado/",
    "revision": "R01",
    "quantity_rows": [{"id": "Q-PISO-01", "unit": "m2", "quantity": "4.32"}],
    "budget_rows": [{"id": "ORC-PISO-01", "quantity_id": "Q-PISO-01", "unit": "m2", "quantity": "4.32", "amount": "367.20"}],
    "budget_subtotal": "367.20",
    "coordination_findings": [{"id": "CF-GEO-01", "kind": "geometric", "state": "resolved_in_R01"}],
    "review_findings": [
        {
            "id": "RF-01",
            "document_ref": "PR-ARQ-R00",
            "related_finding_id": "CF-GEO-01",
            "check_kind": "arithmetic_documental_coherence",
        }
    ],
    "assets": [
        {
            "id": "quantitativos-csv",
            "path": "casos/demonstrativo-projeto-privado/data/quantitativos.csv",
            "url": "/casos/demonstrativo-projeto-privado/data/quantitativos.csv",
            "type": "csv",
        },
        {
            "id": "orcamento-csv",
            "path": "casos/demonstrativo-projeto-privado/data/orcamento.csv",
            "url": "/casos/demonstrativo-projeto-privado/data/orcamento.csv",
            "type": "csv",
        },
        {
            "id": "coordenacao-csv",
            "path": "casos/demonstrativo-projeto-privado/data/coordenacao.csv",
            "url": "/casos/demonstrativo-projeto-privado/data/coordenacao.csv",
            "type": "csv",
        },
        {
            "id": "revisao-csv",
            "path": "casos/demonstrativo-projeto-privado/data/revisao.csv",
            "url": "/casos/demonstrativo-projeto-privado/data/revisao.csv",
            "type": "csv",
        },
    ],
}


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _json(path: Path, payload: dict) -> None:
    _write(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _plant_minimum(root: Path) -> None:
    _write(
        root / "index.html",
        '<html><head><link rel="stylesheet" href="/styles.css"></head><body>home</body></html>\n',
    )
    _write(root / "404.html", "<html>404</html>\n")
    _write(root / "robots.txt", "User-agent: *\nDisallow:\n")
    _write(root / "_redirects", "/old /new 301\n")
    _write(root / "_headers", "/*\n  X-Robots-Tag: all\n")
    _write(root / "styles.css", "body{}\n")
    _write(root / "script.js", "console.log(1)\n")
    _json(root / ".well-known" / "pseo-build.json", {"schema_version": "1.1.0"})
    _write(root / "casos" / "demonstrativo-projeto-privado" / "index.html", PAGE)
    _write(root / SENTINELS[0], QUANTITATIVOS)
    _write(root / SENTINELS[1], ORCAMENTO)
    _write(root / SENTINELS[2], COORDENACAO)
    _write(root / SENTINELS[3], REVISAO)
    _json(
        root / "data" / "demonstrative" / "private-project-pilot" / "consumption.v1.json",
        DESCRIPTOR,
    )
    _json(root / "data" / "pseo" / "manifest.json", {"secret": "not-public"})
    _write(root / "data" / "leads.csv", "email;phone\nprivate@example.com;+1\n")
    _write(root / "tests" / "pos-inb-20260911" / "03" / "leaked.csv", "id;x\n1;2\n")
    _write(root / ".env", "SECRET=1\n")
    _write(root / "docs" / "handoff.json", "{}\n")
    _json(root / "ops" / "data" / "gsc-insights.json", {"queries": []})
    _write(root / "casos" / "demonstrativo-projeto-privado" / "data" / "notes.md", "interno\n")
    _write(root / "casos" / "demonstrativo-projeto-privado" / "data" / "leads.json", "{}\n")


def _run_verifier(artifact: Path, source_root: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            str(VERIFIER),
            "--mode",
            "artifact",
            "--artifact",
            str(artifact),
            "--source-root",
            str(source_root),
            *extra,
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


class TestAuthorizationHelpers(unittest.TestCase):
    def test_nested_casos_data_is_authorized_repo_root_is_not(self):
        self.assertTrue(
            is_authorized_public_nested_data_dir("casos/demonstrativo-projeto-privado/data")
        )
        self.assertTrue(
            is_authorized_public_nested_data_file(
                "casos/demonstrativo-projeto-privado/data/quantitativos.csv"
            )
        )
        self.assertFalse(is_authorized_public_nested_data_dir("data"))
        self.assertFalse(is_authorized_public_nested_data_dir("ops/data"))
        self.assertFalse(is_authorized_public_nested_data_dir("casos/../data"))
        self.assertFalse(
            is_authorized_public_nested_data_file("casos/demonstrativo-projeto-privado/data/leads.json")
        )
        self.assertFalse(
            is_authorized_public_nested_data_file(
                "casos/demonstrativo-projeto-privado/data/secret-leads.csv"
            )
        )
        self.assertFalse(is_authorized_public_nested_data_file("data/leads.csv"))


class TestAssembleNestedDemonstrativeCsv(unittest.TestCase):
    def test_assemble_copies_nested_csv_and_excludes_private_trees(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            report = assemble_public_artifact(root)
            self.assertTrue(report.get("ok"), report)
            site = root / "_site"
            for rel in SENTINELS:
                path = site / rel
                self.assertTrue(path.is_file(), rel)
                self.assertGreater(path.stat().st_size, 0, rel)
                self.assertFalse(path.is_symlink(), rel)
            self.assertTrue((site / "casos/demonstrativo-projeto-privado/index.html").is_file())
            self.assertFalse((site / "data").exists())
            self.assertFalse((site / "tests").exists())
            self.assertFalse((site / "docs").exists())
            self.assertFalse((site / ".env").exists())
            self.assertFalse((site / "ops/data").exists())
            self.assertFalse((site / "casos/demonstrativo-projeto-privado/data/notes.md").exists())
            self.assertFalse((site / "casos/demonstrativo-projeto-privado/data/leads.json").exists())
            audit = audit_public_artifact(root)
            self.assertTrue(audit.get("ok"), audit)

            before = collect_input_shas(root)
            self.assertIn("casos/", before["trees"])
            _write(root / SENTINELS[0], QUANTITATIVOS + "Q-JAN-01;Janela;un;1;WN-01;PR-ARQ-R01;count;n/a;R01\n")
            after = collect_input_shas(root)
            self.assertNotEqual(before["trees"]["casos/"], after["trees"]["casos/"])

    def test_live_tree_sentinels_enter_isolated_dest(self):
        missing_source = [rel for rel in SENTINELS if not (ROOT / rel).is_file()]
        if missing_source:
            self.skipTest(f"source CSVs not in this tree: {missing_source}")
        dest = Path(tempfile.mkdtemp(prefix="pos-inb-03-live-"))
        try:
            report = assemble_public_artifact(ROOT, dest_name=str(dest))
            self.assertTrue(report.get("ok"), report)
            for rel in SENTINELS:
                path = dest / rel
                self.assertTrue(path.is_file(), rel)
                self.assertGreater(path.stat().st_size, 0, rel)
                self.assertEqual(_sha256(path), _sha256(ROOT / rel), rel)
            self.assertFalse((dest / "data").exists())
            self.assertFalse((dest / "tests").exists())
            audit = audit_public_artifact(ROOT, dest_name=str(dest))
            data_findings = [
                item
                for item in audit.get("findings") or []
                if "demonstrativo-projeto-privado/data" in item.get("path", "")
            ]
            self.assertEqual(data_findings, [], data_findings)
        finally:
            shutil.rmtree(dest, ignore_errors=True)


class TestVerifierAgainstShippedAssemble(unittest.TestCase):
    def test_pass_path_and_sentinel_union(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            assemble_public_artifact(root)
            proc = _run_verifier(root / "_site", root)
            payload = json.loads(proc.stdout or "{}")
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertTrue(payload.get("ok"), payload)
            expected = {
                item["path"]
                for report in payload.get("reports", [])
                for item in report.get("expected", [])
            }
            for rel in SENTINELS:
                self.assertIn("/" + rel, expected)

    def test_sentinels_remain_required_after_links_and_files_deleted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            assemble_public_artifact(root)
            site = root / "_site"
            page = site / "casos/demonstrativo-projeto-privado/index.html"
            page.write_text("<html><body>sem downloads</body></html>\n", encoding="utf-8")
            for rel in SENTINELS:
                (site / rel).unlink()
            shutil.rmtree(site / "casos/demonstrativo-projeto-privado/data", ignore_errors=True)
            proc = _run_verifier(site, root)
            payload = json.loads(proc.stdout or "{}")
            self.assertNotEqual(proc.returncode, 0, payload)
            self.assertFalse(payload.get("ok"), payload)
            codes = {item.get("code") for item in payload.get("findings") or []}
            self.assertIn("missing_promised_resource", codes, payload)

    def test_each_sentinel_removed_is_refused(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            assemble_public_artifact(root)
            site = root / "_site"
            for rel in SENTINELS:
                target = site / rel
                original = target.read_bytes()
                target.unlink()
                proc = _run_verifier(site, root)
                payload = json.loads(proc.stdout or "{}")
                self.assertNotEqual(proc.returncode, 0, rel)
                self.assertFalse(payload.get("ok"), payload)
                joined = json.dumps(payload.get("findings") or [])
                self.assertIn("missing_promised_resource", joined, rel)
                self.assertIn(rel.split("/")[-1], joined, rel)
                target.write_bytes(original)

    def test_empty_missing_column_revision_html_and_private_csv_refused(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            assemble_public_artifact(root)
            site = root / "_site"
            qty = site / SENTINELS[0]
            original = qty.read_bytes()

            qty.write_bytes(b"")
            empty = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(empty.get("ok"), empty)
            self.assertTrue(
                {item.get("code") for item in empty.get("findings") or []}
                & {"empty_bytes", "empty_csv"},
                empty,
            )
            qty.write_bytes(original)

            qty.write_text(QUANTITATIVOS.replace("quantidade;", "qtd;"), encoding="utf-8")
            missing_col = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(missing_col.get("ok"), missing_col)
            self.assertIn(
                "missing_column",
                {item.get("code") for item in missing_col.get("findings") or []},
                missing_col,
            )
            qty.write_bytes(original)

            qty.write_text(QUANTITATIVOS.replace("R01", "R99"), encoding="utf-8")
            revision = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(revision.get("ok"), revision)
            self.assertIn(
                "revision_mismatch",
                {item.get("code") for item in revision.get("findings") or []},
                revision,
            )
            qty.write_bytes(original)

            html_404 = (root / "404.html").read_bytes()
            qty.write_bytes(html_404)
            html_body = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(html_body.get("ok"), html_body)
            self.assertIn(
                "html_error_body",
                {item.get("code") for item in html_body.get("findings") or []},
                html_body,
            )
            qty.write_bytes(original)

            private = site / "casos/demonstrativo-projeto-privado/data" / "secret-leads.csv"
            private.write_text("email;phone\nprivate@example.com;1\n", encoding="utf-8")
            audit = audit_public_artifact(root)
            self.assertFalse(audit.get("ok"), audit)
            codes = {item.get("code") for item in audit.get("findings") or []}
            self.assertIn("unauthorized_nested_data_file", codes, audit)
            poisoned = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(poisoned.get("ok"), poisoned)
            self.assertIn(
                "private_csv",
                {item.get("code") for item in poisoned.get("findings") or []},
                poisoned,
            )
            private.unlink()

    def test_campaign_08_omission_is_ok_promised_geo_download_is_not(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _plant_minimum(root)
            assemble_public_artifact(root)
            proc = _run_verifier(root / "_site", root)
            self.assertEqual(proc.returncode, 0, proc.stdout)
            site = root / "_site"
            geo_page = site / "casos" / "demonstrativo-infraestrutura" / "index.html"
            _write(
                geo_page,
                '<html><body><a href="data/geo.csv">Baixar geo.csv</a></body></html>\n',
            )
            missing = json.loads(_run_verifier(site, root).stdout)
            self.assertFalse(missing.get("ok"), missing)
            joined = json.dumps(missing.get("findings") or [])
            self.assertTrue(
                "missing_promised_resource" in joined or "unauthorized_promised_path" in joined,
                missing,
            )


class TestPackageReleaseTarball(unittest.TestCase):
    def test_existing_package_release_contains_matching_csv_hashes(self):
        from deploy.netcup.package_release import build_release, sha256_file
        from deploy.netcup.tests.test_release_control import make_host_contract, make_site

        sha = "c" * 40
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            site = make_site(tmp, sha)
            page_dir = site / "casos" / "demonstrativo-projeto-privado" / "data"
            _write(site / "casos" / "demonstrativo-projeto-privado" / "index.html", PAGE)
            _write(page_dir / "quantitativos.csv", QUANTITATIVOS)
            _write(page_dir / "orcamento.csv", ORCAMENTO)
            _write(page_dir / "coordenacao.csv", COORDENACAO)
            _write(page_dir / "revisao.csv", REVISAO)
            html_before = (site / "casos" / "demonstrativo-projeto-privado" / "index.html").read_bytes()
            output = tmp / "dist"
            result = build_release(
                repo_root=ROOT,
                site=site,
                host_contract=make_host_contract(tmp),
                output_dir=output,
                sha=sha,
                node_version="v22.19.0",
                python_version="3.12.10",
                ci_run_id="pos-inb-03",
                ci_run_url="https://github.com/tjsasakifln/web-cfg/actions/runs/0",
                source_date_epoch=1787756400,
            )
            html_after = (site / "casos" / "demonstrativo-projeto-privado" / "index.html").read_bytes()
            self.assertEqual(html_before, html_after)
            tarball = result["artifact"]
            listed = subprocess.run(
                ["tar", "-tzf", str(tarball)],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.splitlines()
            for rel in SENTINELS:
                member = f"_site/{rel}"
                self.assertIn(member, listed, member)
                extracted = subprocess.run(
                    ["tar", "-xOf", str(tarball), member],
                    check=True,
                    capture_output=True,
                ).stdout
                self.assertEqual(hashlib.sha256(extracted).hexdigest(), sha256_file(site / rel), rel)
            _json(tmp / "data" / "demonstrative" / "private-project-pilot" / "consumption.v1.json", DESCRIPTOR)
            proc = subprocess.run(
                [
                    "node",
                    str(VERIFIER),
                    "--mode",
                    "tarball",
                    "--artifact",
                    str(site),
                    "--source-root",
                    str(tmp),
                    "--tarball",
                    str(tarball),
                ],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            payload = json.loads(proc.stdout or "{}")
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertTrue(payload.get("ok"), payload)


if __name__ == "__main__":
    unittest.main()

