"""Drive the shipped CLI entry: python3 -m scripts.growth_accounting."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from scripts.growth_accounting.__main__ import main
from tests.growth_accounting.helpers import exponential_clicks, synthetic_input

ROOT = Path(__file__).resolve().parents[2]


def test_cli_build_validate_current_state(tmp_path: Path):
    out = tmp_path / "out"
    code = main(
        [
            "build",
            "--input",
            str(ROOT / "data/growth-accounting/baseline/current-state-input.v1.json"),
            "--out",
            str(out),
            "--stem",
            "current-state",
        ]
    )
    assert code == 0
    report = json.loads((out / "current-state.json").read_text(encoding="utf-8"))
    assert report["current_state"] == "INSUFFICIENT_EVIDENCE"
    vcode = main(["validate", "--report", str(out / "current-state.json")])
    assert vcode == 0


def test_cli_module_fail_closed_pii(tmp_path: Path, capsys):
    payload = synthetic_input(n_cohorts=1, clicks_for=exponential_clicks)
    payload["daily"][0]["email"] = "person@example.com"
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    code = main(["build", "--input", str(path), "--out", str(tmp_path / "out")])
    assert code == 1
    err = capsys.readouterr().err
    body = json.loads(err)
    assert body["ok"] is False
    assert body["reason"] == "QUERY_LEVEL_PII"


def test_cli_subprocess_matches_module(tmp_path: Path):
    out = tmp_path / "cli"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.growth_accounting",
            "build",
            "--input",
            str(ROOT / "data/growth-accounting/baseline/current-state-input.v1.json"),
            "--out",
            str(out),
        ],
        cwd=str(ROOT),
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    summary = json.loads(proc.stdout)
    assert summary["current_state"] == "INSUFFICIENT_EVIDENCE"
    assert summary["cohort_days"] == 28
    assert summary["query_to_lead_join"] is False
    assert summary["page_count_kpi"] is False
    assert summary["exponential_gate_eligible"] is False
