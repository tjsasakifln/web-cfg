"""Release eligibility and API boundaries before any news publication work."""
from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.ops import contract_news_release as gate

SHA = "a" * 40
REF = "refs/heads/main"
ROOT = Path(__file__).resolve().parents[2]
PRIVATE = "Authorization: Bearer sk-private-value\nprivate source details"


def run_fixture(**changes):
    return {"id": 2000, "run_number": 2, "run_attempt": 1, "name": "netcup-release",
            "path": gate.WORKFLOW, "head_sha": SHA, "head_branch": "main", "event": "push",
            "repository": {"full_name": gate.REPOSITORY}, "head_repository": {"full_name": gate.REPOSITORY},
            "status": "completed", "conclusion": "success", **changes}


def job_fixture(**changes):
    return {"id": 9000, "run_id": 2000, "run_attempt": 1, "head_sha": SHA, "head_branch": "main",
            "name": gate.PROMOTE_JOB, "status": "completed", "conclusion": "success", **changes}


def response(field, rows, *, total=None):
    payload = {"total_count": len(rows) if total is None else total, field: rows}
    return subprocess.CompletedProcess(["gh"], 0, stdout=json.dumps(payload), stderr="")


class ReleaseGateTests(unittest.TestCase):
    def check(self):
        return gate.check_release(SHA, gate.REPOSITORY, REF)

    def test_exact_completed_release_and_current_promote_attempt_are_required(self):
        run = run_fixture(run_attempt=3)
        results = [response("workflow_runs", [run]), response("jobs", [job_fixture(run_attempt=3)]),
                   response("workflow_runs", [run])]
        with patch.object(gate.subprocess, "run", side_effect=results) as api:
            self.assertEqual(self.check(), {"ready": True, "status": "release_accepted", "run_id": 2000, "run_attempt": 3})
        commands = [call.args[0] for call in api.call_args_list]
        self.assertIn("/workflows/netcup-release.yml/runs?branch=main&head_sha=" + SHA, commands[0][-1])
        self.assertNotIn("status=success", commands[0][-1])
        self.assertIn("/runs/2000/attempts/3/jobs?per_page=100", commands[1][-1])
        for call in api.call_args_list:
            self.assertEqual(call.args[0][1:8], ["api", "--hostname", "github.com", "--method", "GET", "--paginate", call.args[0][-1]])
            self.assertEqual(call.kwargs["timeout"], 30)
            self.assertTrue(call.kwargs["capture_output"])
            self.assertNotIn("shell", call.kwargs)

    def test_any_active_exact_run_blocks_an_older_or_newer_success(self):
        completed = run_fixture()
        for status in sorted(gate.ACTIVE_STATUSES):
            for identifier, number in ((1000, 1), (3000, 3)):
                with self.subTest(status=status, number=number):
                    active = run_fixture(id=identifier, run_number=number, run_attempt=2, status=status, conclusion=None)
                    with patch.object(gate.subprocess, "run", return_value=response("workflow_runs", [completed, active])) as api:
                        self.assertEqual(self.check(), {"ready": False, "status": "waiting_for_release_completion"})
                    self.assertEqual(api.call_count, 1)

    def test_latest_failed_release_cannot_reuse_an_old_success(self):
        runs = [run_fixture(id=1000, run_number=1), run_fixture(conclusion="failure")]
        with patch.object(gate.subprocess, "run", return_value=response("workflow_runs", runs)) as api:
            self.assertEqual(self.check(), {"ready": False, "status": "release_not_successful"})
        self.assertEqual(api.call_count, 1)

    def test_no_matching_run_waits_without_reading_jobs(self):
        with patch.object(gate.subprocess, "run", return_value=response("workflow_runs", [])) as api:
            self.assertEqual(self.check(), {"ready": False, "status": "waiting_for_release_run"})
        self.assertEqual(api.call_count, 1)

    def test_package_only_and_stage_verify_success_do_not_prove_promotion(self):
        for jobs in ([], [job_fixture(conclusion="skipped")], [job_fixture(status="in_progress", conclusion=None)],
                     [job_fixture(conclusion="failure")]):
            with self.subTest(jobs=jobs), patch.object(
                gate.subprocess, "run", side_effect=[response("workflow_runs", [run_fixture()]), response("jobs", jobs)]
            ):
                self.assertEqual(self.check(), {"ready": False, "status": "release_promotion_not_successful"})

    def test_repository_ref_sha_and_workflow_must_match_exactly(self):
        for changes in ({"repository": {"full_name": "elsewhere/web-cfg"}},
                        {"head_repository": {"full_name": "fork/web-cfg"}}, {"head_branch": "feature"},
                        {"head_sha": "b" * 40}, {"path": ".github/workflows/site-ci.yml"},
                        {"name": "site-ci"}, {"event": "pull_request"}, {"event": []}):
            with self.subTest(changes=changes):
                with patch.object(gate.subprocess, "run", return_value=response("workflow_runs", [run_fixture(**changes)])) as api, \
                        self.assertRaisesRegex(gate.ReleaseGateError, "^release_identity_mismatch$"):
                    self.check()
                self.assertEqual(api.call_count, 1)
        with patch.object(gate.subprocess, "run") as api:
            for sha, repository, ref in (("short", gate.REPOSITORY, REF), (SHA, "fork/web-cfg", REF),
                                         (SHA, gate.REPOSITORY, "refs/heads/feature")):
                with self.assertRaisesRegex(gate.ReleaseGateError, "^invalid_release_context$"):
                    gate.check_release(sha, repository, ref)
        api.assert_not_called()

    def test_job_cannot_belong_to_a_different_run_attempt_sha_or_ref(self):
        for changes in ({"run_id": 1000}, {"run_attempt": 2}, {"run_attempt": True},
                        {"head_sha": "b" * 40}, {"head_branch": "feature"}):
            with self.subTest(changes=changes), patch.object(
                gate.subprocess, "run", side_effect=[response("workflow_runs", [run_fixture()]),
                                                    response("jobs", [job_fixture(**changes)])]
            ), self.assertRaisesRegex(gate.ReleaseGateError, "^release_job_identity_mismatch$"):
                self.check()

    def test_rerun_started_during_job_lookup_blocks_publication(self):
        for final in (run_fixture(run_attempt=2, status="queued", conclusion=None),
                      run_fixture(run_attempt=2), run_fixture(id=3000, run_number=3)):
            with self.subTest(final=final):
                with patch.object(gate.subprocess, "run", side_effect=[response("workflow_runs", [run_fixture()]),
                                                                        response("jobs", [job_fixture()]),
                                                                        response("workflow_runs", [final])]):
                    result = self.check()
                self.assertFalse(result["ready"])
                self.assertIn(result["status"], {"waiting_for_release_completion", "release_changed_during_check"})

    def test_all_api_pages_are_read_and_a_partial_page_cannot_hide_an_active_run(self):
        page1 = response("workflow_runs", [run_fixture()], total=2)
        page2 = response("workflow_runs", [run_fixture(id=1000, run_number=1, status="waiting", conclusion=None)], total=2)
        combined = subprocess.CompletedProcess(["gh"], 0, stdout=page1.stdout + "\n" + page2.stdout, stderr="")
        with patch.object(gate.subprocess, "run", return_value=combined):
            self.assertEqual(self.check()["status"], "waiting_for_release_completion")
        with patch.object(gate.subprocess, "run", return_value=page1), \
                self.assertRaisesRegex(gate.ReleaseGateError, "^release_api_invalid_response$"):
            self.check()

    def test_malformed_api_payloads_and_unknown_statuses_are_rejected(self):
        invalid = ["", PRIVATE, "[]", "{}", json.dumps({"total_count": True, "workflow_runs": []}),
                   json.dumps({"total_count": 1, "workflow_runs": [PRIVATE]}),
                   response("workflow_runs", [run_fixture(), run_fixture()]).stdout,
                   response("workflow_runs", [run_fixture(run_attempt=True)]).stdout,
                   response("workflow_runs", [run_fixture(status={"raw": PRIVATE})]).stdout,
                   response("workflow_runs", [run_fixture(conclusion={"raw": PRIVATE})]).stdout]
        for raw in invalid:
            with self.subTest(raw=raw):
                proc = subprocess.CompletedProcess(["gh"], 0, stdout=raw, stderr=PRIVATE)
                with patch.object(gate.subprocess, "run", return_value=proc), \
                        self.assertRaisesRegex(gate.ReleaseGateError, "^release_api_invalid_response$") as error:
                    self.check()
                self.assertNotIn(PRIVATE, str(error.exception))

    def test_gh_failure_timeout_and_os_error_never_expose_raw_output(self):
        for failure in (OSError(PRIVATE), subprocess.TimeoutExpired(["gh"], 30, output=PRIVATE, stderr=PRIVATE)):
            with self.subTest(kind=type(failure).__name__), patch.object(gate.subprocess, "run", side_effect=failure), \
                    self.assertRaisesRegex(gate.ReleaseGateError, "^release_api_unavailable$"):
                self.check()
        proc = subprocess.CompletedProcess(["gh"], 1, stdout=PRIVATE, stderr=PRIVATE)
        with patch.object(gate.subprocess, "run", return_value=proc), \
                self.assertRaisesRegex(gate.ReleaseGateError, "^release_api_unavailable$"):
            self.check()

    def test_cli_emits_only_safe_status_and_github_outputs(self):
        args = ["--release-sha", SHA, "--repository", gate.REPOSITORY, "--ref", REF]
        proc = subprocess.CompletedProcess(["gh"], 1, stdout=PRIVATE, stderr=PRIVATE)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "github-output"
            stdout = io.StringIO()
            with patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}), contextlib.redirect_stdout(stdout), \
                    patch.object(gate.subprocess, "run", return_value=proc):
                self.assertEqual(gate.main(args), 1)
            self.assertEqual(json.loads(stdout.getvalue()), {"ready": False, "status": "release_api_unavailable"})
            self.assertEqual(output.read_text(), "ready=false\nstatus=release_api_unavailable\n")
            self.assertNotIn(PRIVATE, stdout.getvalue() + output.read_text())

    def test_workflow_gates_every_step_that_can_read_a_key_or_publish(self):
        release_workflow = (ROOT / gate.WORKFLOW).read_text()
        self.assertTrue(release_workflow.startswith("name: netcup-release\n"))
        self.assertIn("  promote:\n    name: " + gate.PROMOTE_JOB + "\n", release_workflow)
        workflow = (ROOT / ".github/workflows/contract-news.yml").read_text()
        self.assertIn("  actions: read", workflow)
        self.assertIn("group: contract-news-publication", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        for name in ("Read approved source revision", "Package the fixed producer without database credentials",
                     "Run the currently deployed publisher", "Verify public archive and article metadata"):
            step = workflow.split("      - name: " + name, 1)[1].split("      - ", 1)[0]
            self.assertIn("if: steps.release.outputs.ready == 'true'", step)
        self.assertLess(workflow.index("scripts/ops/contract_news_release.py"), workflow.index("NEWS_OPENAI_KEY:"))


if __name__ == "__main__":
    unittest.main()
