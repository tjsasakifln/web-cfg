from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from scripts.demand_radar.engine import (
    MAX_ACTIONABLE_NOW,
    _commercial_key,
    _metric_key,
    build_ledger,
)
from scripts.demand_radar.report import render_markdown
from scripts.demand_radar.schema import seal_approval_manifest, seal_snapshot

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_ROOT = ROOT / "data" / "demand_radar" / "snapshots" / "2026-08-31"
ORIGIN_MAIN = "81c600b7c26dcc606d3a03e648ecd9820d9c1c37"


def load_snapshots() -> list[dict]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(SNAPSHOT_ROOT.glob("*.json"))
    ]


def reseal(snapshot: dict) -> dict:
    sealed = seal_snapshot(snapshot)
    snapshot.clear()
    snapshot.update(sealed)
    return snapshot


def approvals_for(snapshots: list[dict]) -> dict:
    sources = []
    for snapshot in snapshots:
        source = snapshot["source"]
        provenance = source["provenance"]
        sources.append(
            {
                "source_id": source["id"],
                "kind": source["kind"],
                "repository": provenance["repository"],
                "path": provenance["path"],
                "revision": provenance["revision"],
                "content_sha256": provenance["content_sha256"],
                "snapshot_sha256": snapshot["snapshot_sha256"],
                "allow_accepted_historical": source["freshness"]["state"]
                == "ACCEPTED_HISTORICAL",
                "approved_at": "2026-08-31",
                "reason": "Test-only explicit envelope approval.",
            }
        )
    return seal_approval_manifest(
        {
            "schema_version": "confenge-demand-radar-source-approvals/v1",
            "sources": sources,
            "manifest_sha256": "",
        }
    )


def optional_snapshot(kind: str, records: list[dict], *, suffix: str) -> dict:
    privacy_class = (
        "PUBLIC_NON_PERSONAL"
        if kind in {"GOOGLE_TRENDS", "SERP_RESEARCH"}
        else "INTERNAL_AGGREGATE_NO_PII"
    )
    payload = {
        "schema_version": "confenge-demand-radar-snapshot/v1",
        "source": {
            "id": f"{kind.lower().replace('_', '-')}-{suffix}",
            "kind": kind,
            "observed_at": "2026-08-31",
            "geo": "BRA",
            "language": "pt-BR",
            "privacy_class": privacy_class,
            "provenance": {
                "authority": "test aggregate fixture",
                "repository": "tjsasakifln/web-cfg",
                "path": f"tests/demand_radar/{suffix}.json",
                "revision": ORIGIN_MAIN,
                "content_sha256": "a" * 64,
            },
            "freshness": {
                "state": "CURRENT",
                "evaluated_at": "2026-08-31",
                "expires_at": None,
            },
            "unknown_semantics": "UNKNOWN stays UNKNOWN and is never coerced to zero.",
        },
        "records": records,
        "records_sha256": "",
        "snapshot_sha256": "",
    }
    return reseal(payload)


def build(snapshots: list[dict] | None = None) -> dict:
    selected = snapshots or load_snapshots()
    return build_ledger(
        selected,
        approvals=approvals_for(selected),
        as_of="2026-08-31",
        origin_main=ORIGIN_MAIN,
    )


def test_current_report_is_deterministic_capped_and_advisory() -> None:
    first = build()
    second = build()
    assert first == second
    assert first["report"]["actionable_now"] == [
        "defesa-sancoes",
        "defesa-margem",
        "bid-room",
        "gestao-contratual",
    ]
    assert len(first["report"]["actionable_now"]) <= MAX_ACTIONABLE_NOW
    assert "bid-readiness" in first["report"]["research"]
    assert "partner-integrity" in first["report"]["research"]
    assert all(item["advisory_only"] for item in first["opportunities"])
    assert not any(item["authorizes_public_mutation"] for item in first["opportunities"])
    assert '"score"' not in json.dumps(first, ensure_ascii=False)


def test_freeze_precedes_large_gsc_sample() -> None:
    ledger = build()
    medicao = next(item for item in ledger["opportunities"] if item["family_id"] == "medicoes-pagamentos")
    assert medicao["evidence_sample"]["owner_observation"]["impressions"] == 99
    assert medicao["bucket"] == "WAIT"
    assert medicao["action"] == "WAIT_MEASUREMENT"


def test_missing_optional_sources_remain_unknown_not_zero() -> None:
    ledger = build()
    item = next(item for item in ledger["opportunities"] if item["family_id"] == "defesa-margem")
    planner, trends, commercial = item["decision_trace"][2:5]
    assert [planner["state"], trends["state"], commercial["state"]] == [
        "UNKNOWN",
        "UNKNOWN",
        "UNKNOWN",
    ]
    assert "outcomes" not in commercial
    assert "breadth" not in planner


def test_valid_optional_sources_are_kept_as_separate_lexicographic_stages() -> None:
    snapshots = load_snapshots()
    snapshots.extend(
        [
            optional_snapshot(
                "KEYWORD_PLANNER",
                [
                    {
                        "family_id": "defesa-margem",
                        "state": "OBSERVED",
                        "breadth": "MEDIUM",
                        "competition": "HIGH",
                        "bid": {"state": "APPROXIMATE", "currency": "BRL", "band": "MEDIUM"},
                    }
                ],
                suffix="planner",
            ),
            optional_snapshot(
                "GOOGLE_TRENDS",
                [
                    {
                        "family_id": "defesa-margem",
                        "state": "OBSERVED",
                        "momentum": "RISING",
                        "geography": "BRA",
                    }
                ],
                suffix="trends",
            ),
            optional_snapshot(
                "WARMBLY_AGGREGATE_OUTCOMES",
                [
                    {
                        "family_id": "defesa-margem",
                        "state": "OBSERVED",
                        "outcomes": {"qco": 1, "proposal": "UNKNOWN", "contract": "UNKNOWN"},
                    }
                ],
                suffix="warmbly",
            ),
            optional_snapshot(
                "SERP_RESEARCH",
                [
                    {
                        "family_id": "defesa-margem",
                        "state": "OBSERVED",
                        "intent_match": "HIGH",
                        "formats": ["service", "guide"],
                    }
                ],
                suffix="serp",
            ),
        ]
    )
    ledger = build(snapshots)
    item = next(item for item in ledger["opportunities"] if item["family_id"] == "defesa-margem")
    assert item["decision_trace"][2]["breadth"] == "MEDIUM"
    assert item["decision_trace"][3]["momentum"] == "RISING"
    assert item["decision_trace"][4]["outcomes"]["proposal"] == "UNKNOWN"
    assert item["decision_trace"][4]["interpretation"].startswith("Observed economic feedback")
    rendered = render_markdown(ledger)
    assert "`KEYWORD_PLANNER` is decision-usable" in rendered
    assert "`GOOGLE_TRENDS` is decision-usable" in rendered
    assert "`WARMBLY_AGGREGATE_OUTCOMES` is decision-usable" in rendered
    assert "`SERP_RESEARCH` is decision-usable" in rendered


def test_source_only_evidence_cannot_create_a_buyer_job_or_owner() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    gsc["records"].append(
        {
            "family_id": "unowned-source-only",
            "state": "OBSERVED",
            "owner_observation": {
                "path": "/not-an-authority/",
                "clicks": 0,
                "impressions": 999,
                "ctr": 0,
                "position": 1,
            },
            "interpretation": "PAGE_EXPOSURE_ONLY_NOT_CONVERSION_FAILURE",
        }
    )
    reseal(gsc)
    ledger = build(snapshots)
    assert "unowned-source-only" not in {item["family_id"] for item in ledger["opportunities"]}
    assert ledger["ignored_source_records"] == [
        {
            "source_kind": "GSC_PAGE_OVERLAY",
            "family_id": "unowned-source-only",
            "reason": "No canonical buyer-job projection; source evidence cannot create an opportunity.",
        }
    ]


def test_actionable_cap_moves_overflow_to_research_without_opening_work() -> None:
    snapshots = load_snapshots()
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    template_owner = next(item for item in owner["records"] if item["family_id"] == "defesa-margem")
    template_gsc = next(item for item in gsc["records"] if item["family_id"] == "defesa-margem")
    owner["records"] = []
    gsc["records"] = []
    for index in range(7):
        owner_record = copy.deepcopy(template_owner)
        owner_record["family_id"] = f"candidate-{index}"
        owner_record["canonical_owner"]["url"] = f"https://confenge.com.br/candidate-{index}/"
        gsc_record = copy.deepcopy(template_gsc)
        gsc_record["family_id"] = f"candidate-{index}"
        gsc_record["owner_observation"]["path"] = f"/candidate-{index}/"
        gsc_record["owner_observation"]["impressions"] = 10 - index
        gsc_record["family_aggregate"]["impressions"] = 10 - index
        owner["records"].append(owner_record)
        gsc["records"].append(gsc_record)
    reseal(owner)
    reseal(gsc)
    ledger = build(snapshots)
    assert len(ledger["report"]["actionable_now"]) == MAX_ACTIONABLE_NOW
    assert len(ledger["report"]["research"]) == 2
    overflow = [
        item
        for item in ledger["opportunities"]
        if item["family_id"] in ledger["report"]["research"]
    ]
    assert all(item["action"] == "RESEARCH_REQUIRED" for item in overflow)
    assert all("Wait for an ACTIONABLE_NOW slot" in item["smallest_finite_next_action"] for item in overflow)


def test_required_owner_and_gsc_sources_fail_closed() -> None:
    snapshots = [
        item for item in load_snapshots() if item["source"]["kind"] != "GSC_PAGE_OVERLAY"
    ]
    with pytest.raises(ValueError, match="required_source_kinds_missing:GSC_PAGE_OVERLAY"):
        build(snapshots)


def test_markdown_contains_required_decision_fields() -> None:
    report = render_markdown(build())
    for label in (
        "Buyer job:",
        "Owner/gap:",
        "Evidence/sample:",
        "Commercial relevance:",
        "Mechanism:",
        "Smallest finite next action:",
        "Owner issue:",
    ):
        assert label in report
    assert "ACTIONABLE_NOW (4/5)" in report
    assert "UNKNOWN` remains `UNKNOWN`" in report


def test_unknown_freeze_cannot_authorize_actionable_work() -> None:
    snapshots = load_snapshots()
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    record = next(item for item in owner["records"] if item["family_id"] == "defesa-margem")
    record["eligibility"]["freeze"] = "UNKNOWN"
    reseal(owner)
    ledger = build(snapshots)
    item = next(item for item in ledger["opportunities"] if item["family_id"] == "defesa-margem")
    assert item["bucket"] == "RESEARCH"
    assert item["action"] == "RESEARCH_REQUIRED"


def test_future_snapshot_is_retained_but_cannot_become_active() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    future = copy.deepcopy(gsc)
    future["source"]["id"] = "gsc-page-overlay-future"
    future["source"]["range"] = {"start": "2030-01-01", "end": "2030-01-28"}
    future["source"]["freshness"]["state"] = "STALE"
    future["source"]["freshness"]["evaluated_at"] = "2030-01-29"
    reseal(future)
    ledger = build([*snapshots, future])
    assert ledger["active_source_ids"]["GSC_PAGE_OVERLAY"] == gsc["source"]["id"]
    assert ledger["ignored_source_snapshots"] == [
        {
            "source_id": "gsc-page-overlay-future",
            "kind": "GSC_PAGE_OVERLAY",
            "reason": "Snapshot effective date is after the report as-of date.",
        }
    ]


def test_newest_stale_required_snapshot_fails_closed() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    stale = copy.deepcopy(gsc)
    stale["source"]["id"] = "gsc-page-overlay-stale"
    stale["source"]["range"] = {"start": "2026-08-03", "end": "2026-08-30"}
    stale["source"]["freshness"]["state"] = "STALE"
    reseal(stale)
    with pytest.raises(ValueError, match="required_source_kinds_unusable:GSC_PAGE_OVERLAY"):
        build([*snapshots, stale])


def test_wrong_market_required_snapshot_fails_closed() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    wrong_market = copy.deepcopy(gsc)
    wrong_market["source"]["id"] = "z-wrong-market-gsc"
    wrong_market["source"]["geo"] = "USA"
    wrong_market["source"]["language"] = "en-US"
    reseal(wrong_market)
    with pytest.raises(ValueError, match="incompatible with BRA/pt-BR"):
        build([*snapshots, wrong_market])


def test_expired_optional_snapshot_is_reported_unknown_and_not_used() -> None:
    planner = optional_snapshot(
        "KEYWORD_PLANNER",
        [
            {
                "family_id": "defesa-margem",
                "state": "OBSERVED",
                "breadth": "HIGH",
                "competition": "HIGH",
                "bid": {"state": "APPROXIMATE", "currency": "BRL", "band": "HIGH"},
            }
        ],
        suffix="expired-planner",
    )
    planner["source"]["freshness"]["expires_at"] = "2026-08-31"
    reseal(planner)
    ledger = build_ledger(
        [*load_snapshots(), planner],
        approvals=approvals_for([*load_snapshots(), planner]),
        as_of="2026-09-01",
        origin_main=ORIGIN_MAIN,
    )
    assert "KEYWORD_PLANNER" not in ledger["active_source_ids"]
    assert ledger["source_availability"]["KEYWORD_PLANNER"] == {
        "state": "UNKNOWN",
        "source_id": "keyword-planner-expired-planner",
        "reason": "Snapshot expired at 2026-08-31.",
    }
    assert "`KEYWORD_PLANNER` is `UNKNOWN` — Snapshot expired" in render_markdown(ledger)


def test_gsc_owner_path_must_match_the_canonical_owner() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    record = next(item for item in gsc["records"] if item["family_id"] == "defesa-margem")
    record["owner_observation"]["path"] = "/"
    reseal(gsc)
    with pytest.raises(ValueError, match="gsc_owner_path_mismatch:defesa-margem"):
        build(snapshots)


def test_gsc_observation_cannot_be_joined_to_an_owner_gap() -> None:
    snapshots = load_snapshots()
    gsc = next(item for item in snapshots if item["source"]["kind"] == "GSC_PAGE_OVERLAY")
    index = next(i for i, item in enumerate(gsc["records"]) if item["family_id"] == "bid-readiness")
    gsc["records"][index] = {
        "family_id": "bid-readiness",
        "state": "OBSERVED",
        "owner_observation": {
            "path": "/diagnostico-pre-licitacao/",
            "clicks": 0,
            "impressions": 1,
            "ctr": 0,
            "position": 1,
        },
        "interpretation": "PAGE_EXPOSURE_ONLY_NOT_CONVERSION_FAILURE",
    }
    reseal(gsc)
    with pytest.raises(ValueError, match="gsc_observed_for_owner_gap:bid-readiness"):
        build(snapshots)


def test_missing_metrics_and_observed_zero_have_distinct_sort_states() -> None:
    unknown_metric = _metric_key({"state": "UNKNOWN"}, "impressions", descending=True)
    observed_zero = _metric_key(
        {"state": "OBSERVED_PAGE_EVIDENCE", "owner_observation": {"impressions": 0}},
        "impressions",
        descending=True,
    )
    assert unknown_metric == (1,)
    assert observed_zero == (0, -0.0)
    assert observed_zero < unknown_metric
    assert _commercial_key({"state": "UNKNOWN"}) == (1,)
    assert _commercial_key(
        {
            "state": "OBSERVED_AGGREGATE_OUTCOMES",
            "outcomes": {"qco": 0, "proposal": "UNKNOWN", "contract": "UNKNOWN"},
        }
    ) == (0, 0)


def test_invalid_report_as_of_fails_closed() -> None:
    with pytest.raises(ValueError, match="ledger_as_of_invalid"):
        build_ledger(
            load_snapshots(),
            approvals=approvals_for(load_snapshots()),
            as_of="2026-8-31",
            origin_main=ORIGIN_MAIN,
        )


def test_duplicate_source_identity_fails_closed() -> None:
    snapshots = load_snapshots()
    with pytest.raises(ValueError, match="duplicate_source_ids"):
        build([*snapshots, copy.deepcopy(snapshots[0])])


def test_trends_record_geography_must_match_its_source() -> None:
    trends = optional_snapshot(
        "GOOGLE_TRENDS",
        [
            {
                "family_id": "defesa-margem",
                "state": "OBSERVED",
                "momentum": "RISING",
                "geography": "USA",
            }
        ],
        suffix="wrong-record-geography",
    )
    with pytest.raises(ValueError, match="trends_geography_source_mismatch"):
        build([*load_snapshots(), trends])


def test_contradictory_owner_states_fail_before_decision() -> None:
    snapshots = load_snapshots()
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    record = next(item for item in owner["records"] if item["family_id"] == "defesa-margem")
    record["coverage_state"] = "MEASUREMENT_WAIT"
    reseal(owner)
    with pytest.raises(ValueError, match="owner_state_combination_invalid:defesa-margem"):
        build(snapshots)


def test_historical_gsc_exception_requires_exact_manifest_approval() -> None:
    snapshots = load_snapshots()
    approvals = approvals_for(snapshots)
    gsc_approval = next(
        item for item in approvals["sources"] if item["kind"] == "GSC_PAGE_OVERLAY"
    )
    gsc_approval["allow_accepted_historical"] = False
    approvals = seal_approval_manifest(approvals)
    with pytest.raises(ValueError, match="required_source_kinds_unusable:GSC_PAGE_OVERLAY"):
        build_ledger(
            snapshots,
            approvals=approvals,
            as_of="2026-08-31",
            origin_main=ORIGIN_MAIN,
        )


def test_snapshot_provenance_must_match_approved_envelope() -> None:
    snapshots = load_snapshots()
    approvals = approvals_for(snapshots)
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    owner["source"]["provenance"]["path"] = "data/not-approved.json"
    reseal(owner)
    with pytest.raises(ValueError, match="source_approval_mismatch:.*:path"):
        build_ledger(
            snapshots,
            approvals=approvals,
            as_of="2026-08-31",
            origin_main=ORIGIN_MAIN,
        )


def test_valid_planner_breadth_can_only_propose_an_advisory_owner_candidate() -> None:
    snapshots = load_snapshots()
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    gap = next(item for item in owner["records"] if item["family_id"] == "bid-readiness")
    gap["coverage_state"] = "CANONICAL_OWNER_GAP"
    gap["execution_state"] = "VALIDATE"
    gap["eligibility"]["controllable"] = True
    gap["eligibility"]["exclusion"] = None
    gap["gap"]["state"] = "CANONICAL_OWNER_GAP"
    reseal(owner)
    planner = optional_snapshot(
        "KEYWORD_PLANNER",
        [
            {
                "family_id": "bid-readiness",
                "state": "OBSERVED",
                "breadth": "MEDIUM",
                "competition": "UNKNOWN",
                "bid": {"state": "UNKNOWN", "currency": "UNKNOWN", "band": "UNKNOWN"},
            }
        ],
        suffix="owner-gap-evidence",
    )
    ledger = build([*snapshots, planner])
    item = next(item for item in ledger["opportunities"] if item["family_id"] == "bid-readiness")
    assert item["action"] == "CREATE_CANONICAL_OWNER_CANDIDATE"
    assert item["authorizes_public_mutation"] is False


def test_nested_gap_state_cannot_change_the_coverage_decision() -> None:
    snapshots = load_snapshots()
    owner = next(item for item in snapshots if item["source"]["kind"] == "CANONICAL_BOFU_OWNER_PROJECTION")
    gap = next(item for item in owner["records"] if item["family_id"] == "partner-integrity")
    gap["gap"]["state"] = "NO_DEMAND_EVIDENCE"
    reseal(owner)
    with pytest.raises(ValueError, match="gap_coverage_state_mismatch:partner-integrity"):
        build(snapshots)
