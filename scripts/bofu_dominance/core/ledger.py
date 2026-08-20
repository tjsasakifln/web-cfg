"""Build the canonical BOFU intent ledger and status document."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.core.constants import (
    AS_OF,
    CAMPAIGN,
    CENSUS_PATH,
    DATA_DIR,
    DOCS_DIR,
    GSC_LIVE_STATE,
    MAX_NEXT_ACTIONS,
    ORIGIN_MAIN_SHA,
    REGISTRY_PATH,
    SLOT,
    STATUS_PATH,
    STATUS_SCHEMA,
)
from scripts.bofu_dominance.core.graph import build_graph
from scripts.bofu_dominance.core.gsc import (
    evidence_for_path,
    gsc_live_record,
    load_historical_pages,
    load_historical_queries,
    load_last_sync,
)
from scripts.bofu_dominance.core.hashing import canonical_json, sha256_json
from scripts.bofu_dominance.core.overlap import overlap_conflicts, shared_primary_queries
from scripts.bofu_dominance.core.recommend import ledger_next_actions, recommend_family
from scripts.bofu_dominance.core.redaction import git_safe_status
from scripts.bofu_dominance.core.schema import RegistryError, validate_registry
from scripts.bofu_dominance.core.serp import census_summary, load_census, observations_for_family
from scripts.bofu_dominance.core.states import resolve_family_state


def load_registry(path: Path | None = None) -> dict[str, Any]:
    target = path or REGISTRY_PATH
    doc = json.loads(target.read_text(encoding="utf-8"))
    return validate_registry(doc)


def _p0_p1_ids(families: list[dict[str, Any]]) -> set[str]:
    return {item["id"] for item in families if item.get("priority") in {"P0", "P1"}}


def build_status(
    *,
    registry: dict[str, Any] | None = None,
    census: dict[str, Any] | None = None,
    git_head: str | None = None,
) -> dict[str, Any]:
    registry_doc = registry or load_registry()
    families = list(registry_doc["families"])
    family_ids = {item["id"] for item in families}
    census_doc = census or load_census(family_ids=family_ids)
    pages = load_historical_pages()
    queries = load_historical_queries()
    live = gsc_live_record(load_last_sync())
    graph = build_graph()
    conflicts = overlap_conflicts(families)
    if conflicts:
        raise RegistryError(f"overlap points at unknown families: {conflicts}")
    collisions = shared_primary_queries(families)
    if collisions:
        raise RegistryError(f"primary query collision without overlap rule: {collisions}")
    if "contract-analysis" in family_ids or "contract_analysis" in family_ids:
        raise RegistryError("PR #157 canary must not be registered as a BOFU family")
    if any("data-desk" in fid or "data_desk" in fid for fid in family_ids):
        raise RegistryError("PR #158 Data Desk kit must not become a second BOFU registry")

    resolved_families: list[dict[str, Any]] = []
    for family in families:
        path = (family.get("canonical_owner") or {}).get("path")
        evidence = evidence_for_path(path, pages)
        resolved = resolve_family_state(
            family, evidence=evidence, gsc_live_state=GSC_LIVE_STATE
        )
        rec = recommend_family(resolved, family)
        if resolved["state"] == "FROZEN" and rec["authorizes_html_edit"]:
            raise RegistryError(f"{family['id']}: frozen state blocked edit-now")
        item = {
            "id": family["id"],
            "priority": family["priority"],
            "job": family["job"],
            "decision": family["decision"],
            "primary_queries": family["primary_queries"],
            "negative_queries": family["negative_queries"],
            "canonical_owner": family["canonical_owner"],
            "state": resolved["state"],
            "reason": resolved["reason"],
            "owner": resolved["owner_path"] or family["canonical_owner"].get("path"),
            "owner_issue": resolved["owner_issue"],
            "active_issue": family.get("active_issue"),
            "active_pr": family.get("active_pr"),
            "earliest_safe_action_at": family.get("earliest_safe_action_at"),
            "evidence": evidence,
            "overlap": family.get("overlap"),
            "next_test": family.get("next_test"),
            "kill": family.get("kill"),
            "consolidate": family.get("consolidate"),
            "recommendation": rec,
            "census": observations_for_family(census_doc, family["id"]),
            "gate": family.get("gate"),
            "freeze": family.get("freeze"),
            "transition_owner_issue": 153,
        }
        if item["canonical_owner"].get("path"):
            item["owner"] = item["canonical_owner"]["path"]
        elif item["state"] == "NO_CANONICAL":
            item["owner"] = f"issue:{item.get('active_issue') or item['canonical_owner'].get('issue')}"
        if not item.get("owner") or not item.get("state") or not item.get("reason"):
            raise RegistryError(f"{item['id']} missing owner/state/reason")
        resolved_families.append(item)

    p0_p1 = _p0_p1_ids(families)
    summary = census_summary(census_doc, p0_p1)
    if summary["p0_p1_missing_census"]:
        raise RegistryError(f"P0/P1 families missing census: {summary['p0_p1_missing_census']}")
    if summary["official_position_claimed"]:
        raise RegistryError("census claimed official_position")
    next_actions = ledger_next_actions()
    if len(next_actions) > MAX_NEXT_ACTIONS:
        raise RegistryError("too many next actions")
    counts: dict[str, int] = {}
    for item in resolved_families:
        counts[item["state"]] = counts.get(item["state"], 0) + 1
    status = {
        "schema": STATUS_SCHEMA,
        "campaign": CAMPAIGN,
        "slot": SLOT,
        "as_of": AS_OF,
        "git_head": git_head or ORIGIN_MAIN_SHA,
        "origin_main": ORIGIN_MAIN_SHA,
        "gsc_live": live,
        "gsc_live_state": GSC_LIVE_STATE,
        "historical_gsc": {
            "dir": "seo/gsc-2026-08-09",
            "as_of": "2026-08-09",
            "pages": len(pages),
            "queries": len(queries),
            "is_gsc_live": False,
            "note": "Historical export only. Not live Search Analytics.",
        },
        "families": resolved_families,
        "family_count": len(resolved_families),
        "state_counts": counts,
        "graph": graph,
        "next_actions": next_actions,
        "census_summary": summary,
        "rules": {
            "frozen_html": False,
            "duplicate_organic_engine": False,
            "pr157_is_bofu_family": False,
            "pr158_is_second_target_registry": False,
            "pr159_is_main_live_gsc": False,
            "gated_155_156_are_existing_pages": False,
            "transition_owner_issue": 153,
            "top_requires_context": True,
            "missing_gsc_credentials_are_zero_rank": False,
        },
    }
    safe = git_safe_status(status)
    safe["content_sha256"] = sha256_json({k: v for k, v in safe.items() if k != "content_sha256"})
    return safe


def write_artifacts(
    status: dict[str, Any] | None = None,
    *,
    data_dir: Path | None = None,
    docs_dir: Path | None = None,
) -> dict[str, Path]:
    from scripts.bofu_dominance.core.report import render_next_actions, render_report

    payload = status or build_status()
    data = data_dir or DATA_DIR
    docs = docs_dir or DOCS_DIR
    data.mkdir(parents=True, exist_ok=True)
    docs.mkdir(parents=True, exist_ok=True)
    status_path = data / STATUS_PATH.name
    status_path.write_text(canonical_json(payload), encoding="utf-8")
    report_path = docs / "REPORT.md"
    next_path = docs / "NEXT-ACTIONS.md"
    report_path.write_text(render_report(payload), encoding="utf-8")
    next_path.write_text(render_next_actions(payload), encoding="utf-8")
    return {
        "status": status_path,
        "report": report_path,
        "next_actions": next_path,
        "registry": REGISTRY_PATH,
        "census": CENSUS_PATH,
    }
