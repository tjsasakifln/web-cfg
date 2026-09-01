"""Dependency graph for #151–#156 and PRs #157–#159."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import (
    GRAPH_EDGES,
    GRAPH_NODES,
    ISSUE_GRAPH_REQUIRED,
    PR_GRAPH_REQUIRED,
)
from scripts.bofu_dominance.core.schema import RegistryError


def build_graph() -> dict[str, Any]:
    nodes = [dict(item) for item in GRAPH_NODES]
    edges = [dict(item) for item in GRAPH_EDGES]
    issue_refs = sorted(
        int(node["ref"])
        for node in nodes
        if node.get("kind") in {"issue", "epic"} and isinstance(node.get("ref"), int)
    )
    pr_refs = sorted(
        int(node["ref"])
        for node in nodes
        if node.get("kind") == "pull_request" and isinstance(node.get("ref"), int)
    )
    missing_issues = [n for n in ISSUE_GRAPH_REQUIRED if n not in issue_refs]
    missing_prs = [n for n in PR_GRAPH_REQUIRED if n not in pr_refs]
    if missing_issues or missing_prs:
        raise RegistryError(f"graph missing issues={missing_issues} prs={missing_prs}")
    pr157 = next(node for node in nodes if node["id"] == "pr-157")
    pr158 = next(node for node in nodes if node["id"] == "pr-158")
    pr159 = next(node for node in nodes if node["id"] == "pr-159")
    if pr157.get("role") != "contract_analysis_canary_not_family":
        raise RegistryError("PR #157 must remain a canary, not a BOFU family")
    if pr158.get("role") != "data_desk_kit_not_registry":
        raise RegistryError("PR #158 is the Data Desk kit; do not create a second target registry")
    if pr157.get("merged_to_main"):
        raise RegistryError("PR #157 closed unmerged and must not become a BOFU family")
    if not pr158.get("merged_to_main") or not pr159.get("merged_to_main"):
        raise RegistryError("PRs #158/#159 are historical merged implementations")
    return {
        "nodes": nodes,
        "edges": edges,
        "required_issues": list(ISSUE_GRAPH_REQUIRED),
        "required_prs": list(PR_GRAPH_REQUIRED),
        "transition_owner": "web-cfg/attribution-contract",
        "historical_transition_issue": 153,
        "frozen_owner_issue": 128,
        "historical_observability_pr": 159,
        "canary_not_family_pr": 157,
        "data_desk_kit_pr": 158,
    }


def graph_contains(graph: dict[str, Any], kind: str, ref: int) -> bool:
    return any(
        node.get("kind") == kind and int(node.get("ref")) == int(ref)
        for node in graph.get("nodes") or []
    )
