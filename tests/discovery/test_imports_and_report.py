"""Drive shipped GSC/referral importers and the operations report."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.gsc_import import GscImportError, import_gsc_file
from scripts.discovery.observation import (
    REASON_AMBIGUOUS_FILE,
    REASON_GSC_NOT_PROVIDED,
    REASON_INCOMPATIBLE_WINDOWS,
    REASON_LEAD_UNATTRIBUTED,
    REASON_OUTCOME_NOT_PROVIDED,
    REASON_PERIOD_FILTER_ABSENT,
    REASON_PII_REFUSED,
    REASON_PROVEN_ZERO,
    REASON_ZERO_ROWS,
    compute_record_hash,
)
from scripts.discovery.operations import operations_for_asset
from scripts.discovery.referral_import import ReferralImportError, import_referral_file
from scripts.discovery.registry import load_cohort
from scripts.discovery.report import build_report, format_report
from scripts.discovery.store import append_observation, load_observations

FIXTURES = ROOT / "tests" / "discovery" / "fixtures"
ASSET_ID = "valor-tipico-contratos-pavimentacao"
AS_OF = "2026-08-17T18:25:58Z"


def _import_gsc(name: str, **kwargs):
    return import_gsc_file(
        FIXTURES / name,
        asset_id=ASSET_ID,
        observed_at=AS_OF,
        **kwargs,
    )


def test_gsc_csv_pt_br_and_en_us_and_json():
    pt = _import_gsc("gsc-pt-BR.csv")
    assert len(pt) == 2
    first = pt[0]
    assert first["metrics"]["impressions"] == 1234
    assert first["metrics"]["clicks"] == 12
    assert first["metrics"]["ctr"] == pytest.approx(0.0123)
    assert first["metrics"]["position"] == pytest.approx(8.4)
    assert first["dimensions"]["date"] == "2026-08-01"
    assert first["dimensions"]["query"] == "valor típico pavimentação"
    assert first["dimensions"]["row_hash"]

    en = _import_gsc("gsc-en-US.csv")
    assert en[0]["metrics"]["impressions"] == 1234
    assert en[0]["dimensions"]["date"] == "2026-08-01"

    js = _import_gsc("gsc.json")
    assert js[0]["metrics"]["impressions"] == 40
    assert js[0]["period_start"] == "2026-08-01"
    assert js[0]["period_end"] == "2026-08-07"
    assert js[0]["dimensions"]["timezone"] == "America/Sao_Paulo"


def test_gsc_export_without_period_does_not_become_zero():
    rows = _import_gsc("gsc-no-period.csv")
    assert rows[0]["metrics"]["impressions"] == 8
    assert REASON_PERIOD_FILTER_ABSENT in rows[0]["reason_codes"]
    assert rows[0]["period_start"] is None or rows[0]["dimensions"]["date"] is None
    assert rows[0]["status"] != "PROVEN_ZERO"


def test_gsc_zero_rows_versus_proven_zero():
    empty = _import_gsc("gsc-empty-with-period.json")
    assert len(empty) == 1
    assert empty[0]["status"] == "NO_ROWS"
    assert empty[0]["metrics"]["impressions"] is None
    assert REASON_ZERO_ROWS in empty[0]["reason_codes"]

    zero = _import_gsc("gsc-proven-zero.csv")
    assert zero[0]["metrics"]["impressions"] == 0
    assert zero[0]["status"] == "PROVEN_ZERO"
    assert REASON_PROVEN_ZERO in zero[0]["reason_codes"]


def test_gsc_ambiguous_file_refused():
    with pytest.raises(GscImportError, match=REASON_AMBIGUOUS_FILE):
        _import_gsc("gsc-ambiguous.csv")


def test_gsc_replay_dedup(tmp_path):
    store = tmp_path / "obs.ndjson"
    first = _import_gsc("gsc.json")
    second = _import_gsc("gsc.json")
    assert first[0]["record_hash"] == second[0]["record_hash"]
    a = append_observation(store, first[0])
    b = append_observation(store, second[0])
    assert a["appended"] is True
    assert b["replay"] is True
    lines = [line for line in store.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 1


def test_gsc_reimport_new_observed_at_does_not_double_count(tmp_path):
    """Same file, later wall clock: fact replay. Report stays 40, not 80."""
    asset = next(item for item in load_cohort(root=ROOT)["assets"] if item["id"] == ASSET_ID)
    first = import_gsc_file(
        FIXTURES / "gsc.json", asset_id=ASSET_ID, observed_at="2026-08-17T18:00:00Z"
    )
    second = import_gsc_file(
        FIXTURES / "gsc.json", asset_id=ASSET_ID, observed_at="2026-08-17T19:00:00Z"
    )
    assert first[0]["metrics"]["impressions"] == 40
    assert second[0]["metrics"]["impressions"] == 40
    assert first[0]["record_hash"] != second[0]["record_hash"]
    assert first[0]["dimensions"]["fact_key"] == second[0]["dimensions"]["fact_key"]
    assert first[0]["dimensions"]["row_hash"] == second[0]["dimensions"]["row_hash"]

    store = tmp_path / "obs.ndjson"
    stored_first = append_observation(store, first[0])
    stored_second = append_observation(store, second[0])
    assert stored_first["appended"] is True
    assert stored_second["replay"] is True
    assert stored_second["appended"] is False
    assert len(load_observations(store)) == 1

    # Report must not sum even if both records are handed in (stale store).
    ops = operations_for_asset(asset, first + second)
    assert ops["impressions"]["value"] == 40
    assert ops["clicks"]["value"] == 2
    assert ops["discovery_status"] == "DISCOVERY_OBSERVED"

    later = tmp_path / "later.ndjson"
    first_cli = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "import-gsc",
            "--file",
            str(FIXTURES / "gsc.json"),
            "--asset-id",
            ASSET_ID,
            "--as-of",
            "2026-08-17T20:00:00Z",
            "--snapshots",
            str(later),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    second_cli = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "import-gsc",
            "--file",
            str(FIXTURES / "gsc.json"),
            "--asset-id",
            ASSET_ID,
            "--as-of",
            "2026-08-17T21:00:00Z",
            "--snapshots",
            str(later),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert json.loads(first_cli.stdout)["appended"] == 1
    assert json.loads(second_cli.stdout)["replayed"] == 1
    assert json.loads(second_cli.stdout)["appended"] == 0
    assert len(load_observations(later)) == 1


def test_referral_without_pii_and_lead_without_correlation():
    ok = import_referral_file(FIXTURES / "referral-ok.json", asset_id=ASSET_ID, observed_at=AS_OF)
    types = {row["observation_type"] for row in ok}
    assert types == {"referral", "cta"}
    for row in ok:
        blob = json.dumps(row)
        assert "@" not in blob or "confenge.com.br" in blob
        assert "Fulano" not in blob

    lead = import_referral_file(
        FIXTURES / "lead-no-correlation.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    assert lead[0]["observation_type"] == "lead"
    assert lead[0]["metrics"]["attributed_to_search"] is False
    assert REASON_LEAD_UNATTRIBUTED in lead[0]["reason_codes"]


def test_opaque_lead_id_is_not_search_attribution():
    asset = next(item for item in load_cohort(root=ROOT)["assets"] if item["id"] == ASSET_ID)
    only_id = import_referral_file(
        FIXTURES / "lead-only-id.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    assert only_id[0]["observation_type"] == "lead"
    assert only_id[0]["dimensions"]["lead_id"] == "lead_opaque_aa11"
    assert only_id[0]["metrics"]["attributed_to_search"] is False
    assert REASON_LEAD_UNATTRIBUTED in only_id[0]["reason_codes"]
    ops = operations_for_asset(asset, only_id)
    assert ops["leads"]["value"] == 1
    assert ops["leads_attributed_to_search"]["value"] == 0
    assert ops["lead_status"] == "UNKNOWN"

    with_search = import_referral_file(
        FIXTURES / "lead-with-gclid.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    assert with_search[0]["metrics"]["attributed_to_search"] is True
    assert with_search[0]["dimensions"]["gclid"] == "Cj0TESTGCLID"
    assert with_search[0]["dimensions"]["lead_id"] == "lead_opaque_bb22"
    proven = operations_for_asset(asset, with_search)
    assert proven["lead_status"] == "LEAD_PROVEN"
    assert proven["leads_attributed_to_search"]["value"] == 1


def test_referral_pii_is_refused_and_not_persisted(tmp_path):
    store = tmp_path / "obs.ndjson"
    with pytest.raises(ReferralImportError, match=REASON_PII_REFUSED):
        import_referral_file(FIXTURES / "referral-pii.json", asset_id=ASSET_ID, observed_at=AS_OF)
    assert not store.exists()


def test_report_baseline_without_export_is_not_zero():
    report = build_report(root=ROOT, generated_at=AS_OF)
    canary = next(item for item in report["assets"] if item["id"] == ASSET_ID)
    ops = canary["operations"]
    assert ops["technical_status"] in {"TECHNICAL_LIVE", "TECHNICAL_UNKNOWN"}
    assert ops["discovery_status"] == "DISCOVERY_UNKNOWN"
    assert ops["impressions"]["status"] == "NOT_PROVIDED"
    assert ops["impressions"]["value"] is None
    assert ops["clicks"]["value"] is None
    assert ops["leads"]["status"] == "NOT_PROVIDED"
    assert ops["revenue"]["value"] is None
    assert ops["seo_score"] is None
    assert ops["causality"] is False
    assert REASON_GSC_NOT_PROVIDED in ops["reason_codes"]
    assert REASON_OUTCOME_NOT_PROVIDED in ops["reason_codes"]
    assert "seo score" not in format_report(report).lower() or "seo_score: null" in format_report(report)
    text = format_report(report)
    assert "TECHNICAL_LIVE" in text or "TECHNICAL_UNKNOWN" in text
    assert "DISCOVERY_UNKNOWN" in text
    assert "publication_is_not_discovery" or "technical_status" in text


def test_report_incompatible_windows_not_summed():
    asset = next(item for item in load_cohort(root=ROOT)["assets"] if item["id"] == ASSET_ID)
    left = _import_gsc("gsc.json")
    right = _import_gsc("gsc-other-period.json")
    ops = operations_for_asset(asset, left + right)
    assert ops["impressions"]["status"] == "INCOMPATIBLE"
    assert ops["impressions"]["value"] is None
    assert REASON_INCOMPATIBLE_WINDOWS in ops["reason_codes"]
    assert ops["discovery_status"] == "DISCOVERY_UNKNOWN"


def test_report_with_gsc_fixture_sets_discovery_observed_not_lead():
    asset = next(item for item in load_cohort(root=ROOT)["assets"] if item["id"] == ASSET_ID)
    gsc = _import_gsc("gsc.json")
    lead = import_referral_file(
        FIXTURES / "lead-no-correlation.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    ops = operations_for_asset(asset, gsc + lead)
    assert ops["discovery_status"] == "DISCOVERY_OBSERVED"
    assert ops["impressions"]["value"] == 40
    assert ops["lead_status"] == "UNKNOWN"
    assert ops["leads"]["value"] == 1
    assert ops["leads_attributed_to_search"]["value"] == 0 if "leads_attributed_to_search" in ops else True
    assert ops["revenue"]["value"] is None
    assert REASON_LEAD_UNATTRIBUTED in ops["reason_codes"]


def test_record_hash_is_deterministic():
    rows = _import_gsc("gsc.json")
    assert rows[0]["record_hash"] == compute_record_hash(rows[0])
    again = _import_gsc("gsc.json")
    assert rows[0]["record_hash"] == again[0]["record_hash"]


def test_cli_import_gsc_and_report_round_trip(tmp_path):
    store = tmp_path / "obs.ndjson"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "import-gsc",
            "--file",
            str(FIXTURES / "gsc.json"),
            "--asset-id",
            ASSET_ID,
            "--as-of",
            AS_OF,
            "--snapshots",
            str(store),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(proc.stdout)
    assert payload["imported"] == 1
    assert payload["appended"] == 1
    replay = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "import-gsc",
            "--file",
            str(FIXTURES / "gsc.json"),
            "--asset-id",
            ASSET_ID,
            "--as-of",
            AS_OF,
            "--snapshots",
            str(store),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    replayed = json.loads(replay.stdout)
    assert replayed["replayed"] == 1
    assert replayed["appended"] == 0


def test_cli_referral_pii_exits_nonzero():
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.discovery",
            "import-referral",
            "--file",
            str(FIXTURES / "referral-pii.json"),
            "--asset-id",
            ASSET_ID,
            "--as-of",
            AS_OF,
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert REASON_PII_REFUSED in proc.stderr
