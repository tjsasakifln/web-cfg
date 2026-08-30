"""Drive shipped hash / normalize / compare / allowlist / assemble-wipe units."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build_site import write_build_info
from scripts.pseo.public_artifact import (
    FOOTER_SCRIPTURE_HTML,
    add_footer_scripture,
    assemble_public_artifact,
    audit_public_artifact,
)
from scripts.pseo.reproducible import (
    VERSIONED_TIMESTAMP_FIELDS,
    assert_public_payload_clean,
    build_reproducible_manifest,
    collect_input_shas,
    compare_trees,
    content_hash,
    content_tree_hash,
    file_hashes,
    normalize_json_value,
    present_env_names,
    scan_text_for_leaks,
    sha256_bytes,
    sha256_file,
    stamp_publish_identity,
    wipe_generated_identity,
)


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _json(path: Path, payload: dict) -> None:
    _write(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


class TestHashAndNormalize(unittest.TestCase):
    def test_same_inputs_same_file_hashes(self):
        with tempfile.TemporaryDirectory() as td:
            a = Path(td) / "a.txt"
            b = Path(td) / "b.txt"
            a.write_bytes(b"same-bytes\n")
            b.write_bytes(b"same-bytes\n")
            self.assertEqual(sha256_file(a), sha256_file(b))
            self.assertEqual(content_hash(a), content_hash(b))

    def test_timestamp_ignored_only_if_versioned(self):
        left = {"title": "ok", "build_time": "2026-08-16T00:00:00Z", "generated_at": "T1"}
        right = {"title": "ok", "build_time": "2026-08-16T12:00:00Z", "generated_at": "T2"}
        self.assertEqual(
            sha256_bytes(json.dumps(normalize_json_value(left)).encode()),
            sha256_bytes(json.dumps(normalize_json_value(right)).encode()),
        )
        planted = {"title": "ok", "other_time": "2026-08-16T00:00:00Z"}
        changed = {"title": "ok", "other_time": "2026-08-16T12:00:00Z"}
        self.assertNotEqual(
            sha256_bytes(json.dumps(normalize_json_value(planted)).encode()),
            sha256_bytes(json.dumps(normalize_json_value(changed)).encode()),
        )
        self.assertIn("build_time", VERSIONED_TIMESTAMP_FIELDS)
        self.assertIn("generated_at", VERSIONED_TIMESTAMP_FIELDS)
        self.assertIn("preview_generated_at", VERSIONED_TIMESTAMP_FIELDS)
        self.assertNotIn("other_time", VERSIONED_TIMESTAMP_FIELDS)

    def test_compare_ignores_versioned_timestamp_only(self):
        with tempfile.TemporaryDirectory() as td:
            tree_a = Path(td) / "a"
            tree_b = Path(td) / "b"
            _json(
                tree_a / "meta.json",
                {
                    "title": "page",
                    "build_time": "2026-08-16T00:00:00Z",
                    "generated_at": "T1",
                    "preview_generated_at": "T1",
                },
            )
            _write(tree_a / "index.html", "<html>ok</html>\n")
            _json(
                tree_b / "meta.json",
                {
                    "title": "page",
                    "build_time": "2026-08-16T12:00:00Z",
                    "generated_at": "T2",
                    "preview_generated_at": "T2",
                },
            )
            _write(tree_b / "index.html", "<html>ok</html>\n")
            report = compare_trees(tree_a, tree_b)
            self.assertTrue(report["ok"], report)
            self.assertTrue(report["identical_after_normalize"], report)
            self.assertEqual(report["hash_a"], report["hash_b"])
            self.assertTrue(report["versioned_diffs"], report)

    def test_non_versioned_content_change_fails_compare(self):
        with tempfile.TemporaryDirectory() as td:
            tree_a = Path(td) / "a"
            tree_b = Path(td) / "b"
            _write(tree_a / "index.html", "<html>one</html>\n")
            _write(tree_b / "index.html", "<html>two</html>\n")
            report = compare_trees(tree_a, tree_b)
            self.assertFalse(report["ok"], report)
            self.assertFalse(report["identical_after_normalize"])
            leftover_paths = {item["path"] for item in report["leftover"]}
            self.assertIn("index.html", leftover_paths)
            self.assertTrue(report["content_diffs"], report)

    def test_non_versioned_json_field_fails_compare(self):
        with tempfile.TemporaryDirectory() as td:
            tree_a = Path(td) / "a"
            tree_b = Path(td) / "b"
            _json(tree_a / "meta.json", {"title": "one", "build_time": "T1"})
            _json(tree_b / "meta.json", {"title": "two", "build_time": "T2"})
            report = compare_trees(tree_a, tree_b)
            self.assertFalse(report["ok"], report)
            fields = {item.get("field") for item in report["content_diffs"]}
            self.assertIn("title", fields)


class TestPublicPayloadHygiene(unittest.TestCase):
    def test_secret_and_local_paths_rejected_from_public_payload(self):
        with self.assertRaises(ValueError):
            assert_public_payload_clean(
                {"commit": "abc", "note": "api_key=\"supersecretvalue\""},
                label="fixture",
            )
        with self.assertRaises(ValueError):
            assert_public_payload_clean(
                {"commit": "abc", "source": "/home/alice/code/confenge/web-cfg"},
                label="fixture",
            )
        with self.assertRaises(ValueError):
            assert_public_payload_clean(
                {"commit": "abc", "source": r"C:\Users\alice\project"},
                label="fixture",
            )
        clean = {
            "commit": "abc123",
            "artifact_hash": "deadbeef",
            "env_names": ["NODE_ENV"],
            "tools": {"python": "3.12.3"},
        }
        assert_public_payload_clean(clean, label="clean")
        self.assertTrue(scan_text_for_leaks("/home/alice/secret"))
        self.assertTrue(scan_text_for_leaks(r"C:\Users\bob\app"))
        self.assertFalse(scan_text_for_leaks('{"commit":"abc","artifact_hash":"fff"}'))

    def test_write_build_info_rejects_local_path_environment(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError):
                write_build_info(
                    commit="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                    generated_at="2026-08-16T00:00:00Z",
                    environment="/home/alice/local",
                    schema_version="1.0.0",
                    root=Path(td),
                )

    def test_write_build_info_emits_allowlisted_keys_only(self):
        with tempfile.TemporaryDirectory() as td:
            path = write_build_info(
                commit="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                generated_at="2026-08-16T00:00:00Z",
                environment="production",
                schema_version="1.1.0",
                artifact_hash="abc123def456",
                manifest_hash="fff111aaa222",
                root=Path(td),
            )
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["commit"], "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
            self.assertEqual(data["artifact_hash"], "abc123def456")
            self.assertEqual(data["manifest_hash"], "fff111aaa222")
            self.assertNotIn("HOME", json.dumps(data))
            self.assertNotIn("/home/", json.dumps(data))
            assert_public_payload_clean(data, label="build-info")

    def test_env_allowlist_records_names_never_values(self):
        names = present_env_names(
            {"NODE_ENV": "production", "SECRET_TOKEN": "super-secret", "CI": "1"}
        )
        self.assertEqual(names, ["NODE_ENV", "CI"])
        self.assertNotIn("SECRET_TOKEN", names)
        self.assertNotIn("super-secret", names)

    def test_public_manifest_omits_absolute_paths(self):
        manifest = build_reproducible_manifest(
            commit="abc123",
            artifact_hash="hashhash",
            inputs={"files": {"data/pseo/manifest.json": "aa"}, "trees": {}, "file_count": 1, "tree_count": 0},
            tools={"python": "3.12.3", "node": "20.0.0", "npm": "10.0.0"},
            env_names=["NODE_ENV"],
            generated_files={"index.html": "bb"},
        )
        blob = json.dumps(manifest)
        self.assertNotIn("/home/", blob)
        self.assertNotIn("/Users/", blob)
        self.assertIn("data/pseo/manifest.json", blob)
        self.assertEqual(manifest["commit"], "abc123")
        self.assertEqual(manifest["artifact_hash"], "hashhash")
        self.assertTrue(manifest["manifest_hash"])


class TestAssembleWipesStale(unittest.TestCase):
    def test_footer_scripture_is_centered_and_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            dest = Path(td)
            page = dest / "index.html"
            page_without_footer = dest / "sem-rodape" / "index.html"
            _write(
                page,
                '<html><body><footer class="site-footer"><p>Rodapé</p></footer></body></html>',
            )
            _write(page_without_footer, "<html><body><main>Página</main></body></html>")

            first = add_footer_scripture(dest)
            second = add_footer_scripture(dest)
            html = page.read_text(encoding="utf-8")
            html_without_footer = page_without_footer.read_text(encoding="utf-8")

            self.assertEqual(first["html_rewritten"], 2)
            self.assertEqual(first["footers_created"], 1)
            self.assertEqual(second["html_rewritten"], 0)
            self.assertEqual(html.count(FOOTER_SCRIPTURE_HTML), 1)
            self.assertEqual(html_without_footer.count(FOOTER_SCRIPTURE_HTML), 1)
            self.assertIn("footer-scripture-only", html_without_footer)
            self.assertIn(f"{FOOTER_SCRIPTURE_HTML}\n</footer>", html)
            self.assertIn('style="margin:18px auto 0;text-align:center"', html)

    def test_assemble_wipes_planted_junk_and_audit_forbids_internal(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
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
            # leftover from a prior assemble — must not survive wipe+copy
            junk = root / "_site" / "stale-junk.txt"
            _write(junk, "I should not survive\n")
            _write(root / "_site" / "data" / "pseo" / "manifest.json", "{}\n")
            _write(root / "_site" / ".env", "SECRET=1\n")

            report = assemble_public_artifact(root)
            self.assertTrue(report.get("ok"), report)
            site = root / "_site"
            self.assertFalse((site / "stale-junk.txt").exists())
            self.assertFalse((site / "data").exists())
            self.assertFalse((site / ".env").exists())
            self.assertTrue((site / "index.html").exists())
            self.assertTrue((site / ".well-known" / "pseo-build.json").exists())

            audit = audit_public_artifact(root)
            self.assertTrue(audit.get("ok"), audit)

            # After a clean assemble, planting internal trees still fails the audit.
            _write(site / "data" / "secret.json", "{}\n")
            _write(site / "seo" / "notes.md", "no\n")
            _write(site / "scripts" / "x.py", "print(1)\n")
            _write(site / ".env.local", "TOKEN=1\n")
            poisoned = audit_public_artifact(root)
            self.assertFalse(poisoned["ok"], poisoned)
            codes = {f["code"] for f in poisoned["findings"]}
            paths = {f["path"] for f in poisoned["findings"]}
            self.assertTrue(
                codes
                & {
                    "forbidden_path_prefix",
                    "forbidden_dir",
                    "forbidden_extension",
                    "env_file",
                    "not_allowlisted_dir",
                },
                codes,
            )
            joined = " ".join(paths)
            self.assertIn("data", joined)
            self.assertIn("seo", joined)
            self.assertIn("scripts", joined)
            self.assertTrue(any(p.startswith(".env") or ".env" in p for p in paths), paths)


class TestGeneratedIdentityWipe(unittest.TestCase):
    def test_wipe_removes_leftover_well_known_identity(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            leftover = root / ".well-known" / "build-manifest.json"
            keep = root / ".well-known" / "indexnow-key.txt"
            _json(leftover, {"commit": "old"})
            _write(keep, "public-key\n")
            removed = wipe_generated_identity(root)
            self.assertEqual(removed, [".well-known/build-manifest.json"])
            self.assertFalse(leftover.exists())
            self.assertTrue(keep.exists())

    def test_input_tree_hash_ignores_generated_well_known(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write(root / "index.html", "<html></html>\n")
            _write(root / ".well-known" / "indexnow-key.txt", "k\n")
            _json(root / ".well-known" / "build-manifest.json", {"commit": "a"})
            first = collect_input_shas(root)
            _json(root / ".well-known" / "build-manifest.json", {"commit": "b-different"})
            second = collect_input_shas(root)
            self.assertEqual(first["trees"].get(".well-known/"), second["trees"].get(".well-known/"))
            self.assertNotIn(".well-known/build-manifest.json", first["files"])


class TestShippedTreeHashUsesNormalize(unittest.TestCase):
    def test_content_tree_hash_stable_across_versioned_clock(self):
        with tempfile.TemporaryDirectory() as td:
            a = Path(td) / "a"
            b = Path(td) / "b"
            _json(a / ".well-known" / "build-info.json", {"commit": "c", "build_time": "T1"})
            _json(b / ".well-known" / "build-info.json", {"commit": "c", "build_time": "T2"})
            _write(a / "index.html", "x")
            _write(b / "index.html", "x")
            self.assertEqual(content_tree_hash(a), content_tree_hash(b))
            self.assertEqual(file_hashes(a)["index.html"], file_hashes(b)["index.html"])


class TestStampPublishIdentity(unittest.TestCase):
    def test_final_tree_hash_equals_stamped_artifact_hash(self):
        """Shipped emit+hash: content_tree_hash(final _site) == stamped hashes."""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            site = root / "_site"
            _write(site / "index.html", "<html>ok</html>\n")
            _json(site / ".well-known" / "pseo-build.json", {"schema_version": "1.1.0"})
            stamped = stamp_publish_identity(
                root,
                commit="abc123def456",
                inputs={
                    "files": {"data/pseo/manifest.json": "aa"},
                    "trees": {},
                    "file_count": 1,
                    "tree_count": 0,
                },
                tools={"python": "3.12.3", "node": None, "npm": None},
                env_names=["NODE_ENV"],
                generated_at="2026-08-16T00:00:00Z",
                environment="test",
                schema_version="1.1.0",
            )
            info = json.loads((site / ".well-known" / "build-info.json").read_text())
            man = json.loads((site / ".well-known" / "build-manifest.json").read_text())
            final = content_tree_hash(site)
            self.assertEqual(final, info["artifact_hash"])
            self.assertEqual(info["artifact_hash"], man["artifact_hash"])
            self.assertEqual(final, stamped["artifact_hash"])
            self.assertIn(".well-known/build-manifest.json", man["generated_files"])
            self.assertEqual(man["generated_file_count"], len(man["generated_files"]))
            self.assertEqual(man["generated_file_count"], len(file_hashes(site)))
            for rel, digest in man["generated_files"].items():
                self.assertEqual(
                    digest,
                    content_hash(site / rel, rel=rel),
                    rel,
                )


class TestCliAuditEntrypoint(unittest.TestCase):
    def test_script_audit_imports_hash_helper_without_package_path(self):
        """CI runs `python3 scripts/pseo/public_artifact.py audit` as a script.

        Pytest imports this module with ROOT on sys.path, so the package import
        succeeds there. The shipped CLI path must work without PYTHONPATH.
        """
        script = ROOT / "scripts" / "pseo" / "public_artifact.py"
        with tempfile.TemporaryDirectory() as td:
            site = Path(td) / "_site"
            _write(
                site / "index.html",
                f"<html><footer>{FOOTER_SCRIPTURE_HTML}</footer></html>\n",
            )
            _write(site / "robots.txt", "User-agent: *\nDisallow:\n")
            _write(site / "_redirects", "/old /new 301\n")
            css = "body{}\n"
            _write(site / "styles.css", css)
            css_sha256 = sha256_file(site / "styles.css")
            css_digest = css_sha256[:12]
            css_href = f"/assets/css/styles.{css_digest}.css"
            _write(site / css_href.lstrip("/"), css)
            _write(site / "script.js", "console.log(1)\n")
            _json(site / ".well-known" / "pseo-build.json", {"schema_version": "1.1.0"})
            _json(
                site / ".well-known" / "css-assets.json",
                {
                    "schema_version": "1.0.0",
                    "files": {
                        "styles.css": {
                            "sha256": css_sha256,
                            "hash": css_digest,
                            "href": css_href,
                        }
                    },
                },
            )
            env = os.environ.copy()
            env.pop("PYTHONPATH", None)
            proc = subprocess.run(
                [sys.executable, str(script), "audit", "--root", td],
                cwd=td,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
        combined = proc.stdout + proc.stderr
        self.assertNotIn("ModuleNotFoundError", combined)
        self.assertNotIn("No module named 'scripts'", combined)
        self.assertEqual(proc.returncode, 0, combined)
        payload = json.loads(proc.stdout)
        self.assertTrue(payload.get("ok"), payload)
        self.assertEqual(len(payload["public_artifact_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
