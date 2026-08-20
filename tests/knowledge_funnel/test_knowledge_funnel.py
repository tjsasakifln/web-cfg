"""Drive the shipped knowledge-funnel walk. Not a parallel oracle."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from scripts.contract_analysis.consume import inspect_producer_integrity, load_canary
from scripts.knowledge_funnel import AUTHORITIES, CTA_COPY, SOURCE
from scripts.knowledge_funnel.corpus import (
    REQUIRED_CASES,
    load_corpus,
    mutate_answer_raw,
    raw_json,
    resolve_fixture,
)
from scripts.knowledge_funnel.hash import trace_hash
from scripts.knowledge_funnel.walk import walk, walk_twice
from scripts.market_answers.consume import ConsumeError, adapt_payload
from scripts.knowledge_funnel.dictionary import layer_of, load_registry
from scripts.market_answers.events import build_event

ROOT = Path(__file__).resolve().parents[2]


def test_corpus_is_labeled_non_live_and_complete() -> None:
    corpus = load_corpus()
    assert corpus["claimed_live"] is False
    assert corpus["official_live"] is False
    assert corpus["catalog_mode"] == "fixture"
    for key in corpus["fixtures"]:
        assert resolve_fixture(corpus, key).is_file()
    for case_id in REQUIRED_CASES:
        assert case_id in corpus["cases"]


def test_family_validate_clis_keep_fixture_off_index() -> None:
    fixture = ROOT / "data/editorial/market-answers/fixtures/contract-fixture.v1.json"
    ma = subprocess.run(
        ["python3", "-m", "scripts.market_answers", "validate", "--payload", str(fixture)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert ma.returncode == 0, ma.stderr or ma.stdout
    ma_body = json.loads(ma.stdout)
    assert ma_body["ok"] is True
    assert ma_body["official_live"] is False
    assert ma_body["index_count"] == 0
    assert ma_body.get("fixture_indexed") is False

    ca = subprocess.run(
        ["python3", "-m", "scripts.contract_analysis", "validate"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert ca.returncode == 0, ca.stderr or ca.stdout
    ca_body = json.loads(ca.stdout)
    assert ca_body["ok"] is True
    assert ca_body.get("fixture_indexed") == []
    # Official-live INDEX canary V2 may be 1. Fixtures must stay off index.
    if ca_body.get("source_kind") == "official_live":
        assert ca_body["index_count"] <= 1
    else:
        assert ca_body["index_count"] == 0


def test_happy_walk_uses_shipped_stages_and_one_correlation() -> None:
    trace = walk("happy")
    assert trace["claimed_live"] is False
    assert trace["official_live"] is False
    assert trace["source"] == SOURCE
    assert trace["closed"] == "ok"
    assert trace["cta"] == CTA_COPY
    assert trace["page_view_is_not_lead"] is True
    assert trace["answer_view_is_not_lead"] is True
    names = [stage["stage"] for stage in trace["stages"]]
    assert names == ["answer", "evidence", "analysis", "xray", "persist", "handoff"]
    for stage in trace["stages"]:
        assert stage["authority"] == AUTHORITIES[stage["stage"]]
    answer = trace["stages"][0]
    assert answer["state"] != "PUBLISHABLE_INDEX"
    assert answer["official_live"] is False
    assert answer["unknown"]
    assert answer["limitations"]
    evidence = trace["stages"][1]
    assert evidence["cta_present"] is True
    assert evidence["analysis_link_present"] is True
    assert evidence["forbids_combinatorial_urls"] is True
    analysis = trace["stages"][2]
    assert analysis["index_count"] == 0
    assert analysis["downstream_within_upstream"] is True
    xray = trace["stages"][3]
    assert xray["state"] == "READY"
    assert xray["claimed_live"] is False
    assert xray["sla"] == "UNKNOWN"
    persist = trace["stages"][4]
    receipts = persist["receipts"]
    assert receipts["xray"]["correlation_id"] == trace["correlation_id"]
    assert receipts["handraise"]["status_code"] == 201
    assert receipts["handraise"]["persist_before_handoff"] is True
    assert receipts["handraise"]["auto_send"] is False
    assert receipts["handraise"]["sla"] == "UNKNOWN"
    handoff = trace["stages"][5]
    assert handoff["state"] in {"DELIVERED", "SKIPPED", "RETRYABLE"}
    assert handoff["claimed_live"] is False
    event_names = trace["event_names"]
    assert event_names[0] == "answer_view"
    registry = load_registry()
    assert registry["source"] == SOURCE
    assert layer_of("answer_view") == "page_view"
    assert layer_of("lead_receipt_correlated") == "lead"
    for name in event_names:
        assert name in registry["events"], name
        assert layer_of(name) not in {"qualified_lead", "pipeline"}
    assert "lead_receipt_correlated" in event_names
    assert trace["lead_event_count"] == 1
    view = next(item for item in trace["events"] if item["name"] == "answer_view")
    assert view["is_lead"] is False
    assert view["is_page_view"] is True
    assert view["layer"] == "page_view"
    assert view["payload"]["event"] == "answer_view"
    assert view["payload"]["event_layer"] == "page_view"
    assert view["payload"]["source"] == SOURCE
    handoff = trace["stages"][5]
    assert handoff.get("live_outcome") is False
    assert handoff.get("transport") == "fixture_stub"


def test_two_happy_walks_hash_equal_and_do_not_share_store() -> None:
    pair = walk_twice("happy")
    assert pair["match"] is True
    assert pair["hash_1"] == pair["hash_2"]
    assert pair["hash_1"] == pair["trace_1"]["trace_hash"]
    recomputed = trace_hash({k: v for k, v in pair["trace_1"].items() if k != "trace_hash"})
    assert recomputed == pair["hash_1"]
    # Isolated stores: each walk persists its own receipts; hashes still match.
    assert pair["trace_1"]["store"]["count"] == pair["trace_2"]["store"]["count"]
    assert pair["trace_1"]["store"]["ids"] == pair["trace_2"]["store"]["ids"]


def test_duplicate_replay_keeps_single_receipt_per_kind() -> None:
    trace = walk("duplicate_replay")
    persist = next(stage for stage in trace["stages"] if stage["stage"] == "persist")
    assert persist["receipts"]["xray_replay"]["idempotent"] is True
    assert persist["receipts"]["xray_replay"]["persisted"] is False
    assert persist["receipts"]["xray_replay"]["receipt_id"] == persist["receipts"]["xray"]["receipt_id"]
    assert persist["receipts"]["handraise_replay"]["idempotent"] is True
    assert persist["receipts"]["handraise_replay"]["persisted"] is False
    assert persist["receipts"]["handraise_replay"]["receipt_id"] == persist["receipts"]["handraise"]["receipt_id"]
    # One X-Ray receipt + one commercial receipt.
    assert trace["store"]["count"] == 2
    assert trace["stages"][-1]["replay_duplicate"] is False


def test_timeout_and_unavailable_are_retryable_and_recoverable() -> None:
    for case_id in ("timeout", "handoff_unavailable", "retry"):
        trace = walk(case_id)
        assert trace["closed"] == "retryable", case_id
        handoff = next(stage for stage in trace["stages"] if stage["stage"] == "handoff")
        assert handoff["state"] == "RETRYABLE", case_id
        assert handoff["persist_before_handoff"] is True
        assert handoff["recoverable"] is True
        recoverable = trace["store"]["recoverable"]
        assert recoverable
        commercial = [item for item in recoverable if item.get("handoff_status") == "RETRYABLE"]
        assert commercial, case_id
        assert all(item.get("source") == SOURCE for item in commercial)


def test_consent_missing_fails_closed() -> None:
    trace = walk("consent")
    assert trace["closed"] == "rejected"
    assert trace["reject_reason"] == "consent_required"
    persist = next(stage for stage in trace["stages"] if stage["stage"] == "persist")
    assert persist["receipts"]["handraise"]["error"] == "consent"
    assert persist["receipts"]["handraise"]["status_code"] == 400


def test_fixture_as_live_rejected_by_shipped_consume() -> None:
    corpus = load_corpus()
    raw = mutate_answer_raw(raw_json(resolve_fixture(corpus, "answer_payload")), "fixture_as_live")
    with pytest.raises(ConsumeError, match="claimed_live"):
        adapt_payload(raw)
    trace = walk("fixture_as_live")
    assert trace["closed"] == "rejected"
    assert "claimed_live" in (trace["reject_reason"] or "").lower() or "fixture" in (trace["reject_reason"] or "")
    assert [stage["stage"] for stage in trace["stages"]] == ["answer"]
    assert trace["store"]["count"] == 0


def test_missing_evidence_fail_closed_and_integrity_code() -> None:
    corpus = load_corpus()
    raw = mutate_answer_raw(raw_json(resolve_fixture(corpus, "answer_payload")), "missing_evidence")
    adapted = adapt_payload(raw)
    assert adapted["contract_refs"] == []
    assert adapted["evidence_refs"] == []
    bundle = load_canary(fixture_path=resolve_fixture(corpus, "analysis_fixture"))
    stripped = dict(bundle["records"][0])
    stripped.pop("evidence_refs", None)
    stripped.pop("sources", None)
    stripped.pop("source_refs", None)
    reasons = inspect_producer_integrity(stripped)
    assert "evidence_refs_absent" in reasons
    trace = walk("missing_evidence")
    assert trace["closed"] == "rejected"
    assert trace["reject_reason"] == "missing_evidence"
    assert [stage["stage"] for stage in trace["stages"]] == ["answer", "evidence"]


def test_stale_xray_does_not_promote_or_drop_limitations() -> None:
    trace = walk("stale_payload")
    xray = next(stage for stage in trace["stages"] if stage["stage"] == "xray")
    assert xray["state"] == "STALE"
    assert xray["claimed_live"] is False
    assert xray["sla"] == "UNKNOWN"
    assert xray["limitations"]
    answer = next(stage for stage in trace["stages"] if stage["stage"] == "answer")
    assert answer["state"] != "PUBLISHABLE_INDEX"
    analysis = next(stage for stage in trace["stages"] if stage["stage"] == "analysis")
    assert analysis["index_count"] == 0
    assert analysis["downstream_within_upstream"] is True


def test_pii_injection_never_reaches_events_or_url() -> None:
    event = build_event(
        "cta_click",
        {
            "correlation_id": "kf-web002-fixture-pii",
            "cnpj": "11222333000181",
            "email": "qa-funnel@example.com",
            "nome": "QA Funnel",
            "cta_id": "veja-sua-empresa-neste-mercado",
        },
    )
    blob = json.dumps(event)
    assert "11222333000181" not in blob
    assert "qa-funnel@example.com" not in blob
    assert "QA Funnel" not in blob
    assert "cnpj" not in event
    assert "email" not in event
    trace = walk("pii_url_event")
    assert trace["closed"] == "rejected"
    assert trace["reject_reason"] == "pii_in_url_or_event"
    dumped = json.dumps(trace)
    assert "11222333000181" not in dumped
    assert "qa-funnel@example.com" not in dumped


def test_cli_entry_point_twice() -> None:
    first = subprocess.run(
        ["python3", "-m", "scripts.knowledge_funnel", "walk", "--case", "happy"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert first.returncode == 0, first.stderr
    t1 = json.loads(first.stdout)
    second = subprocess.run(
        ["python3", "-m", "scripts.knowledge_funnel", "walk", "--case", "happy"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert second.returncode == 0, second.stderr
    t2 = json.loads(second.stdout)
    assert t1["trace_hash"] == t2["trace_hash"]
    assert t1["correlation_id"] == t2["correlation_id"]
    assert t1["store"]["ids"] == t2["store"]["ids"]
