"""Receipt for one diagnostic experiment; never emits a release qualification."""
from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SOURCE_SHA = "608256ef5b009aa55e51936d72ab2a1853f3a80e"
ARTIFACT_HASH = "4f63ac382fa6c0431c8590ccc4fd2f88421b5f03990e9884990e2f825d797559"
MANIFEST_HASH = "134e4b373398c8eed27b313b858cc4860fe1d2eb6a407f22a616a25fdba02a22"
VERIFIER_HASH = "3359d8c4227162984b44dd84d64fb63c6352853a393ed5c3bc6b4a7903479424"
VERIFIER_SOURCES = (
    "scripts/site/run_lighthouse.mjs",
    "scripts/site/lighthouse_measure_child.mjs",
    "scripts/site/lighthouse_infra.mjs",
    "scripts/site/lighthouse_thresholds.mjs",
    "scripts/site/lighthouse_payload.mjs",
    "scripts/site/runtime_lighthouse_acceptance.mjs",
)
BUNDLE_HASH = "0af8bb25445b77c728cda391f94ee350862247432d9695982fb17820724771ab"
INVENTORY_HASH = "278c39c93c6141c51a98d5197e2981107213e715f0692b130986288b5e4c5839"
LABEL = "seo852-renderer-waits"


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path: Path):
    return json.loads(path.read_text())


def save(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def command(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def inputs(root: Path, output: Path) -> None:
    identity = read(root / "_site/.well-known/build-info.json")
    assert command("git", "rev-parse", "HEAD") == SOURCE_SHA
    assert identity["commit"] == SOURCE_SHA
    assert identity["artifact_hash"] == ARTIFACT_HASH
    assert identity["manifest_hash"] == MANIFEST_HASH
    verifier = hashlib.sha256()
    for relative in VERIFIER_SOURCES:
        verifier.update(relative.encode() + b"\0")
        verifier.update((root / relative).read_bytes() + b"\0")
    assert verifier.hexdigest() == VERIFIER_HASH
    node = command("node", "--version")
    chrome = command(os.environ["CHROME_PATH"], "--version")
    lighthouse = read(root / "node_modules/lighthouse/package.json")["version"]
    puppeteer = read(root / "node_modules/puppeteer-core/package.json")["version"]
    assert node == "v22.23.4"
    assert "152.0.7977.42" in chrome
    assert lighthouse == "13.4.1"
    assert puppeteer == "25.8.0"
    experiment_root = Path(__file__).resolve().parents[2]
    experiment_files = [
        "scripts/diagnostics/lighthouse_scheduler_observer.py",
        "scripts/diagnostics/lighthouse_cdp_observer.mjs",
        "scripts/diagnostics/seo852_record_experiment.py",
        "docs/seo/2026-11-20-renderer-wait-diagnostic.md",
        ".github/workflows/seo852-renderer-wait-diagnostic.yml",
    ]
    receipt = {
        "schema": "confenge.seo852-renderer-wait-diagnostic/1.0",
        "purpose": "DIAGNOSTIC_ONLY",
        "qualification_eligible": False,
        "original_qualification": "MEASURED_FAIL",
        "source_sha": SOURCE_SHA,
        "experiment_sha": os.environ.get("EXPERIMENT_SHA"),
        "source_workflow_run": 44673482607,
        "input_artifact_ids": [14602804178, 14603342723, 14604345215],
        "artifact_hash": identity["artifact_hash"],
        "restored_content_verification": "PENDING_POST_CAPTURE",
        "manifest_hash": identity["manifest_hash"],
        "verifier_hash": verifier.hexdigest(),
        "toolchain": {"node": node, "chrome": chrome,
                      "lighthouse": lighthouse, "puppeteer": puppeteer},
        "experiment_files": {path: digest(experiment_root / path) for path in experiment_files},
        "runner": {name: os.environ.get(name) for name in
                   ("RUNNER_OS", "RUNNER_ARCH", "RUNNER_ENVIRONMENT", "ImageOS", "ImageVersion")},
        "kernel": platform.release(),
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "scope": {"paths": ["/"], "runs": 3, "label": LABEL},
        "observers_change_measurement_conditions": True,
        "clock_alignment": "NOT_YET_REVIEWED",
        "causal_result": "NOT_INTERPRETED",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    save(output / "inputs.json", receipt)
    print(json.dumps({"purpose": receipt["purpose"], "qualification_eligible": False,
                      "source_sha": SOURCE_SHA, "toolchain": receipt["toolchain"]}))


def validate_observers(output: Path, manifests: dict[int, dict], renderer_by_run: dict) -> dict:
    scheduler = output / "scheduler.jsonl"
    rows = [json.loads(line) for line in scheduler.read_text().splitlines()]
    assert rows[0]["event"] == "header" and rows[-1]["event"] == "end"
    start, end = rows[0], rows[-1]
    samples = [row for row in rows if row["event"] == "sample"]
    assert start["release_qualification_eligible"] is False
    assert start["period_ns"] == 20_000_000
    assert end["collection_completed"] and end["thread_observations_available"]
    assert end["root_identity_observed"] and end["sample_errors"] == 0
    assert len(samples) == end["samples"] > 0
    assert [row["sequence"] for row in samples] == list(range(len(samples)))
    assert not any(row["event"] == "sample_error" for row in rows)
    observed_threads = sorted({
        (thread["pid"], thread["tid"], thread["process_starttime_ticks"],
         thread["thread_starttime_ticks"])
        for row in samples for thread in row["threads"] if thread.get("available")
    })
    assert observed_threads
    observed_pairs = {(row[0], row[1]) for row in observed_threads}
    for run, pairs in renderer_by_run.items():
        assert pairs and pairs <= observed_pairs, f"main renderer absent from scheduler observations: run {run}"
    cdp_files = sorted((output / "cdp").glob("*.jsonl"))
    captured = {}
    extras = []
    for path in cdp_files:
        events = [json.loads(line) for line in path.read_text().splitlines()]
        assert events and events[0]["phase"] == "observer_start"
        header = events[0]
        if header.get("preflight"):
            extras.append({"file": path.name, "preflight": True})
            continue
        run = header.get("run")
        attempt = header.get("attempt")
        if run not in manifests or attempt != manifests[run]["attempt"]:
            extras.append({"file": path.name, "run": run, "attempt": attempt})
            continue
        assert header["spec_valid"] and header["qualification_eligible"] is False
        assert header["lhr_relative_path"] == f"docs/lighthouse-runs/home-{LABEL}-run-{run}.json"
        assert events[-1]["phase"] == "observer_end"
        footer = events[-1]
        assert footer["pid"] == header["pid"] and footer["status"] == "complete"
        assert footer["records"] == len(events) - 2 > 0
        assert footer["callbacks"] > 0 and footer["connections"] > 0
        allowed_phases = {"send", "response", "response_error", "event"}
        for event in events[1:-1]:
            assert event["phase"] in allowed_phases
            assert event["pid"] == header["pid"]
            assert isinstance(event["connection_index"], int) and event["connection_index"] > 0
            assert isinstance(event["method"], str) and "." in event["method"]
            assert int(event["observed_end_ns"]) >= int(event["observed_begin_ns"])
        sent_methods = {event["method"] for event in events[1:-1] if event["phase"] == "send"}
        assert {"Page.navigate", "Tracing.start", "Tracing.end"} <= sent_methods, "navigation or trace boundary command absent"
        observed_network = {
            (event["method"], event.get("request_id"), event.get("cdp_timestamp_s"))
            for event in events[1:-1] if event["phase"] == "event"
            and event["method"] in {"Network.requestWillBeSent", "Network.responseReceived",
                                    "Network.loadingFinished"}
        }
        expected_network = manifests[run]["expected_network_events"]
        assert {row[0] for row in expected_network} == {
            "Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"
        }, "retained navigation network events incomplete"
        assert expected_network <= observed_network, "CDP events differ from the retained DevTools log"
        for key in ("malformed_messages", "oversized_metadata", "dropped_records",
                    "dropped_pending", "unmatched_responses", "unpaired_loggers",
                    "observer_errors", "pending_commands"):
            assert footer[key] == 0, f"CDP observer {key} is not zero"
        cdp_identity = (header["pid"], header["tid"], int(header["process_start_ticks"]), int(header["thread_start_ticks"]))
        assert cdp_identity in observed_threads, "CDP process identity absent from scheduler observations"
        assert run not in captured, "duplicate observer for a measured run"
        captured[run] = {
            "file": path.name, "pid": header["pid"], "tid": header["tid"],
            "process_start_ticks": header["process_start_ticks"],
            "records": footer["records"], "callbacks": footer["callbacks"],
            "callback_total_ns": footer["callback_total_ns"],
            "callback_max_ns": footer["callback_max_ns"],
        }
    assert set(captured) == {1, 2, 3}, "CDP data absent for a measured run"
    return {
        "scheduler": {key: end.get(key) for key in (
            "child_returncode", "samples", "sample_errors", "skipped_slots",
            "max_lateness_ns", "max_collection_cost_ns", "collection_cpu_ns_total",
            "max_sample_wall_cost_ns", "sample_cpu_ns_total")},
        "sampling_has_gaps": bool(end["skipped_slots"]),
        "observed_thread_identities": observed_threads,
        "main_renderer_threads_by_run": {run: sorted(pairs) for run, pairs in renderer_by_run.items()},
        "cdp_by_measured_run": captured,
        "additional_observer_files": extras,
        "trace_clock_and_thread_window_alignment": "NOT_YET_REVIEWED",
    }


def result(root: Path, output: Path) -> int:
    report = {
        "schema": "confenge.seo852-renderer-wait-diagnostic/1.0",
        "purpose": "DIAGNOSTIC_ONLY",
        "qualification_eligible": False,
        "original_qualification": "MEASURED_FAIL",
        "capture_step_outcome": os.environ.get("CAPTURE_OUTCOME"),
        "clock_alignment": "NOT_YET_REVIEWED",
        "causal_result": "NOT_INTERPRETED",
        "capture_complete": False,
        "errors": [],
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        assert (output / "inputs.json").is_file(), "input receipt missing"
        reports = root / "docs/lighthouse-runs"
        summary = read(reports / f"summary-{LABEL}.json")
        report["measured_terminal_state"] = summary.get("terminal_state")
        report["evaluation"] = summary.get("evaluation")
        report["fatal"] = summary.get("fatal")
        report["unmeasured"] = summary.get("unmeasured")
        assert not summary.get("fatal"), "measurement ended fatally"
        assert not summary.get("unmeasured"), "missing measurements"
        rows = summary["results"]
        assert len(rows) == 3 and sorted((r["path"], r["run"]) for r in rows) == [
            ("/", 1), ("/", 2), ("/", 3)
        ], "scope differs from the registered three home measurements"
        report["measurements"] = [
            {key: row.get(key) for key in
             ("path", "run", "performance", "tbt_ms", "lcp_ms", "cls", "longest_own_task_ms")}
            for row in rows
        ]
        manifests = []
        measured_manifests = {}
        renderer_by_run = {}
        for run in (1, 2, 3):
            manifest_path = reports / f"home-{LABEL}-run-{run}.diagnostics.json"
            manifest = read(manifest_path)
            assert manifest["status"] == "complete" and not manifest["errors"]
            assert manifest["path"] == "/" and manifest["run"] == run
            assert set(manifest["files"]) == {"trace", "devtoolslog"}
            measured_manifests[run] = manifest
            for item in [manifest["lhr"], *manifest["files"].values()]:
                path = reports / item["file"]
                assert path.resolve().parent == reports.resolve()
                assert path.stat().st_size == item["bytes"]
                assert digest(path) == item["sha256"]
            network_log = read(reports / manifest["files"]["devtoolslog"]["file"])
            manifest["expected_network_events"] = {
                (event["method"], event["params"]["requestId"], event["params"]["timestamp"])
                for event in network_log if event.get("method") in {
                    "Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"
                }
            }
            trace = read(reports / manifest["files"]["trace"]["file"])
            main_pids = {event["args"]["data"]["processId"] for event in trace["traceEvents"]
                if event.get("name") == "FrameCommittedInBrowser"
                and event.get("args", {}).get("data", {}).get("isOutermostMainFrame") is True}
            renderer_by_run[run] = {(pid, pid) for pid in main_pids}
            manifests.append({"run": run, "sha256": digest(manifest_path)})
        report["diagnostic_manifests"] = manifests
        report["observers"] = validate_observers(output, measured_manifests, renderer_by_run)
        sys.path.insert(0, str(root))
        from scripts.pseo.reproducible import content_tree_hash
        content_hash = content_tree_hash(root / "_site")
        bundle_hash = digest(root / "dist/netcup" / SOURCE_SHA / f"confenge-web-{SOURCE_SHA}.tar.gz")
        inventory_hash = digest(root / "seo/PUBLIC-ARTIFACT-MANIFEST.json")
        assert content_hash == ARTIFACT_HASH, "restored public content differs"
        assert bundle_hash == BUNDLE_HASH, "restored bundle differs"
        assert inventory_hash == INVENTORY_HASH, "restored route inventory differs"
        report["restored_content_verification"] = {"artifact_hash": content_hash,
            "bundle_hash": bundle_hash, "inventory_hash": inventory_hash, "verified": True}
        scheduler = output / "scheduler.jsonl"
        cdp_files = sorted((output / "cdp").glob("*.jsonl"))
        assert scheduler.is_file() and scheduler.stat().st_size, "scheduler output absent"
        assert cdp_files and all(path.stat().st_size for path in cdp_files), "CDP output absent"
        report["observer_files"] = {
            str(path.relative_to(output)): {"bytes": path.stat().st_size, "sha256": digest(path)}
            for path in [scheduler, *cdp_files]
        }
        report["data_integrity_verified"] = True
        report["capture_complete"] = not report["observers"]["sampling_has_gaps"]
        if not report["capture_complete"]:
            report["errors"].append("SCHEDULER_SAMPLING_GAPS_RETAINED_FOR_REVIEW")
    except Exception as error:
        report["errors"].append(f"{type(error).__name__}: {error}")
    save(output / "result.json", report)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["capture_complete"] else 1


if __name__ == "__main__":
    root = Path.cwd()
    output = Path(os.environ["RUNNER_TEMP"]) / "seo852-diagnostic"
    if sys.argv[1:] == ["inputs"]:
        inputs(root, output)
    elif sys.argv[1:] == ["result"]:
        raise SystemExit(result(root, output))
    else:
        raise SystemExit("usage: seo852_record_experiment.py inputs|result")
