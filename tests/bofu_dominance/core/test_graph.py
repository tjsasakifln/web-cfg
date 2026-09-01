"""#151–#156 and PRs #157–#159 must appear in the shipped graph."""

from __future__ import annotations

from scripts.bofu_dominance.core.graph import build_graph, graph_contains
from tests.bofu_dominance.core.helpers import build_status


def test_required_issues_and_prs_are_nodes():
    graph = build_graph()
    for number in (61, 128, 151, 152, 153, 154, 155, 156):
        kind = "epic" if number == 61 else "issue"
        assert graph_contains(graph, kind, number), number
    for number in (157, 158, 159):
        assert graph_contains(graph, "pull_request", number), number
    assert graph["transition_owner"] == "web-cfg/attribution-contract"
    assert graph["historical_transition_issue"] == 153
    assert graph["canary_not_family_pr"] == 157
    assert graph["data_desk_kit_pr"] == 158
    assert graph["historical_observability_pr"] == 159


def test_status_graph_records_contemporary_historical_pr_states():
    status = build_status()
    pr159 = next(node for node in status["graph"]["nodes"] if node["id"] == "pr-159")
    assert pr159["merged_to_main"] is True
    assert pr159["gsc_live_state"] == "LIVE_JOB_OK"
    pr157 = next(node for node in status["graph"]["nodes"] if node["id"] == "pr-157")
    assert pr157["role"] == "contract_analysis_canary_not_family"
    pr158 = next(node for node in status["graph"]["nodes"] if node["id"] == "pr-158")
    assert pr158["role"] == "data_desk_kit_not_registry"
    assert pr158["merged_to_main"] is True
    assert status["rules"]["pr157_is_bofu_family"] is False
    assert status["rules"]["pr158_is_second_target_registry"] is False
    assert status["rules"]["pr159_is_main_live_gsc"] is False


def test_no_contract_analysis_or_data_desk_family():
    status = build_status()
    ids = {item["id"] for item in status["families"]}
    assert "contract-analysis" not in ids
    assert "data-desk" not in ids
    assert "data_desk" not in ids
    assert "valor-tipico-contratos-pavimentacao" not in ids
