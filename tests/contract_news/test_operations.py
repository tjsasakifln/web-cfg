"""Operational boundaries for the isolated news producer and publisher."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.util
import io
import json
import os
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

RUN_PATH = Path(__file__).resolve().parents[2] / "deploy/contract-news/run.py"
SPEC = importlib.util.spec_from_file_location("contract_news_operations", RUN_PATH)
assert SPEC and SPEC.loader
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)

WEB_SHA = "a" * 40
PRODUCER_SHA = "b" * 40
KEY = "sk-test_" + "c" * 32
PRODUCER_PATH = "scripts/public_exports/contract_news.py"


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.release = self.root / "web/releases" / WEB_SHA
        (self.release / "metadata").mkdir(parents=True)
        (self.release / "metadata/release-manifest.json").write_text(json.dumps({"commit": WEB_SHA}))
        (self.release / "data/editorial").mkdir(parents=True)
        self.pin = self.release / "data/editorial/contract-news-source.json"
        self.pin.write_text(json.dumps({
            "schema": "confenge.contract-news-source/v1", "repository": "tjsasakifln/extra-cli",
            "fact_contract": "confenge.contract-news-facts/v1", "producer_commit": PRODUCER_SHA,
        }))
        self.current = self.root / "web/current"
        self.current.symlink_to(self.release)
        self.runtime_env = self.root / "runtime.env"
        self.runtime_env.write_text("")
        self.key_file = self.root / "api-key"
        self.key_file.write_text(KEY)
        self.key_file.chmod(0o600)
        self.bundle = self.root / "producer.tar.gz"
        self.make_bundle()
        self.destination = self.root / "producer"
        self.args = argparse.Namespace(
            current=self.current, expected_release=WEB_SHA,
            bundle=self.bundle, bundle_sha256=self.bundle_digest(), enabled="1",
            key_file=self.key_file, runtime_env=self.runtime_env,
            state=self.root / "contract-news", radar_pointer=self.root / "radar/current.json",
        )
        self.workers = []

    def tearDown(self):
        self.tmp.cleanup()

    def make_bundle(self, *, content=b"# trusted producer\n", manifest_sha=PRODUCER_SHA,
                    manifest_digest=None, extra=None, vendor_files=None):
        files = {PRODUCER_PATH: content, **(vendor_files or {})}
        manifest = {
            "schema": "confenge.contract-news-producer/v1", "repository": "tjsasakifln/extra-cli",
            "fact_contract": "confenge.contract-news-facts/v1", "producer_commit": manifest_sha,
            "files": {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()},
        }
        if manifest_digest:
            manifest["files"][PRODUCER_PATH] = manifest_digest
        with tarfile.open(self.bundle, "w:gz") as archive:
            for name, raw in (*files.items(), ("producer-manifest.json", json.dumps(manifest).encode())):
                member = tarfile.TarInfo(name)
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
            if extra is not None:
                member, raw = extra
                archive.addfile(member, io.BytesIO(raw))

    def bundle_digest(self):
        return hashlib.sha256(self.bundle.read_bytes()).hexdigest()

    def unpack(self):
        return ops.unpack_producer(self.bundle, self.bundle_digest(), PRODUCER_SHA, self.destination)

    def fake_worker(self, command, cwd, env, timeout):
        self.workers.append({"command": command, "cwd": cwd, "env": dict(env), "timeout": timeout})
        if "source-state" in command:
            return {"published_ids": [], "recheck_ids": []}
        if "scripts.public_exports.contract_news" in command:
            return {"ok": True}
        if "generate" in command:
            return {"status": "unchanged", "published": 0, "calls": 0}
        raise AssertionError("unexpected worker")

    def test_only_current_release_and_approved_producer_pin_are_accepted(self):
        self.assertEqual(ops.approved_release(self.current, WEB_SHA), self.release)
        self.assertEqual(ops.producer_revision(self.release), PRODUCER_SHA)
        with self.assertRaisesRegex(ops.RunError, "release_not_current"):
            ops.approved_release(self.current, "d" * 40)
        self.pin.write_text(json.dumps({"producer_commit": PRODUCER_SHA}))
        with self.assertRaisesRegex(ops.RunError, "invalid_producer_pin"):
            ops.producer_revision(self.release)
        with patch.object(ops, "process_json") as worker, self.assertRaisesRegex(ops.RunError, "invalid_producer_pin"):
            ops.run(self.args)
        worker.assert_not_called()

    def test_bundle_uses_fresh_private_directory_and_exact_approved_bytes(self):
        first, second = self.unpack(), self.unpack()
        self.assertNotEqual(first, second)
        self.assertEqual((first / PRODUCER_PATH).read_bytes(), b"# trusted producer\n")
        self.assertEqual(first.stat().st_mode & 0o777, 0o700)
        self.assertEqual((first / PRODUCER_PATH).stat().st_mode & 0o777, 0o400)

    def test_single_pinned_pypdf_wheel_is_verified_and_unpackaged_read_only(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("pypdf/__init__.py", "# isolated test fixture\n")
        wheel = buffer.getvalue()
        name = ops.PYPDF_WHEEL
        self.make_bundle(vendor_files={name: wheel})
        stage = self.unpack()
        self.assertEqual((stage / name).read_bytes(), wheel)
        self.assertEqual((stage / name).stat().st_mode & 0o777, 0o400)
        manifest = json.loads((stage / "producer-manifest.json").read_text())
        self.assertEqual(manifest["files"][name], hashlib.sha256(wheel).hexdigest())

    def test_vendor_dependency_scope_magic_size_and_single_wheel_are_enforced(self):
        name = ops.PYPDF_WHEEL
        cases = (
            ({name: b"not a wheel"}, "unsafe_producer_wheel"),
            ({name: b"PK\x03\x04" + b"x" * (2 * 1024 * 1024)}, "unsafe_producer_archive"),
            ({name.replace("pypdf-", "other-"): b"PK\x03\x04"}, "unsafe_producer_archive"),
            ({name: b"PK\x03\x04", name.replace("6.21.4", "6.21.5"): b"PK\x03\x04"}, "unsafe_producer_archive"),
        )
        for files, error in cases:
            with self.subTest(error=error, paths=list(files)):
                self.make_bundle(vendor_files=files)
                with self.assertRaisesRegex(ops.RunError, error):
                    self.unpack()
                self.assertEqual(list(self.destination.iterdir()), [])

    def test_mutated_archive_and_mutated_source_file_are_rejected(self):
        digest = self.bundle_digest()
        self.make_bundle(content=b"# changed producer\n")
        with self.assertRaisesRegex(ops.RunError, "producer_bundle_digest_mismatch"):
            ops.unpack_producer(self.bundle, digest, PRODUCER_SHA, self.destination)
        self.make_bundle(content=b"# changed producer\n", manifest_digest="0" * 64)
        with self.assertRaisesRegex(ops.RunError, "producer_manifest_mismatch"):
            self.unpack()
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_tar_is_read_from_verified_bytes_even_if_uploaded_path_is_replaced(self):
        original_open = ops.tarfile.open
        def replace_path(*args, **kwargs):
            self.bundle.write_bytes(b"untrusted replacement after digest check")
            return original_open(*args, **kwargs)
        with patch.object(ops.tarfile, "open", side_effect=replace_path):
            stage = self.unpack()
        self.assertEqual((stage / PRODUCER_PATH).read_bytes(), b"# trusted producer\n")

    def test_traversal_and_ambiguous_archive_paths_never_escape(self):
        for name in ("../escape.py", "/escape.py", "scripts/../../escape.py",
                     "scripts//escape.py", "scripts/./escape.py", "scripts/pkg/../escape.py"):
            with self.subTest(name=name):
                member = tarfile.TarInfo(name)
                member.size = 4
                self.make_bundle(extra=(member, b"bad\n"))
                with self.assertRaisesRegex(ops.RunError, "unsafe_producer_archive"):
                    self.unpack()
                self.assertFalse((self.root / "escape.py").exists())
                self.assertEqual(list(self.destination.iterdir()), [])

    def test_archive_symlinks_hardlinks_and_duplicate_members_are_rejected(self):
        for link_type in (tarfile.SYMTYPE, tarfile.LNKTYPE):
            with self.subTest(link_type=link_type):
                member = tarfile.TarInfo("scripts/link.py")
                member.type = link_type
                member.linkname = "/etc/passwd"
                self.make_bundle(extra=(member, b""))
                with self.assertRaisesRegex(ops.RunError, "unsafe_producer_archive"):
                    self.unpack()
        member = tarfile.TarInfo(PRODUCER_PATH)
        self.make_bundle(extra=(member, b""))
        with self.assertRaisesRegex(ops.RunError, "unsafe_producer_archive"):
            self.unpack()

    def test_bundle_and_extraction_directory_symlinks_are_rejected(self):
        alias = self.root / "bundle-alias.tar.gz"
        alias.symlink_to(self.bundle)
        with self.assertRaisesRegex(ops.RunError, "invalid_producer_bundle"):
            ops.unpack_producer(alias, self.bundle_digest(), PRODUCER_SHA, self.destination)
        outside = self.root / "outside"
        outside.mkdir()
        self.destination.symlink_to(outside)
        with self.assertRaisesRegex(ops.RunError, "unsafe_producer_directory"):
            self.unpack()
        self.assertEqual(list(outside.iterdir()), [])

    def test_wrong_producer_commit_fails_before_executing_any_code(self):
        self.make_bundle(manifest_sha="d" * 40)
        self.args.bundle_sha256 = self.bundle_digest()
        with patch.object(ops, "process_json") as worker, self.assertRaisesRegex(ops.RunError, "producer_manifest_mismatch"):
            ops.run(self.args)
        worker.assert_not_called()

    def test_disabled_and_stop_file_prevent_key_read_and_all_workers(self):
        with patch.object(ops, "key_from_file") as key, patch.object(ops, "process_json") as worker:
            self.args.enabled = "0"
            self.assertEqual(ops.run(self.args)["status"], "disabled")
            self.assertFalse(self.args.state.exists())
            self.args.enabled = "1"
            self.runtime_env.write_text("CONFENGE_NEWS_ENABLED=0\n")
            self.assertEqual(ops.run(self.args)["status"], "disabled")
            self.runtime_env.write_text("")
            (self.args.state / "private").mkdir(parents=True)
            (self.args.state / "private/STOP").touch()
            self.assertEqual(ops.run(self.args)["status"], "disabled")
        key.assert_not_called()
        worker.assert_not_called()

    def test_missing_key_fails_before_state_creation_or_worker(self):
        self.args.key_file = None
        with patch.object(ops, "process_json") as worker, self.assertRaisesRegex(ops.RunError, "missing_openai_api_key"):
            ops.run(self.args)
        self.assertFalse(self.args.state.exists())
        worker.assert_not_called()

    def test_key_file_is_private_owned_regular_file(self):
        self.assertEqual(ops.key_from_file(self.key_file), KEY)
        self.key_file.chmod(0o644)
        with self.assertRaisesRegex(ops.RunError, "unsafe_api_key_file"):
            ops.key_from_file(self.key_file)
        self.key_file.chmod(0o600)
        alias = self.root / "key-alias"
        alias.symlink_to(self.key_file)
        with self.assertRaisesRegex(ops.RunError, "unsafe_api_key_file"):
            ops.key_from_file(alias)

    def test_runtime_key_is_literal_and_never_executes_shell(self):
        marker = self.root / "shell-must-not-run"
        literal = f"$(touch {marker})"
        self.runtime_env.write_text(f'export OPENAI_API_KEY="{literal}"\nIGNORED_SECRET=hidden\n')
        self.assertEqual(ops.runtime_settings(self.runtime_env), {"OPENAI_API_KEY": literal})
        self.args.key_file = None
        with patch.object(ops, "process_json", side_effect=self.fake_worker):
            result = ops.run(self.args)
        self.assertEqual(result["calls"], 0)
        self.assertFalse(marker.exists())
        self.assertEqual(self.workers[-1]["env"]["OPENAI_API_KEY"], literal)
        self.assertNotIn(literal, json.dumps(result))

    def test_private_lock_blocks_concurrent_round_before_unpack_or_workers(self):
        private = self.args.state / "private"
        private.mkdir(parents=True)
        with (private / ".orchestrator.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(ops, "unpack_producer") as unpack, patch.object(ops, "process_json") as worker:
                self.assertEqual(ops.run(self.args), {"status": "locked", "published": 0, "calls": 0})
        unpack.assert_not_called()
        worker.assert_not_called()

    def test_symlink_lock_does_not_change_external_file(self):
        private = self.args.state / "private"
        private.mkdir(parents=True)
        outside = self.root / "outside-lock"
        outside.write_text("must stay intact")
        outside.chmod(0o644)
        (private / ".orchestrator.lock").symlink_to(outside)
        with patch.object(ops, "process_json") as worker, self.assertRaisesRegex(ops.RunError, "unsafe_news_lock"):
            ops.run(self.args)
        worker.assert_not_called()
        self.assertEqual(outside.read_text(), "must stay intact")
        self.assertEqual(outside.stat().st_mode & 0o777, 0o644)

    def test_symlink_public_or_private_directory_is_refused(self):
        outside = self.root / "outside-directory"
        outside.mkdir(mode=0o750)
        for name in ("private", "public"):
            with self.subTest(name=name):
                self.args.state.mkdir(exist_ok=True)
                alias = self.args.state / name
                alias.symlink_to(outside)
                with self.assertRaisesRegex(ops.RunError, "unsafe_news_directory"):
                    ops.run(self.args)
                alias.unlink()
                self.assertEqual(outside.stat().st_mode & 0o777, 0o750)

    def test_public_directory_remains_traversable_under_restrictive_umask(self):
        previous = os.umask(0o077)
        try:
            with patch.object(ops, "process_json", side_effect=self.fake_worker):
                result = ops.run(self.args)
        finally:
            os.umask(previous)
        self.assertEqual(result["producer_commit"], PRODUCER_SHA)
        self.assertEqual(self.args.state.stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.args.state / "public").stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.args.state / "private").stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.args.state / "private/published-ids.json").stat().st_mode & 0o777, 0o600)
        self.assertEqual(list((self.args.state / "private/producer").iterdir()), [])

    def test_key_reaches_only_publisher_and_cli_matches_pinned_producer(self):
        with patch.dict(os.environ, {"INHERITED_SECRET": "must not reach children"}), \
                patch.object(ops, "process_json", side_effect=self.fake_worker):
            result = ops.run(self.args)
        source, producer, publisher = self.workers
        self.assertNotIn("OPENAI_API_KEY", source["env"])
        self.assertNotIn("OPENAI_API_KEY", producer["env"])
        self.assertNotIn("INHERITED_SECRET", publisher["env"])
        self.assertEqual(publisher["env"]["OPENAI_API_KEY"], KEY)
        self.assertEqual(publisher["env"]["CONFENGE_NEWS_RELEASE_SHA"], WEB_SHA)
        self.assertEqual(producer["timeout"], 480)
        self.assertEqual(publisher["timeout"], 1200)
        self.assertIn("--radar-pointer", producer["command"])
        self.assertEqual(producer["command"][-2:], ["--producer-commit", PRODUCER_SHA])
        self.assertEqual(producer["cwd"].parent, self.args.state / "private/producer")
        self.assertFalse(producer["cwd"].exists())
        self.assertNotIn(KEY, json.dumps(result))

    def test_release_change_after_facts_stops_before_openai(self):
        def switch_release(command, cwd, env, timeout):
            result = self.fake_worker(command, cwd, env, timeout)
            if "scripts.public_exports.contract_news" in command:
                next_release = self.release.parent / ("e" * 40)
                next_release.mkdir()
                self.current.unlink()
                self.current.symlink_to(next_release)
            return result
        with patch.object(ops, "process_json", side_effect=switch_release), self.assertRaisesRegex(ops.RunError, "release_not_current"):
            ops.run(self.args)
        self.assertEqual(len(self.workers), 2)
        self.assertEqual(list((self.args.state / "private/producer").iterdir()), [])

    def test_worker_error_never_relays_arbitrary_output_or_credentials(self):
        from subprocess import CompletedProcess
        raw = f"Authorization: Bearer {KEY}\nprivate facts"
        process = CompletedProcess(["python"], 1, stdout=raw, stderr=raw)
        with patch.object(ops.subprocess, "run", return_value=process), \
                self.assertRaisesRegex(ops.RunError, "worker_invalid_response") as failure:
            ops.process_json(["python"], self.release, {}, 1)
        self.assertNotIn(KEY, str(failure.exception))

    def test_real_publisher_cli_preserves_safe_stderr_error_without_key_or_api(self):
        facts = self.root / "invalid-facts.json"
        facts.write_text(json.dumps({"schema": "wrong"}))
        private, public = self.root / "cli-private", self.root / "cli-public"
        command = [ops.sys.executable, "-S", "-m", "scripts.contract_news", "generate",
                   "--input", str(facts), "--state-dir", str(private),
                   "--output-dir", str(public), "--dry-run"]
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PYTHONDONTWRITEBYTECODE": "1"}
        with self.assertRaisesRegex(ops.RunError, "^invalid_facts_contract$"):
            ops.process_json(command, RUN_PATH.parents[2], env, 10)
        self.assertFalse(private.exists())
        self.assertFalse(public.exists())

    def test_worker_stderr_fallback_requires_failure_empty_stdout_and_safe_json_code(self):
        from subprocess import CompletedProcess
        raw = f"Authorization: Bearer {KEY}\nprivate facts"
        safe_error = json.dumps({"status": "error", "code": "invalid_json_file", "detail": raw})
        cases = (
            (1, "", safe_error, "invalid_json_file"),
            (1, "", raw, "worker_invalid_response"),
            (1, "", json.dumps({"code": raw}), "worker_failed"),
            (1, "", json.dumps({"code": {"secret": KEY}}), "worker_failed"),
            (1, "", json.dumps([{"code": "invalid_json_file"}]), "worker_failed"),
            (1, "", json.dumps({"detail": raw}), "worker_failed"),
            (0, "", safe_error, "worker_invalid_response"),
            (1, raw, safe_error, "worker_invalid_response"),
            (1, " ", safe_error, "worker_invalid_response"),
            (1, json.dumps({"code": "producer_unavailable"}), safe_error, "producer_unavailable"),
        )
        for returncode, stdout, stderr, expected in cases:
            with self.subTest(returncode=returncode, expected=expected):
                process = CompletedProcess(["python"], returncode, stdout=stdout, stderr=stderr)
                with patch.object(ops.subprocess, "run", return_value=process), self.assertRaises(ops.RunError) as failure:
                    ops.process_json(["python"], self.release, {}, 1)
                self.assertEqual(str(failure.exception), expected)
                self.assertNotIn(KEY, str(failure.exception))
        success = CompletedProcess(["python"], 0, stdout='{"status":"ok"}', stderr=raw)
        with patch.object(ops.subprocess, "run", return_value=success):
            self.assertEqual(ops.process_json(["python"], self.release, {}, 1), {"status": "ok"})

    def test_producer_summary_only_exposes_bounded_counts_and_header_clock(self):
        facts = self.root / "facts.private.json"
        facts.write_text(json.dumps({
            "schema": ops.FACT_SCHEMA, "producer": "extra-cli", "source_as_of": "2026-11-19T12:30:00-03:00",
            "records": [{"buyer": "private buyer", "object": "private object", "supplier": KEY,
                         "id": "11222333000181-2-000123/2026", "source_url": "https://pncp.gov.br/private"}],
        }))
        response = {
            "ok": True, "schema": ops.FACT_SCHEMA, "official_requests": 4, "verified_records": 1,
            "excluded": {"object_not_engineering": 1, "private error " + KEY: 2},
            "raw_error": KEY, "source_as_of": KEY, "buyer": "private buyer", "records": [{"secret": KEY}],
        }
        result = ops.producer_summary(response, facts)
        self.assertEqual(result, {"official_requests": 4, "verified_records": 1, "excluded_count": 3,
                                  "source_as_of": "2026-11-19T15:30:00Z"})
        serialized = json.dumps(result)
        for forbidden in (KEY, "private", "11222333000181", "pncp.gov.br", "object_not_engineering"):
            self.assertNotIn(forbidden, serialized)

    def test_producer_summary_omits_invalid_and_unreconciled_counts(self):
        valid = {"ok": True, "schema": ops.FACT_SCHEMA, "official_requests": 2,
                 "verified_records": 1, "excluded": {"object_not_engineering": 1}}
        absent = self.root / "absent-facts.json"
        for changes in (
            {"ok": 1}, {"schema": "wrong"}, {"official_requests": True}, {"official_requests": "2"},
            {"official_requests": 21}, {"official_requests": -1}, {"verified_records": False},
            {"verified_records": 3}, {"verified_records": -1}, {"excluded": [1]},
            {"excluded": {"reason": KEY}}, {"excluded": {"reason": True}},
            {"excluded": {"reason": -1}}, {"excluded": {"reason": 21}},
            {"excluded": {"reason": 0}}, {"excluded": {str(index): 0 for index in range(21)}},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(ops.producer_summary({**valid, **changes}, absent), {})
        self.assertEqual(ops.producer_summary(valid, absent),
                         {"official_requests": 2, "verified_records": 1, "excluded_count": 1})
        self.assertEqual(ops.producer_summary({**valid, "official_requests": 0, "verified_records": 0, "excluded": {}}, absent),
                         {"official_requests": 0, "verified_records": 0, "excluded_count": 0})

    def test_source_clock_rejects_invalid_formats_dates_and_symlink(self):
        response = {"ok": True, "schema": ops.FACT_SCHEMA, "official_requests": 0, "verified_records": 0, "excluded": {}}
        counts = {"official_requests": 0, "verified_records": 0, "excluded_count": 0}
        facts = self.root / "facts.private.json"
        for clock in (None, True, 2026, {"secret": KEY}, "2026-11-19T12:30:00", "2026-02-30T12:30:00Z",
                      "2026-11-19T12:30:00Z\n" + KEY, "2026-11-19T12:30:00+99:00", "2026-11-19T12:30:00+00:60",
                      "0001-01-01T00:00:00+23:59", "9999-12-31T23:59:00-23:59"):
            with self.subTest(clock=clock):
                facts.write_text(json.dumps({"schema": ops.FACT_SCHEMA, "producer": "extra-cli", "source_as_of": clock}))
                self.assertEqual(ops.producer_summary(response, facts), counts)
        facts.write_text("{invalid private json " + KEY)
        self.assertEqual(ops.producer_summary(response, facts), counts)
        alias = self.root / "facts-alias.json"
        alias.symlink_to(facts)
        self.assertEqual(ops.producer_summary(response, alias), counts)

    def test_orchestrator_returns_sanitized_producer_summary_without_raw_payload(self):
        def worker(command, cwd, env, timeout):
            result = self.fake_worker(command, cwd, env, timeout)
            if "scripts.public_exports.contract_news" in command:
                facts = self.args.state / "private/facts.json"
                facts.write_text(json.dumps({"schema": ops.FACT_SCHEMA, "producer": "extra-cli",
                                             "source_as_of": "2026-11-19T15:30:00.123456Z", "records": [{"key": KEY}]}))
                result.update(schema=ops.FACT_SCHEMA, official_requests=2, verified_records=0,
                              excluded={KEY: 2}, raw_error=KEY)
            return result
        with patch.object(ops, "process_json", side_effect=worker):
            result = ops.run(self.args)
        self.assertEqual(result["producer_summary"], {
            "official_requests": 2, "verified_records": 0, "excluded_count": 2,
            "source_as_of": "2026-11-19T15:30:00.123456Z",
        })
        self.assertNotIn(KEY, json.dumps(result))


if __name__ == "__main__":
    unittest.main()
