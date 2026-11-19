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
                    manifest_digest=None, extra=None):
        manifest = {
            "schema": "confenge.contract-news-producer/v1", "repository": "tjsasakifln/extra-cli",
            "fact_contract": "confenge.contract-news-facts/v1", "producer_commit": manifest_sha,
            "files": {PRODUCER_PATH: manifest_digest or hashlib.sha256(content).hexdigest()},
        }
        with tarfile.open(self.bundle, "w:gz") as archive:
            for name, raw in ((PRODUCER_PATH, content), ("producer-manifest.json", json.dumps(manifest).encode())):
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


if __name__ == "__main__":
    unittest.main()
