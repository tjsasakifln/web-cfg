"""Campaign entry: audit + census + decision over in-repo specialist HTML and proof."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.site.brand import load_brand, load_proof

from scripts.local_entity.census import build_census, load_search_baseline
from scripts.local_entity.classify import classify_graph
from scripts.local_entity.constants import (
    CAMPAIGN,
    CAMPAIGN_AS_OF,
    DECISION_STATE,
    HOME_RELPATH,
    SPECIALIST_RELPATH,
)
from scripts.local_entity.decision import decide_surface
from scripts.local_entity.graph import extract_entity_graph, merge_home_identity_graph
from scripts.local_entity.pack import citation_targets, gbp_checklist
from scripts.local_entity.persist import write_bundle
from scripts.local_entity.validate import (
    audit_graph_honesty,
    require_clean,
    validate_home_identity_contract,
    validate_bundle,
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_specialist_html(root: Path) -> str:
    path = root / SPECIALIST_RELPATH
    return path.read_text(encoding="utf-8")


def load_home_html(root: Path) -> str:
    return (root / HOME_RELPATH).read_text(encoding="utf-8")


def primary_observables(bundle: dict[str, Any]) -> dict[str, Any]:
    classified = bundle["classified"]
    census = bundle["census"]
    decision = bundle["decision"]
    gsc = census.get("gsc_live") or {}
    statuses = sorted({c["status"] for c in classified.get("claims") or []})
    channels = sorted({r["channel"] for r in census.get("rows") or []})
    return {
        "campaign": CAMPAIGN,
        "decision_state": DECISION_STATE,
        "as_of": CAMPAIGN_AS_OF,
        "claim_statuses": statuses,
        "census_channels": channels,
        "gsc_live_status": gsc.get("status"),
        "ready_for_product_decisions": gsc.get("ready_for_product_decisions"),
        "surface_decision": decision.get("decision"),
        "new_public_landing_created": decision.get("new_public_landing_created"),
        "invented_nap": False,
        "invented_review": False,
        "third_party_verified_count": classified.get("third_party_verified_count"),
        "self_attested_not_upgraded": classified.get("self_attested_not_upgraded"),
    }


def format_observables(obs: dict[str, Any]) -> str:
    lines = [
        f"campaign: {obs['campaign']}",
        f"decision_state: {obs['decision_state']}",
        f"claim_statuses: {','.join(obs['claim_statuses'])}",
        f"census_channels: {','.join(obs['census_channels'])}",
        f"gsc_live_status: {obs['gsc_live_status']}",
        f"ready_for_product_decisions: {str(obs['ready_for_product_decisions']).lower()}",
        f"surface_decision: {obs['surface_decision']}",
        f"new_public_landing_created: {str(obs['new_public_landing_created']).lower()}",
        f"invented_nap: {str(obs['invented_nap']).lower()}",
        f"invented_review: {str(obs['invented_review']).lower()}",
        f"third_party_verified_count: {obs['third_party_verified_count']}",
        f"self_attested_not_upgraded: {str(obs['self_attested_not_upgraded']).lower()}",
    ]
    return "\n".join(lines) + "\n"


def run_campaign(
    *,
    root: Path | None = None,
    specialist_html: str | None = None,
    home_html: str | None = None,
    proof: dict[str, Any] | None = None,
    brand: dict[str, Any] | None = None,
    census_rows: list[dict[str, Any]] | None = None,
    gsc_live: dict[str, Any] | None = None,
    out_dir: Path | None = None,
    write: bool = True,
    changed_paths: list[str] | None = None,
) -> dict[str, Any]:
    root = root or repo_root()
    html = specialist_html if specialist_html is not None else load_specialist_html(root)
    canonical_home = home_html if home_html is not None else load_home_html(root)
    proof_doc = proof if proof is not None else load_proof()
    brand_doc = brand if brand is not None else load_brand()
    graph = extract_entity_graph(html)
    home_graph = extract_entity_graph(canonical_home)
    honesty = audit_graph_honesty(graph, html)
    require_clean(honesty, "honesty")
    require_clean(validate_home_identity_contract(home_graph, canonical_home), "home_identity")
    public_graph = merge_home_identity_graph(graph, home_graph)
    classified = classify_graph(public_graph, proof=proof_doc, brand=brand_doc)
    baseline = load_search_baseline(root)
    census = build_census(rows=census_rows, gsc_live=gsc_live, search_baseline=baseline)
    decision = decide_surface(classified=classified, graph=graph, honesty_errors=honesty)
    gbp = gbp_checklist()
    citations = citation_targets()
    bundle = {
        "graph": graph,
        "html": html,
        "classified": classified,
        "census": census,
        "decision": decision,
        "gbp": gbp,
        "citations": citations,
        "changed_paths": changed_paths,
    }
    require_clean(validate_bundle(bundle), "bundle")
    snapshot = {
        "campaign": CAMPAIGN,
        "as_of": CAMPAIGN_AS_OF,
        "decision_state": DECISION_STATE,
        "organization": public_graph.get("organization"),
        "person": public_graph.get("person"),
        "raw_types": public_graph.get("raw_types"),
        "canonical_ids": classified.get("canonical_ids"),
        "proof_limitation": classified.get("proof_limitation"),
        "claims": classified.get("claims"),
        "claim_statuses": classified.get("claim_statuses"),
        "graph_fields_present": classified.get("graph_fields_present"),
        "self_attested_not_upgraded": True,
        "third_party_verified_count": classified.get("third_party_verified_count"),
    }
    campaign_meta = {
        "campaign": CAMPAIGN,
        "decision_state": DECISION_STATE,
        "as_of": CAMPAIGN_AS_OF,
        "refs": ["#74", "#86", "PR #159"],
        "leverage": ["trust", "distribution"],
        "visitor_job": (
            "A visitor (or search system) should recognize CONFENGE and Engº Tiago Sasaki "
            "as a national B2G engineering consultancy without a fake storefront."
        ),
        "hypothesis": (
            "Honest Organization/Person graph + labeled local/organic census + founder-only "
            "GBP checklist and professional citation targets improve entity recognition "
            "without city-page farming or invented NAP."
        ),
        "data_owner": "web-cfg local-entity campaign; identity facts remain extra-cli / owned public copy",
        "live_gsc": (
            "LIVE_JOB_OK overlay (run 32322344062); "
            "core_ready_for_product_decisions=false; absence is not zero"
        ),
        "new_public_landing_created": False,
        "surface_decision": decision["decision"],
    }
    artifacts = {
        "campaign.json": campaign_meta,
        "entity-graph.json": snapshot,
        "census.json": census,
        "surface-decision.json": decision,
        "gbp-checklist.json": gbp,
        "citation-targets.json": citations,
    }
    written: list[str] = []
    if write:
        dest = out_dir or (root / "data" / "local-entity")
        written = write_bundle(dest, artifacts)
    observables = primary_observables(bundle)
    return {
        "graph": graph,
        "public_graph": public_graph,
        "classified": classified,
        "census": census,
        "decision": decision,
        "gbp": gbp,
        "citations": citations,
        "observables": observables,
        "written": written,
        "artifacts": artifacts,
    }


def dump_json(doc: dict[str, Any]) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
