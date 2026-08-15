"""Drive the shipped #400 consumer/gate from contract fixtures.

Fixtures are synthetic. They are not a second truth plane and are never
copied into the live extra-cli export path.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from scripts.research.citation import dataset_jsonld
from scripts.research.claims import coverage_allows_national, validate_claim_gate
from scripts.research.contract import (
    REASON_COVERAGE_INSUFFICIENT,
    REASON_FRESHNESS_STALE,
    REASON_NATIONAL_DENOMINATOR_MISSING,
    evaluate_national_claim_gate,
)
from scripts.research.pack import build_pack
from scripts.research.read_model import (
    adapt_research_aggregate_to_snapshot,
    resolve_edition_source,
)
from scripts.research.snapshot import load_snapshot

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
NOW = date(2026, 8, 15)


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def snapshot():
    return load_snapshot(ROOT / "data/pseo")


def test_insufficient_coverage_fixture_rejects_national_and_keeps_unknown(snapshot):
    export = _load_fixture("research-aggregate-v1-insufficient-coverage.json")
    gate = evaluate_national_claim_gate(export, now=NOW)
    assert gate.present is True
    assert gate.passed is False
    assert gate.consumed is False
    assert REASON_COVERAGE_INSUFFICIENT in gate.reason_codes
    assert REASON_NATIONAL_DENOMINATOR_MISSING in gate.reason_codes
    assert gate.national_universe_complete is False

    series = export["series"][0]
    assert series["contract_count"] is None
    assert series["total_value_brl"] is None
    assert "UNKNOWN" in series["reason_codes"]

    adapted = adapt_research_aggregate_to_snapshot(export)
    assert adapted["markets"][0]["contract_count"] is None
    assert adapted["markets"][0]["total_value"] is None

    resolved = resolve_edition_source(snapshot, export, now=NOW, gate=gate)
    assert resolved["source"] == "pseo_snapshot_4uf_preview"
    assert resolved["extra_cli_public_read_export_consumed"] is False

    pack = build_pack(snapshot, read_model=export, now=NOW)
    assert pack["verdict"] != "PUBLISH"
    assert pack["verdict"] == "NEEDS_DATA"
    assert pack["indexation"]["indexable"] is False
    assert "noindex" in pack["indexation"]["robots"]
    assert pack["coverage"]["national_universe_complete"] is False
    assert pack["reproducibility"]["extra_cli_public_read_export_consumed"] is False
    assert coverage_allows_national(pack) is False
    assert validate_claim_gate(pack) == []
    assert "PUBLISH" not in pack["indexation"]["robots"]


def test_stale_fixture_rejects_national_even_with_27_ufs(snapshot):
    export = _load_fixture("research-aggregate-v1-stale.json")
    gate = evaluate_national_claim_gate(export, now=NOW)
    assert gate.present is True
    assert gate.passed is False
    assert REASON_FRESHNESS_STALE in gate.reason_codes
    assert gate.freshness_age_days is not None
    assert gate.freshness_age_days > export["freshness"]["max_age_days"]
    # Coverage shape is national-looking; freshness still blocks PUBLISH.
    assert export["coverage"]["national_universe_complete"] is True
    assert export["coverage"]["uf_count"] == 27

    pack = build_pack(snapshot, read_model=export, now=NOW)
    assert pack["verdict"] == "NEEDS_DATA"
    assert pack["indexation"]["indexable"] is False
    assert pack["reproducibility"]["extra_cli_public_read_export_consumed"] is False
    assert pack["coverage"]["national_universe_complete"] is False
    assert coverage_allows_national(pack) is False
    errors = validate_claim_gate(pack)
    assert errors == []
    assert "FRESHNESS_STALE" in pack["national_claim_gate"]["reason_codes"]
    assert "FRESHNESS_STALE" in pack["next_action"]


def test_national_fresh_fixture_passes_gate_but_is_not_live_source():
    export = _load_fixture("research-aggregate-v1-national-fresh.json")
    gate = evaluate_national_claim_gate(export, now=NOW)
    assert gate.passed is True
    assert gate.consumed is True
    live = ROOT / "data/extra-cli/research-aggregate-v1/export.json"
    assert not live.is_file(), "live #400 export must not be faked from fixtures"


def test_dataset_schema_only_when_download_is_real(snapshot):
    pack = build_pack(snapshot, read_model=None, now=NOW)
    assert dataset_jsonld(pack, download_present=False) is None
    payload = dataset_jsonld(pack, download_present=True)
    assert payload is not None
    assert payload["@type"] == "Dataset"
    assert payload["distribution"]["@type"] == "DataDownload"
    dumped = json.dumps(payload)
    assert "DataCatalog" not in dumped
    assert "SC/PI/MG/RS" in payload["description"]
    assert "Não descreve o Brasil" in payload["description"]


def test_cli_build_with_insufficient_fixture_stays_needs_data(tmp_path):
    fixture = FIXTURES / "research-aggregate-v1-insufficient-coverage.json"
    build = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.research",
            "build",
            "--pack-only",
            "--read-model",
            str(fixture),
            "--out",
            str(tmp_path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stderr
    payload = json.loads(build.stdout)
    assert payload["ok"] is True
    assert payload["verdict"] == "NEEDS_DATA"
    assert payload["extra_cli_public_read_export_consumed"] is False
    assert "COVERAGE_INSUFFICIENT" in payload["national_claim_gate"]["reason_codes"]
    written = json.loads((tmp_path / "pack.json").read_text(encoding="utf-8"))
    assert written["coverage"]["national_universe_complete"] is False
    assert written["indexation"]["indexable"] is False


def test_cli_build_with_stale_fixture_stays_needs_data(tmp_path):
    fixture = FIXTURES / "research-aggregate-v1-stale.json"
    build = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.research",
            "build",
            "--pack-only",
            "--read-model",
            str(fixture),
            "--out",
            str(tmp_path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stderr
    payload = json.loads(build.stdout)
    assert payload["verdict"] == "NEEDS_DATA"
    assert payload["extra_cli_public_read_export_consumed"] is False
    assert "FRESHNESS_STALE" in payload["national_claim_gate"]["reason_codes"]


def test_claim_gate_blocks_answered_finding_without_denominator(snapshot):
    pack = build_pack(snapshot, read_model=None, now=NOW)
    pack["findings"].append(
        {
            "id": "F-BAD-DENOM",
            "status": "answered",
            "claim": "Há 10 contratos no recorte.",
            "question_id": "Q1",
            "evidence": {"question_id": "Q1", "anchor": "#Q1"},
        }
    )
    # Point at a cloned Q1 with no denominator to prove the shipped check.
    q1 = next(item for item in pack["questions"] if item["id"] == "Q1")
    q1["denominator"] = "n/a — fixture"
    errors = validate_claim_gate(pack)
    assert any("missing usable denominator" in item for item in errors)
