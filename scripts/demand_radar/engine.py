"""Deterministic, staged Demand Radar decisions with no composite score."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from typing import Any
from urllib.parse import urlsplit

from scripts.demand_radar.schema import (
    ALLOWED_ACTIONS,
    LEDGER_VERSION,
    OPTIONAL_SOURCE_KINDS,
    REQUIRED_SOURCE_KINDS,
    SOURCE_KINDS,
    UNKNOWN,
    parse_iso_date,
    source_effective_date,
    source_summary,
    validate_approval_manifest,
    validate_snapshot,
)

MAX_ACTIONABLE_NOW = 5

ACTION_MECHANISMS = {
    "WAIT_MEASUREMENT": (
        "Keep the protected owner unchanged and ingest the next accepted observation into the same ledger."
    ),
    "IMPROVE_SERP_SNIPPET": (
        "Validate one title/description hypothesis on the canonical owner; implementation requires a separate authorization."
    ),
    "IMPROVE_CANONICAL_OWNER": (
        "Strengthen proof and decision progression on the existing owner without creating another route."
    ),
    "FIX_COMMERCIAL_BRIDGE": (
        "Specify one owner-to-CONFENGE_WEB next-decision edge without creating another offer or handoff."
    ),
    "BUILD_UTILITY_CANDIDATE": (
        "Specify a finite useful computation and its evidence gate before any public build."
    ),
    "BUILD_ORIGINAL_DATA_ASSET_CANDIDATE": (
        "Specify a SELECT-only versioned fact contract, provenance and freshness gate before any public build."
    ),
    "CREATE_CANONICAL_OWNER_CANDIDATE": (
        "Write a URL-exact owner proposal and cannibalization review; the radar does not authorize publication."
    ),
    "CONSOLIDATE": (
        "Choose the surviving canonical owner and prepare reversible URL-level decisions before mutation."
    ),
    "DEPRIORITIZE": "Retain the evidence and stop engineering work until a new valid signal arrives.",
    "RESEARCH_REQUIRED": (
        "Fill the named evidence or authority gap with one bounded snapshot before engineering work."
    ),
}

ACTION_LEVERAGE = {
    "WAIT_MEASUREMENT": "data",
    "IMPROVE_SERP_SNIPPET": "distribution",
    "IMPROVE_CANONICAL_OWNER": "trust",
    "FIX_COMMERCIAL_BRIDGE": "revenue",
    "BUILD_UTILITY_CANDIDATE": "automation",
    "BUILD_ORIGINAL_DATA_ASSET_CANDIDATE": "data",
    "CREATE_CANONICAL_OWNER_CANDIDATE": "distribution",
    "CONSOLIDATE": "trust",
    "DEPRIORITIZE": "customer",
    "RESEARCH_REQUIRED": "data",
}


def _record_index(snapshot: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if snapshot is None:
        return {}
    return {record["family_id"]: record for record in snapshot["records"]}


def _select_active(
    snapshots: list[dict[str, Any]], *, as_of: date
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    future: list[dict[str, Any]] = []
    for snapshot in snapshots:
        if parse_iso_date(source_effective_date(snapshot), "source_effective_date_invalid") > as_of:
            future.append(snapshot)
            continue
        grouped[snapshot["source"]["kind"]].append(snapshot)
    selected: dict[str, dict[str, Any]] = {}
    for kind, candidates in grouped.items():
        selected[kind] = sorted(
            candidates,
            key=lambda item: (source_effective_date(item), item["source"]["id"]),
        )[-1]
    return selected, sorted(future, key=lambda item: item["source"]["id"])


def _source_availability(
    kind: str,
    snapshot: dict[str, Any] | None,
    approval: dict[str, Any] | None,
    *,
    as_of: date,
) -> dict[str, Any]:
    if snapshot is None:
        return {"state": UNKNOWN, "source_id": None, "reason": "No as-of-valid snapshot supplied."}
    source = snapshot["source"]
    source_id = source["id"]
    if source["geo"] != "BRA" or source["language"] != "pt-BR":
        return {
            "state": UNKNOWN,
            "source_id": source_id,
            "reason": f"Market scope {source['geo']}/{source['language']} is incompatible with BRA/pt-BR.",
        }
    freshness = source["freshness"]
    evaluated_at = parse_iso_date(freshness["evaluated_at"], "freshness_evaluated_at_invalid")
    if evaluated_at > as_of:
        return {
            "state": UNKNOWN,
            "source_id": source_id,
            "reason": "Freshness evaluation occurs after the report as-of date.",
        }
    expires_at = freshness.get("expires_at")
    if expires_at is not None and as_of > parse_iso_date(
        expires_at, "freshness_expires_at_invalid"
    ):
        return {
            "state": UNKNOWN,
            "source_id": source_id,
            "reason": f"Snapshot expired at {expires_at}.",
        }
    allowed_freshness = {"CURRENT"}
    if (
        kind == "GSC_PAGE_OVERLAY"
        and approval is not None
        and approval["allow_accepted_historical"]
        and approval["snapshot_sha256"] == snapshot["snapshot_sha256"]
    ):
        allowed_freshness.add("ACCEPTED_HISTORICAL")
    if freshness["state"] not in allowed_freshness:
        return {
            "state": UNKNOWN,
            "source_id": source_id,
            "reason": f"Freshness state {freshness['state']} is not decision-usable for {kind}.",
        }
    return {
        "state": "USABLE",
        "source_id": source_id,
        "freshness": freshness["state"],
        "reason": None,
    }


def _validate_snapshot_approvals(
    snapshots: list[dict[str, Any]], approvals: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    approved = validate_approval_manifest(approvals)
    snapshot_ids = {snapshot["source"]["id"] for snapshot in snapshots}
    if set(approved) != snapshot_ids:
        missing = sorted(snapshot_ids - set(approved))
        extra = sorted(set(approved) - snapshot_ids)
        raise ValueError(
            f"source_approval_set_mismatch:missing={','.join(missing)}:extra={','.join(extra)}"
        )
    for snapshot in snapshots:
        source = snapshot["source"]
        provenance = source["provenance"]
        approval = approved[source["id"]]
        expected = {
            "kind": source["kind"],
            "repository": provenance["repository"],
            "path": provenance["path"],
            "revision": provenance["revision"],
            "content_sha256": provenance["content_sha256"],
            "snapshot_sha256": snapshot["snapshot_sha256"],
        }
        for key, value in expected.items():
            if approval[key] != value:
                raise ValueError(f"source_approval_mismatch:{source['id']}:{key}")
    return approved


def _unknown_stage(kind: str, reason: str) -> dict[str, Any]:
    return {"source_kind": kind, "state": UNKNOWN, "reason": reason}


def _gsc_stage(record: dict[str, Any] | None, *, unavailable_reason: str | None = None) -> dict[str, Any]:
    if record is None:
        return _unknown_stage(
            "GSC_PAGE_OVERLAY",
            unavailable_reason or "No family-matched page observation exists.",
        )
    if record["state"] == UNKNOWN:
        return _unknown_stage("GSC_PAGE_OVERLAY", record["reason"])
    return {
        "source_kind": "GSC_PAGE_OVERLAY",
        "state": "OBSERVED_PAGE_EVIDENCE",
        "owner_observation": record["owner_observation"],
        "family_aggregate": record.get("family_aggregate", UNKNOWN),
        "interpretation": record.get(
            "interpretation", "Page evidence does not establish query completeness or conversion failure."
        ),
    }


def _planner_stage(
    record: dict[str, Any] | None, *, unavailable_reason: str | None = None
) -> dict[str, Any]:
    if record is None:
        return _unknown_stage(
            "KEYWORD_PLANNER",
            unavailable_reason or "No family-matched valid Planner observation exists.",
        )
    if record["state"] == UNKNOWN:
        return _unknown_stage("KEYWORD_PLANNER", record["reason"])
    return {
        "source_kind": "KEYWORD_PLANNER",
        "state": "OBSERVED_APPROXIMATE_MARKET_BREADTH",
        "breadth": record.get("breadth", UNKNOWN),
        "competition": record.get("competition", UNKNOWN),
        "bid": record.get("bid", UNKNOWN),
        "interpretation": "Approximate advertiser-market evidence; bid is not CONFENGE contract value.",
    }


def _trends_stage(
    record: dict[str, Any] | None, *, unavailable_reason: str | None = None
) -> dict[str, Any]:
    if record is None:
        return _unknown_stage(
            "GOOGLE_TRENDS",
            unavailable_reason or "No family-matched valid Trends observation exists.",
        )
    if record["state"] == UNKNOWN:
        return _unknown_stage("GOOGLE_TRENDS", record["reason"])
    return {
        "source_kind": "GOOGLE_TRENDS",
        "state": "OBSERVED_RELATIVE_MOMENTUM",
        "momentum": record.get("momentum", UNKNOWN),
        "geography": record.get("geography", UNKNOWN),
        "interpretation": "Relative momentum only; never absolute search volume.",
    }


def _commercial_stage(
    record: dict[str, Any] | None, *, unavailable_reason: str | None = None
) -> dict[str, Any]:
    if record is None:
        return _unknown_stage(
            "WARMBLY_AGGREGATE_OUTCOMES",
            unavailable_reason or "No family-matched PII-free aggregate Warmbly observation exists.",
        )
    if record["state"] == UNKNOWN:
        return _unknown_stage("WARMBLY_AGGREGATE_OUTCOMES", record["reason"])
    return {
        "source_kind": "WARMBLY_AGGREGATE_OUTCOMES",
        "state": "OBSERVED_AGGREGATE_OUTCOMES",
        "outcomes": record["outcomes"],
        "interpretation": "Observed economic feedback; no causal attribution is inferred.",
    }


def _serp_stage(
    record: dict[str, Any] | None, *, unavailable_reason: str | None = None
) -> dict[str, Any]:
    if record is None:
        return _unknown_stage(
            "SERP_RESEARCH",
            unavailable_reason or "No family-matched qualitative SERP observation exists.",
        )
    if record["state"] == UNKNOWN:
        return _unknown_stage("SERP_RESEARCH", record["reason"])
    return {
        "source_kind": "SERP_RESEARCH",
        "state": "OBSERVED_QUALITATIVE_INTENT",
        "intent_match": record.get("intent_match", UNKNOWN),
        "formats": record.get("formats", UNKNOWN),
        "interpretation": "Qualitative intent/format evidence; never volume or durable rank.",
    }


def _decision(
    owner: dict[str, Any],
    gsc: dict[str, Any] | None,
    planner: dict[str, Any] | None,
) -> tuple[str, str]:
    eligibility = owner["eligibility"]
    coverage = owner["coverage_state"]
    content = owner["content_state"]
    owner_state = owner["canonical_owner"]["state"]

    if eligibility["buyer_fit"] == "INELIGIBLE" or eligibility["truth"] == "BLOCKED":
        return "RESEARCH", "DEPRIORITIZE"
    if (
        eligibility["buyer_fit"] == UNKNOWN
        or eligibility["truth"] == UNKNOWN
        or eligibility["freeze"] == UNKNOWN
    ):
        return "RESEARCH", "RESEARCH_REQUIRED"
    if eligibility["freeze"] == "ACTIVE" or owner["execution_state"] == "MEASUREMENT_WAIT":
        return "WAIT", "WAIT_MEASUREMENT"
    if owner_state == "GAP":
        gap_state = str((owner.get("gap") or {}).get("state") or UNKNOWN)
        if gap_state == "NO_DEMAND_EVIDENCE":
            return "RESEARCH", "DEPRIORITIZE"
        planner_evidence = (
            planner is not None
            and planner.get("state") == "OBSERVED"
            and planner.get("breadth") in {"HIGH", "MEDIUM", "LOW"}
        )
        if eligibility["controllable"] and (
            gsc is not None and gsc.get("state") == "OBSERVED" or planner_evidence
        ):
            return "ACTIONABLE_NOW", "CREATE_CANONICAL_OWNER_CANDIDATE"
        return "RESEARCH", "RESEARCH_REQUIRED"
    if coverage == "COMMERCIAL_BRIDGE_GAP" or content == "BRIDGE_GAP":
        return "ACTIONABLE_NOW", "FIX_COMMERCIAL_BRIDGE"
    if coverage == "OWNED_BUT_WEAK" or content == "WEAK":
        return "ACTIONABLE_NOW", "IMPROVE_CANONICAL_OWNER"
    if content == "SERP_SNIPPET_GAP":
        return "ACTIONABLE_NOW", "IMPROVE_SERP_SNIPPET"
    if content == "UTILITY_GAP":
        return "ACTIONABLE_NOW", "BUILD_UTILITY_CANDIDATE"
    if content == "ORIGINAL_DATA_GAP":
        return "ACTIONABLE_NOW", "BUILD_ORIGINAL_DATA_ASSET_CANDIDATE"
    if coverage == "CANONICAL_CONFLICT":
        return "ACTIONABLE_NOW", "CONSOLIDATE"
    return "RESEARCH", "RESEARCH_REQUIRED"


def _owner_issue(owner: dict[str, Any]) -> str:
    refs = owner.get("issue_refs") or []
    return f"#{refs[0]['number']}" if refs else "UNOWNED"


def _smallest_next_action(owner: dict[str, Any], action: str) -> str:
    declared = str(owner.get("next_step") or "").strip()
    if declared and declared != UNKNOWN:
        return declared
    if action == "WAIT_MEASUREMENT":
        return f"Record the next accepted observation owned by {_owner_issue(owner)}; make no route change."
    if action == "RESEARCH_REQUIRED":
        return "Produce one provenance-pinned aggregate snapshot that closes the named evidence gap."
    if action == "DEPRIORITIZE":
        return "Keep the gap in the ledger and take no engineering action."
    return "Write one URL-exact implementation hypothesis for separate review."


def _risk_stage(owner: dict[str, Any]) -> dict[str, Any]:
    eligibility = owner["eligibility"]
    if eligibility["freeze"] == "ACTIVE":
        level = "BLOCKED"
        reason = "Active measurement/freeze authority forbids mutation."
    elif owner["canonical_owner"]["state"] == "GAP":
        level = "HIGH"
        reason = str((owner.get("gap") or {}).get("reason") or "Canonical ownership is unresolved.")
    elif owner["coverage_state"] == "COMMERCIAL_BRIDGE_GAP":
        level = "MEDIUM"
        reason = "Bridge work must avoid competing with adjacent canonical owners and offers."
    else:
        level = "MEDIUM"
        reason = "Tiny page samples do not prove query demand, conversion failure or causality."
    return {
        "stage": 7,
        "state": level,
        "reason": reason,
        "cannibalization": "REVIEW_REQUIRED" if level != "BLOCKED" else "NO_MUTATION",
        "compliance": "FAIL_CLOSED",
        "evidence": "NO_FABRICATED_DEMAND_OR_OUTCOME",
    }


def _unavailable_reason(
    availability: dict[str, dict[str, Any]], kind: str
) -> str | None:
    item = availability[kind]
    return item.get("reason") if item["state"] == UNKNOWN else None


def _opportunity(
    owner: dict[str, Any],
    indexes: dict[str, dict[str, dict[str, Any]]],
    availability: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    family_id = owner["family_id"]
    gsc_raw = indexes["GSC_PAGE_OVERLAY"].get(family_id)
    planner_raw = indexes["KEYWORD_PLANNER"].get(family_id)
    bucket, action = _decision(owner, gsc_raw, planner_raw)
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"action_not_allowed:{action}")
    issue = _owner_issue(owner)
    eligibility = owner["eligibility"]
    trace = [
        {
            "stage": 1,
            "name": "HARD_ELIGIBILITY",
            "buyer_fit": eligibility["buyer_fit"],
            "owner": owner["canonical_owner"]["state"],
            "freeze": eligibility["freeze"],
            "truth": eligibility["truth"],
            "controllable": eligibility["controllable"],
        },
        {
            "stage": 2,
            "name": "FIRST_PARTY_GSC",
            **_gsc_stage(
                gsc_raw,
                unavailable_reason=_unavailable_reason(availability, "GSC_PAGE_OVERLAY"),
            ),
        },
        {
            "stage": 3,
            "name": "PLANNER_MARKET_BREADTH",
            **_planner_stage(
                indexes["KEYWORD_PLANNER"].get(family_id),
                unavailable_reason=_unavailable_reason(availability, "KEYWORD_PLANNER"),
            ),
        },
        {
            "stage": 4,
            "name": "TRENDS_MOMENTUM",
            **_trends_stage(
                indexes["GOOGLE_TRENDS"].get(family_id),
                unavailable_reason=_unavailable_reason(availability, "GOOGLE_TRENDS"),
            ),
        },
        {
            "stage": 5,
            "name": "COMMERCIAL_FEEDBACK",
            **_commercial_stage(
                indexes["WARMBLY_AGGREGATE_OUTCOMES"].get(family_id),
                unavailable_reason=_unavailable_reason(
                    availability, "WARMBLY_AGGREGATE_OUTCOMES"
                ),
            ),
        },
        {
            "stage": 6,
            "name": "EXECUTION_LEVERAGE",
            "state": "ENRICHES_SHARED_LEDGER",
            "leverage_type": ACTION_LEVERAGE[action],
            "repetition_test": "100 repetitions enrich this ledger; they do not create 100 pages or issues.",
        },
        {
            "stage": 7,
            "name": "CANNIBALIZATION_COMPLIANCE_EVIDENCE_RISK",
            **{key: value for key, value in _risk_stage(owner).items() if key != "stage"},
            "serp_context": _serp_stage(
                indexes["SERP_RESEARCH"].get(family_id),
                unavailable_reason=_unavailable_reason(availability, "SERP_RESEARCH"),
            ),
        },
    ]
    return {
        "family_id": family_id,
        "bucket": bucket,
        "buyer_job": owner["buyer_job"],
        "owner_or_gap": {
            "state": owner["canonical_owner"]["state"],
            "canonical_owner_url": owner["canonical_owner"].get("url"),
            "coverage_state": owner["coverage_state"],
            "gap": owner.get("gap"),
        },
        "evidence_sample": trace[1],
        "commercial_relevance": owner["commercial_relevance"],
        "action": action,
        "mechanism": ACTION_MECHANISMS[action],
        "smallest_finite_next_action": _smallest_next_action(owner, action),
        "owner_issue": issue,
        "decision_trace": trace,
        "advisory_only": True,
        "authorizes_public_mutation": False,
    }


def _observed_state_key(stage: dict[str, Any], observed_state: str) -> tuple[int, ...]:
    return (0,) if stage.get("state") == observed_state else (1,)


def _metric_key(
    stage: dict[str, Any], key: str, *, descending: bool
) -> tuple[int, float] | tuple[int]:
    observation = stage.get("owner_observation")
    value = observation.get(key) if isinstance(observation, dict) else None
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return (1,)
    number = float(value)
    return (0, -number if descending else number)


def _category_key(
    stage: dict[str, Any],
    *,
    observed_state: str,
    field: str,
    order: dict[str, int],
) -> tuple[int, int] | tuple[int]:
    if stage.get("state") != observed_state:
        return (1,)
    value = str(stage.get(field) or UNKNOWN)
    if value == UNKNOWN or value not in order:
        return (1,)
    return (0, -order[value])


def _commercial_key(stage: dict[str, Any]) -> tuple[int, int] | tuple[int]:
    if stage.get("state") != "OBSERVED_AGGREGATE_OUTCOMES":
        return (1,)
    outcomes = stage["outcomes"]
    for rank, name in ((3, "contract"), (2, "proposal"), (1, "qco")):
        value = outcomes[name]
        if isinstance(value, int) and value > 0:
            return (0, -rank)
    # At least one observed numeric zero is evidence and remains distinct from
    # an all-UNKNOWN or absent outcome snapshot.
    if any(isinstance(value, int) for value in outcomes.values()):
        return (0, 0)
    return (1,)


def _sort_key(opportunity: dict[str, Any]) -> tuple[Any, ...]:
    trace = opportunity["decision_trace"]
    gsc, planner, trends, commercial, leverage, risk = (
        trace[1],
        trace[2],
        trace[3],
        trace[4],
        trace[5],
        trace[6],
    )
    planner_order = {"HIGH": 3, "MEDIUM": 2, "LOW": 1, UNKNOWN: 0}
    trends_order = {"RISING": 3, "STABLE": 2, "FALLING": 1, UNKNOWN: 0}
    risk_order = {"LOW": 3, "MEDIUM": 2, "HIGH": 1, "BLOCKED": 0}
    # Nested tuples preserve missing state without numeric sentinels. This is a
    # lexicographic sequence of observed facts/categories, never a multiplied
    # score or an invented floor.
    return (
        _observed_state_key(gsc, "OBSERVED_PAGE_EVIDENCE"),
        _metric_key(gsc, "impressions", descending=True),
        _metric_key(gsc, "clicks", descending=True),
        _metric_key(gsc, "position", descending=False),
        _category_key(
            planner,
            observed_state="OBSERVED_APPROXIMATE_MARKET_BREADTH",
            field="breadth",
            order=planner_order,
        ),
        _category_key(
            trends,
            observed_state="OBSERVED_RELATIVE_MOMENTUM",
            field="momentum",
            order=trends_order,
        ),
        _commercial_key(commercial),
        _observed_state_key(leverage, "ENRICHES_SHARED_LEDGER"),
        _category_key(
            risk,
            observed_state=str(risk.get("state")),
            field="state",
            order=risk_order,
        ),
        opportunity["family_id"],
    )


def _validate_gsc_owner_join(
    owners: list[dict[str, Any]], gsc_index: dict[str, dict[str, Any]]
) -> None:
    for owner in owners:
        family_id = owner["family_id"]
        record = gsc_index.get(family_id)
        if record is None or record["state"] == UNKNOWN:
            continue
        canonical = owner["canonical_owner"]
        if canonical["state"] != "OWNED":
            raise ValueError(f"gsc_observed_for_owner_gap:{family_id}")
        expected_path = urlsplit(canonical["url"]).path
        observed_path = record["owner_observation"]["path"]
        if observed_path != expected_path:
            raise ValueError(
                f"gsc_owner_path_mismatch:{family_id}:{observed_path}:{expected_path}"
            )


def build_ledger(
    snapshots: list[dict[str, Any]],
    *,
    approvals: dict[str, Any],
    as_of: str,
    origin_main: str,
) -> dict[str, Any]:
    as_of_date = parse_iso_date(as_of, "ledger_as_of_invalid")
    if not re.fullmatch(r"[a-f0-9]{40}", origin_main):
        raise ValueError("origin_main_sha_invalid")
    validated = [validate_snapshot(snapshot) for snapshot in snapshots]
    if not validated:
        raise ValueError("no_snapshots")
    source_ids = [snapshot["source"]["id"] for snapshot in validated]
    duplicate_source_ids = sorted(
        source_id for source_id in set(source_ids) if source_ids.count(source_id) > 1
    )
    if duplicate_source_ids:
        raise ValueError(f"duplicate_source_ids:{','.join(duplicate_source_ids)}")
    approved = _validate_snapshot_approvals(validated, approvals)
    selected, future = _select_active(validated, as_of=as_of_date)
    missing = sorted(REQUIRED_SOURCE_KINDS - set(selected))
    if missing:
        raise ValueError(f"required_source_kinds_missing:{','.join(missing)}")

    availability = {
        kind: _source_availability(
            kind,
            selected.get(kind),
            approved.get(selected[kind]["source"]["id"]) if kind in selected else None,
            as_of=as_of_date,
        )
        for kind in sorted(SOURCE_KINDS)
    }
    unusable_required = [
        kind for kind in sorted(REQUIRED_SOURCE_KINDS) if availability[kind]["state"] != "USABLE"
    ]
    if unusable_required:
        details = ";".join(
            f"{kind}:{availability[kind]['reason']}" for kind in unusable_required
        )
        raise ValueError(f"required_source_kinds_unusable:{details}")
    active = {
        kind: snapshot
        for kind, snapshot in selected.items()
        if availability[kind]["state"] == "USABLE"
    }

    indexes = {
        kind: _record_index(active.get(kind))
        for kind in sorted(SOURCE_KINDS)
    }
    owners = active["CANONICAL_BOFU_OWNER_PROJECTION"]["records"]
    _validate_gsc_owner_join(owners, indexes["GSC_PAGE_OVERLAY"])
    opportunities = [_opportunity(owner, indexes, availability) for owner in owners]
    opportunities.sort(key=_sort_key)

    actionable_all = [item for item in opportunities if item["bucket"] == "ACTIONABLE_NOW"]
    actionable = actionable_all[:MAX_ACTIONABLE_NOW]
    overflow = actionable_all[MAX_ACTIONABLE_NOW:]
    for item in overflow:
        item["bucket"] = "RESEARCH"
        item["action"] = "RESEARCH_REQUIRED"
        item["mechanism"] = ACTION_MECHANISMS["RESEARCH_REQUIRED"]
        item["decision_trace"][5]["leverage_type"] = ACTION_LEVERAGE["RESEARCH_REQUIRED"]
        item["smallest_finite_next_action"] = (
            "Wait for an ACTIONABLE_NOW slot; retain the evidence in this ledger."
        )

    wait = [item for item in opportunities if item["bucket"] == "WAIT"]
    research = [item for item in opportunities if item["bucket"] == "RESEARCH"]
    selected_ids = {item["family_id"] for item in opportunities}
    ignored_records = []
    for kind, index in sorted(indexes.items()):
        if kind == "CANONICAL_BOFU_OWNER_PROJECTION":
            continue
        for family_id in sorted(set(index) - selected_ids):
            ignored_records.append(
                {
                    "source_kind": kind,
                    "family_id": family_id,
                    "reason": "No canonical buyer-job projection; source evidence cannot create an opportunity.",
                }
            )

    return {
        "schema_version": LEDGER_VERSION,
        "ledger_id": "confenge-minimum-demand-radar",
        "as_of": as_of,
        "origin_main": origin_main,
        "decision_state": "EXECUTE_NOW",
        "executive_front": "INBOUND_ENGINE",
        "time_to_evidence": "One accepted snapshot cycle; public implementation is separately authorized.",
        "north_star": "Qualified Commercial Opportunities attributable through CONFENGE_WEB to proposal, contract and margin.",
        "not_success_by_itself": [
            "pages",
            "keywords",
            "traffic",
            "impressions",
            "CTR",
            "raw_leads",
            "issues",
            "PR_count",
        ],
        "decision_method": {
            "type": "LEXICOGRAPHIC_STAGED_NO_COMPOSITE_SCORE",
            "stages": [
                "hard eligibility: buyer fit / canonical owner / freeze / truth",
                "first-party GSC page evidence",
                "valid Planner market breadth",
                "Trends relative momentum",
                "aggregate QCO / proposal / contract feedback",
                "execution leverage",
                "cannibalization / compliance / evidence risk",
            ],
            "actionable_now_cap": MAX_ACTIONABLE_NOW,
            "unknown_rule": "UNKNOWN is preserved and never converted to zero or an invented floor.",
            "advisory_rule": "No radar action authorizes a public mutation, page, issue, offer or outreach.",
        },
        "source_approval_manifest_sha256": approvals["manifest_sha256"],
        "source_snapshots": [
            source_summary(snapshot)
            for snapshot in sorted(validated, key=lambda item: item["source"]["id"])
        ],
        "source_availability": availability,
        "selected_source_ids": {
            kind: snapshot["source"]["id"] for kind, snapshot in sorted(selected.items())
        },
        "active_source_ids": {
            kind: snapshot["source"]["id"] for kind, snapshot in sorted(active.items())
        },
        "ignored_source_snapshots": [
            *[
                {
                    "source_id": snapshot["source"]["id"],
                    "kind": snapshot["source"]["kind"],
                    "reason": "Snapshot effective date is after the report as-of date.",
                }
                for snapshot in future
            ],
            *[
                {
                    "source_id": state["source_id"],
                    "kind": kind,
                    "reason": state["reason"],
                }
                for kind, state in sorted(availability.items())
                if kind in OPTIONAL_SOURCE_KINDS
                and state["source_id"] is not None
                and state["state"] == UNKNOWN
            ],
        ],
        "opportunities": opportunities,
        "report": {
            "actionable_now": [item["family_id"] for item in actionable],
            "wait": [item["family_id"] for item in wait],
            "research": [item["family_id"] for item in research],
        },
        "ignored_source_records": ignored_records,
        "repetition_rule": (
            "Additional observations are normalized into snapshots and rebuild this one ledger; "
            "they do not create pages or issues."
        ),
    }
