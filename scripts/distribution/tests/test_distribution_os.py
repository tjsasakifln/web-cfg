"""Drive shipped earned-distribution prepare/gate/registry/outcome functions."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.distribution.gates import evaluate_fit, evaluate_utility, interpret_non_response
from scripts.distribution.metrics import metrics_payload
from scripts.distribution.outcomes import observed_or_unknown, reject_invented_success
from scripts.distribution.prepare import format_prepare_report, prepare, prepare_asset
from scripts.distribution.registry import load_inherited_kit, load_registry, map_inherited_contact
from scripts.distribution.schema import (
    ALLOWED_OUTCOMES,
    FORBIDDEN_KPI_KEYS,
    NAMED_METRICS,
    REQUIRED_TARGET_FIELDS,
    SchemaError,
    validate_outcome,
    validate_target_row,
)

REGISTRY_PATH = ROOT / "data" / "distribution" / "assets" / "radar-nacional-obras-publicas.v1.json"


def _valid_row(**overrides):
    row = {
        "target_class": "imprensa",
        "target_nominal": "InfraROI",
        "editorial_angle": "Método aberto e o que o Radar não afirma.",
        "citation_url": "https://confenge.com.br/radar/nacional-obras-publicas/",
        "owner": "Tiago Sasaki",
        "outcome": "UNKNOWN",
        "source": "test",
        "date": "2026-08-15",
        "fit": True,
        "public_url": "https://infraroi.com.br",
    }
    row.update(overrides)
    return row


def test_schema_rejects_row_missing_any_required_field():
    for field in REQUIRED_TARGET_FIELDS:
        row = _valid_row()
        del row[field]
        with pytest.raises(SchemaError, match="missing_required_fields"):
            validate_target_row(row)


def test_outcome_enum_rejects_values_outside_allowed_tokens():
    for bad in ("enviado", "publicou", "no_reply_failure", "bounce", "success"):
        with pytest.raises(SchemaError, match="invalid_outcome"):
            validate_outcome(bad)
    for token in ALLOWED_OUTCOMES:
        assert validate_outcome(token) == token


def test_no_utility_asset_is_do_not_distribute():
    asset = {
        "id": "edicao-zero-4uf-preview",
        "name": "EDIÇÃO ZERO 4-UF",
        "canonical_url": "https://confenge.com.br/radar/pesquisa/edicao-zero-4uf/",
        "indexable": False,
        "do_not_index": True,
        "needs_data": True,
        "press_allowed": False,
        "verdict": "NEEDS_DATA",
        "utility": {
            "distinct_user_utility": False,
            "invented_national_contract_stats": False,
        },
        "citation_primitives": {},
    }
    gate = evaluate_utility(asset)
    assert gate.allow is False
    assert gate.code == "no_utility"

    registry = {
        "schema": "earned_distribution_v1",
        "version": 1,
        "auto_send": False,
        "asset": asset,
        "targets": [_valid_row(id="x")],
    }
    report = prepare(registry)
    assert report["kill_gates"]["distribute"] is False
    assert report["eligible_targets"] == []
    assert report["blocked_targets"]
    assert report["auto_send"] is False


def test_no_fit_target_is_do_not_contact():
    row = _valid_row(
        fit=False,
        fit_reason="target_sem_fit",
        target_nominal=None,
    )
    gate = evaluate_fit(row)
    assert gate.allow is False
    assert gate.code == "no_fit"

    registry = load_registry(REGISTRY_PATH)
    report = prepare(registry)
    blocked_ids = {item["id"] for item in report["blocked_targets"]}
    assert "folha-mesa-generica" in blocked_ids
    assert "linkedin-generico" in blocked_ids
    assert "sinduscon-rs" in blocked_ids


def test_non_response_is_not_causal_failure():
    result = interpret_non_response()
    assert result["causal_failure"] is False
    assert result["outcome"] == "UNKNOWN"


def test_metrics_payload_has_no_backlink_target_count_kpi():
    payload = metrics_payload()
    for key in FORBIDDEN_KPI_KEYS:
        assert key not in payload
    assert set(payload) == set(NAMED_METRICS)
    with pytest.raises(SchemaError, match="forbidden_kpi"):
        metrics_payload({"backlink_target_count": 30})


def test_unobserved_outcomes_remain_unknown():
    assert observed_or_unknown(None) == "UNKNOWN"
    assert observed_or_unknown("") == "UNKNOWN"
    with pytest.raises(SchemaError, match="unobserved_must_remain_unknown"):
        reject_invented_success("mentioned", evidence=None)
    live = load_registry(REGISTRY_PATH)
    for row in live["targets"]:
        assert row["outcome"] == "UNKNOWN"


def test_registered_asset_auto_send_is_false():
    registry = load_registry(REGISTRY_PATH)
    assert registry["auto_send"] is False
    report = prepare_asset(root=ROOT)
    assert report["auto_send"] is False
    assert report["send_forbidden"] is True
    assert report["smtp_called"] is False
    assert report["webhook_called"] is False


def test_prepare_radar_names_asset_gates_primitives_outcomes_and_metrics():
    report = prepare_asset(root=ROOT)
    text = format_prepare_report(report)
    assert report["asset"]["id"] == "radar-nacional-obras-publicas"
    assert report["asset"]["name"] == "Radar Nacional de Obras Públicas"
    assert report["kill_gates"]["distribute"] is True
    assert report["kill_gates"]["no_utility_do_not_distribute"] is True
    assert report["kill_gates"]["no_fit_do_not_contact"] is True
    assert report["kill_gates"]["non_response_is_not_causal_failure"]["causal_failure"] is False
    assert report["kill_gates"]["backlink_target_count_is_not_kpi"] is True
    keys = {item["key"] for item in report["citation_primitives"]}
    assert keys == {
        "stable_citation_link",
        "quotable_stat",
        "chart_card_metadata",
        "source_method_block",
        "safe_download",
    }
    assert all(item["status"] == "already_present" for item in report["citation_primitives"])
    assert {row["target_nominal"] for row in report["eligible_targets"]} == {
        "CBIC",
        "SINDUSCON-SP",
        "ADN da Construção",
        "InfraROI",
        "Revista O Empreiteiro",
        "IBAPE",
    }
    assert report["invented_external_mention"] is False
    assert report["invented_lead"] is False
    assert report["invented_pipeline"] is False
    assert report["invented_revenue"] is False
    assert report["named_metric_set"] == list(NAMED_METRICS)
    for key in NAMED_METRICS:
        assert report["metrics"][key]["status"] == "UNKNOWN"
    for token in (
        "contacted/manual",
        "mentioned",
        "linked",
        "reused",
        "partner intro",
        "assisted lead",
        "UNKNOWN",
    ):
        assert token in report["allowed_outcomes"]
    assert "already present" in text or "already_present" in text
    assert "https://confenge.com.br/radar/nacional-obras-publicas/" in text
    assert "gsc-demand-sample.json" in text
    assert "radar-nacional.pdf" in text


def test_inherited_kit_is_mapped_through_fit_gate_not_cloned():
    registry = load_registry(REGISTRY_PATH)
    kit = load_inherited_kit(ROOT)
    assert kit["auto_send"] is False
    assert len(kit["contacts"]) == 30
    mapped = [map_inherited_contact(c, registry) for c in kit["contacts"]]
    assert sum(1 for m in mapped if m["fit"]) == 6
    assert sum(1 for m in mapped if not m["fit"]) == 24
    report = prepare(registry, inherited_kit=kit)
    audit = report["inherited_pack_audit"]
    assert audit["cloned_as_second_farm"] is False
    assert audit["mapped_to_fit_registry"] == 6
    assert audit["do_not_contact"] == 24


def test_prepare_cli_entry_point_is_deterministic():
    cmd = [sys.executable, "-m", "scripts.distribution", "prepare", "--asset", "radar-nacional-obras-publicas"]
    first = subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True)
    second = subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True, text=True)
    assert first.stdout == second.stdout
    assert first.returncode == 0
    assert "auto_send: false" in first.stdout
    assert "smtp_called: false" in first.stdout
    assert "invented_external_mention: false" in first.stdout
    assert "SEND" in first.stdout
    assert "action: none" in first.stdout


def test_distribution_modules_have_no_send_path():
    tree = ROOT / "scripts" / "distribution"
    forbidden = (
        "smtplib",
        "resend",
        "sendmail",
        "SMTP",
        "auto_send = True",
        "requests.post",
        "httpx.post",
        "urllib.request.urlopen",
    )
    for path in tree.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in text, f"{path} contains {token}"


def test_live_radar_citation_primitives_exist_on_disk():
    page = (ROOT / "radar" / "nacional-obras-publicas" / "index.html").read_text(encoding="utf-8")
    assert "https://confenge.com.br/radar/nacional-obras-publicas/" in page
    assert "Como citar" in page
    assert "gsc-demand-sample.json" in page
    assert "radar-nacional.pdf" in page
    assert "method-box" in page
    assert (ROOT / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json").is_file()
    assert (ROOT / "radar" / "nacional-obras-publicas" / "radar-nacional.pdf").is_file()


def test_prepare_does_not_mutate_registry():
    registry = load_registry(REGISTRY_PATH)
    before = copy.deepcopy(registry)
    prepare(registry)
    assert registry == before


def test_kit_json_is_valid_source_not_success_kpi():
    kit = json.loads((ROOT / "data" / "distribution" / "radar-outreach-kit.json").read_text(encoding="utf-8"))
    assert kit["auto_send"] is False
    assert isinstance(kit["contacts"], list)
    # Presence of 30 rows is historical, not a pass condition of this OS.
    assert "human_actions" in kit
    assert any("no auto-send" in item.lower() or "manually" in item.lower() for item in kit["human_actions"])
