"""BOFU-CORE constants. Exclusive tree only; no HTML or engine writes."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CAMPAIGN = "CONFENGE-WEB-BOFU-INTENT-DOMINANCE-02"
SLOT = "BOFU-CORE"
SCHEMA = "bofu-intent-registry/2.0"
STATUS_SCHEMA = "bofu-intent-status/1.0"
CENSUS_SCHEMA = "bofu-serp-census/1.0"
AS_OF = "2026-08-19"
ORIGIN_MAIN_SHA = "faadc16609210522c9ffaf32a7b944817f6c6214"

DATA_DIR = ROOT / "data" / "bofu-dominance" / "core"
DOCS_DIR = ROOT / "docs" / "seo" / "bofu-dominance" / "core"
REGISTRY_PATH = DATA_DIR / "intent-registry.v2.json"
CENSUS_PATH = DATA_DIR / "serp-census.v1.json"
STATUS_PATH = DATA_DIR / "status.json"
REPORT_PATH = DOCS_DIR / "REPORT.md"
NEXT_ACTIONS_PATH = DOCS_DIR / "NEXT-ACTIONS.md"

GSC_LIVE_STATE = "BLOCKED_CREDENTIAL_FAILURE"
GSC_LIVE_RECOMMENDATION = "NEEDS_EXTERNAL_ACTION"
HISTORICAL_GSC_DIR = ROOT / "seo" / "gsc-2026-08-09"
HISTORICAL_GSC_AS_OF = "2026-08-09"
LAST_SYNC_PATH = ROOT / "data" / "revops" / "gsc" / "last_sync.json"
EARLIEST_SAFE_ACTION_FROZEN = "2026-09-16"

STATES = (
    "NOT_TARGETED",
    "FROZEN",
    "NO_CANONICAL",
    "COVERED",
    "ELIGIBLE",
    "VISIBLE",
    "TOP10",
    "TOP3",
    "TOP1",
    "DOMINANT",
    "UNKNOWN",
)
RANKING_STATES = frozenset({"TOP10", "TOP3", "TOP1", "DOMINANT"})
EDIT_NOW_ACTIONS = frozenset(
    {
        "edit_now",
        "edit_html",
        "change_snippet_now",
        "publish_page_now",
        "create_page_now",
        "index_now",
    }
)
LIVE_GSC_SOURCES = frozenset({"gsc_live", "search_analytics_api_live", "gsc_api_live"})
OFFICIAL_SERP_SOURCES = frozenset({"google_serp_official", "serp_official_with_context"})
REQUIRED_FAMILY_FIELDS = (
    "id",
    "priority",
    "job",
    "decision",
    "primary_queries",
    "negative_queries",
    "canonical_owner",
    "active_issue",
    "earliest_safe_action_at",
    "overlap",
    "next_test",
    "kill",
    "consolidate",
)
REQUIRED_EVIDENCE_FIELDS = ("source", "date", "geo", "device", "denominator")
MAX_CENSUS_QUERIES = 4
MAX_NEXT_ACTIONS = 5
ISSUE_GRAPH_REQUIRED = (61, 128, 151, 152, 153, 154, 155, 156)
PR_GRAPH_REQUIRED = (157, 158, 159)
FORBIDDEN_IMPORT_PREFIXES = (
    "scripts.organic",
    "scripts.revops",
    "scripts.discovery",
    "scripts.data_desk",
    "scripts.market_answers",
)
PII_PATTERNS = (
    r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b",
    r"\b\d{14}\b",
    r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",
    r"\+55\d{10,11}",
)

GRAPH_NODES = (
    {
        "id": "issue-61",
        "kind": "epic",
        "ref": 61,
        "role": "inbound_epic",
        "note": "Parent inbound compounding epic. Not a BOFU family.",
    },
    {
        "id": "issue-128",
        "kind": "issue",
        "ref": 128,
        "role": "frozen_pillar_owner",
        "note": "Six live BOFU pillars. Census/spec allowed; HTML edits frozen until earliest_safe_action_at.",
    },
    {
        "id": "issue-151",
        "kind": "issue",
        "ref": 151,
        "role": "freshness_clock",
        "note": "Market Answer real-clock freshness. Not a BOFU family.",
    },
    {
        "id": "issue-152",
        "kind": "issue",
        "ref": 152,
        "role": "sitemap_graph",
        "note": "Deterministic freshness-aware sitemap graph. Not a BOFU family.",
    },
    {
        "id": "issue-153",
        "kind": "issue",
        "ref": 153,
        "role": "origin_to_service_owner",
        "note": "Canonical owner of content→service transition with destination_service_id.",
    },
    {
        "id": "issue-154",
        "kind": "issue",
        "ref": 154,
        "role": "growth_accounting",
        "note": "Compounding standard. Does not authorize BOFU page scale.",
    },
    {
        "id": "issue-155",
        "kind": "issue",
        "ref": 155,
        "role": "gated_family",
        "family_id": "bid-readiness",
        "note": "GATED bid-readiness canary. Not an existing page.",
    },
    {
        "id": "issue-156",
        "kind": "issue",
        "ref": 156,
        "role": "gated_family",
        "family_id": "partner-integrity",
        "note": "GATED partner-integrity canary. Blocked on extra-cli#436.",
    },
    {
        "id": "pr-157",
        "kind": "pull_request",
        "ref": 157,
        "role": "contract_analysis_canary_not_family",
        "note": "Exactly one official-live contract analysis canary. Not a new BOFU family.",
        "state": "draft_open",
        "head": "campaign/confenge-web-contract-authority-canary-03",
        "sha": "42056bb11bfd1ee273ea922f4d1348fb98fac2a5",
        "merged_to_main": False,
    },
    {
        "id": "pr-158",
        "kind": "pull_request",
        "ref": 158,
        "role": "data_desk_kit_not_registry",
        "note": "Approved SC Data Desk citation kit. Do not create a second target registry here.",
        "state": "draft_open",
        "head": "campaign/confenge-web-data-desk-authority-02",
        "sha": "769764a72c2b7457f9ee7c8a86804e57caf38311",
        "merged_to_main": False,
    },
    {
        "id": "pr-159",
        "kind": "pull_request",
        "ref": 159,
        "role": "observability_candidate_not_live_gsc",
        "note": "Search-demand observability producer. Candidate to merge; not main; not GSC live.",
        "state": "draft_open",
        "head": "campaign/confenge-web-seo-demand-control-02",
        "sha": "feba68928ab997229028a66bb25d3b3b5a439206",
        "gsc_live_state": GSC_LIVE_STATE,
        "merged_to_main": False,
    },
)

GRAPH_EDGES = (
    {"from": "issue-61", "to": "issue-128", "rel": "parent"},
    {"from": "issue-61", "to": "issue-151", "rel": "parent"},
    {"from": "issue-61", "to": "issue-152", "rel": "parent"},
    {"from": "issue-61", "to": "issue-154", "rel": "parent"},
    {"from": "issue-61", "to": "issue-155", "rel": "parent"},
    {"from": "issue-61", "to": "issue-156", "rel": "parent"},
    {"from": "issue-128", "to": "issue-153", "rel": "measurement_dependency"},
    {"from": "issue-153", "to": "issue-88-conversion", "rel": "downstream_commercial", "external": True},
    {"from": "issue-151", "to": "issue-152", "rel": "freshness_blocks_sitemap_member"},
    {"from": "issue-155", "to": "issue-154", "rel": "scale_gate"},
    {"from": "issue-156", "to": "issue-154", "rel": "scale_gate"},
    {"from": "issue-156", "to": "extra-cli-436", "rel": "blocked_on_producer", "external": True},
    {"from": "pr-157", "to": "issue-83-canary", "rel": "implements_canary_not_bofu_family", "external": True},
    {"from": "pr-158", "to": "issue-89-data-desk", "rel": "implements_kit_not_bofu_registry", "external": True},
    {"from": "pr-159", "to": "issue-128", "rel": "observes_frozen_pillars"},
    {"from": "pr-159", "to": "issue-86-discovery", "rel": "consumes_observatory", "external": True},
)
