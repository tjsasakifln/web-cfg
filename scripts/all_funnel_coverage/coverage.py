"""Fail-closed validation/reporting for #562; never creates public ownership."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "data/all-funnel-coverage/coverage-map.v1.json"
REPORT = ROOT / "docs/organic/ALL-FUNNEL-ICP-COVERAGE-562.md"
ALLOWED = {"OWNED_STRONG","OWNED_WEAK","SERP_CTR_GAP","RANKING_GAP","FORMAT_GAP","CONTENT_GAP","UTILITY_GAP","ORIGINAL_DATA_GAP","CANNIBALIZED","MEASUREMENT_WAIT","RESEARCH_REQUIRED","DEPRIORITIZE"}
REQUIRED = {"family_id","buyer_job","funnel_depth","contractor_fit","economic_adjacency","search_evidence","canonical_owner","supporting_assets","current_coverage","serp_format","ability_to_win","data_edge","utility_edge","proof_method_edge","commercial_bridge","measurement_state","owner_issue","blockers_protected_window","recommended_next_action","authorizes_public_mutation"}

def load(): return json.loads(MAP.read_text(encoding="utf-8"))

def validate(doc):
    assert doc["schema_version"] == "confenge-all-funnel-coverage/v1"
    assert doc["authorizes_public_mutation"] is False
    assert doc["external_breadth"]["state"] in {"CURRENT", "UNKNOWN", "STALE"}
    ids, owners = set(), {}
    def no_backlog(value):
        if isinstance(value, dict):
            assert not ({"keywords", "keyword_list", "urls", "url_backlog", "queries", "raw_query"} & set(value)), "keyword/url backlog forbidden"
            for child in value.values(): no_backlog(child)
        elif isinstance(value, list):
            for child in value: no_backlog(child)
    no_backlog(doc)
    bofu = {x["id"]: x for x in json.loads((ROOT / "data/bofu-dominance/core/intent-registry.v2.json").read_text())["families"]}
    for row in doc["families"]:
        missing = REQUIRED - set(row)
        assert not missing, f"{row.get('family_id')}: missing {sorted(missing)}"
        assert row["family_id"] not in ids, f"duplicate family {row['family_id']}"; ids.add(row["family_id"])
        assert row["current_coverage"] in ALLOWED, f"{row['family_id']}: invalid state"
        assert row["authorizes_public_mutation"] is False
        assert row["search_evidence"], f"{row['family_id']}: evidence required"
        for evidence in row["search_evidence"]:
            assert {"source","as_of","freshness","limitations"} <= set(evidence)
            assert not (evidence["freshness"] in {"UNKNOWN", "STALE"} and "0" in str(evidence)), "unknown evidence converted to zero"
        owner = row["canonical_owner"]
        if row["contractor_fit"] == "NON_ICP":
            assert row["current_coverage"] == "DEPRIORITIZE" and row["economic_adjacency"]
        if "bofu_join_family_id" in owner:
            key = owner["bofu_join_family_id"]; assert key in bofu, f"unknown BOFU join {key}"
            assert bofu[key].get("active_issue") != 155, "closed issue active owner"
            url = bofu[key]["canonical_owner"].get("url")
            if not url:
                assert owner.get("gap"), "closed issue active owner"
            else:
                assert owners.setdefault(url, row["family_id"]) == row["family_id"], f"conflicting owner {url}"
        else:
            assert owner.get("gap"), f"{row['family_id']}: owner or explicit gap required"
    assert len(doc["candidate_actions"]) <= 5
    for action in doc["candidate_actions"]:
        assert action["public_mutation_requires_separate_authorization"] is True
        assert action["family_id"] in ids
    return Counter(x["current_coverage"] for x in doc["families"])

def render(doc, counts):
    gaps = [x for x in doc["families"] if "gap" in x["canonical_owner"] and x["current_coverage"] != "DEPRIORITIZE"]
    deprioritized = [x for x in doc["families"] if x["current_coverage"] == "DEPRIORITIZE"]
    lines = ["# All-funnel ICP coverage — #562", "", "Decision: `EXECUTE_NOW` · P1 · Inbound Engine / SEO / Revenue / Data.", "", "This is a derived advisory portfolio, not a keyword list, URL backlog, public registry, or mutation authorization.", "", "## Universe", "", f"{len(doc['families'])} finite economic families: contractor-side TOFU, MOFU and BOFU decisions plus explicit non-ICP exclusions. External breadth is `{doc['external_breadth']['state']}`; it is never treated as zero.", "", "## Coverage states", ""]
    lines += [f"- `{state}`: {counts[state]}" for state in sorted(counts)]
    lines += ["", "## Owners and gaps", "", "BOFU owner joins resolve through #543's `intent-registry.v2`; this projection creates no competing owner. Active gaps:", ""]
    lines += [f"- `{x['family_id']}` — {x['canonical_owner']['gap']}" for x in gaps]
    lines += ["", "## Explicit deprioritize", ""]
    lines += [f"- `{x['family_id']}` — {x['economic_adjacency']}" for x in deprioritized]
    lines += ["", "## Candidate actions (next wave)", ""]
    for a in doc["candidate_actions"]:
        lines += [f"### `{a['family_id']}`", "", f"- Observed problem: {a['observed_problem']}", f"- Evidence: {a['evidence']}", f"- Owner: {a['owner']}", f"- Smallest justified action: {a['smallest_justified_action']}", f"- Dependency: {a['dependency']}", f"- Time to evidence: {a['time_to_evidence']}", f"- Why now: {a['why_now']}", f"- Why not another page: {a['why_not_another_page']}", "- Public mutation still requires separate authorization: `true`.", ""]
    comparison = doc["comparison"]
    lines += ["## External-evidence recomputation", "", f"- PRE_EXTERNAL_ACTIONS: `{', '.join(comparison['pre_external_actions'])}`", f"- POST_EXTERNAL_ACTIONS: `{', '.join(comparison['post_external_actions'])}`", f"- CHANGED_DECISIONS: `{', '.join(comparison['changed_decisions']) or 'NONE'}`", f"- UNCHANGED_DECISIONS: `{', '.join(comparison['unchanged_decisions'])}`", f"- EXTERNAL_BREADTH_STATE: `{doc['external_breadth']['state']}`", f"- NEXT_BEST_ACTION: `{comparison['next_best_action']}`", "", "## Rollback", "", "Revert this derived projection and report. No route, HTML, canonical, analytics, lead flow, public registry, or runtime changed.", ""]
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("command", choices=("build","check")); args = parser.parse_args()
    doc = load(); counts = validate(doc); report = render(doc, counts)
    if args.command == "build": REPORT.parent.mkdir(parents=True, exist_ok=True); REPORT.write_text(report, encoding="utf-8")
    else: assert REPORT.read_text(encoding="utf-8") == report, "report is stale; run all-funnel-coverage build"
    print(json.dumps({"families":len(doc["families"]),"states":dict(sorted(counts.items())),"candidate_actions":len(doc["candidate_actions"]),"external_breadth":doc["external_breadth"]["state"]}, separators=(",", ":")))
