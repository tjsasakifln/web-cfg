"""Deterministic per-asset and cohort reports. Input-supplied timestamps only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.discovery.eligibility import (
    eligibility_defects,
    is_fixture,
    is_publicable,
    robots_is_noindex,
)
from scripts.discovery.inspect import inspect_asset
from scripts.discovery.metrics import apply_observed, empty_stage_payload
from scripts.discovery.registry import load_allowlist, load_cohort, load_observed, repo_root
from scripts.discovery.schema import (
    METRIC_STAGES,
    REQUIRED_ASSET_FIELDS,
    SCHEMA_ID,
    UNKNOWN,
    validate_recommendation,
)

MAINTENANCE_COST_DEFAULT = "UNKNOWN"


def _unknown_cell() -> dict[str, Any]:
    return {"status": UNKNOWN, "value": None}


def overlay_external_state(asset_id: str, observed: dict[str, Any]) -> dict[str, Any]:
    assets = observed.get("assets") if isinstance(observed.get("assets"), dict) else {}
    cell = assets.get(asset_id) if isinstance(assets, dict) else None
    if not isinstance(cell, dict):
        return {
            "google_index_state": UNKNOWN,
            "bing_index_state": UNKNOWN,
            "gsc_state": UNKNOWN,
            "generative_ai_visibility": UNKNOWN,
            "chatgpt_ai_referrals": UNKNOWN,
            "authorized_crawler_logs": UNKNOWN,
            "referring_domains": UNKNOWN,
            "citations": UNKNOWN,
            "downstream_attribution": UNKNOWN,
        }
    keys = (
        "google_index_state",
        "bing_index_state",
        "gsc_state",
        "generative_ai_visibility",
        "chatgpt_ai_referrals",
        "authorized_crawler_logs",
        "referring_domains",
        "citations",
        "downstream_attribution",
    )
    out: dict[str, Any] = {}
    for key in keys:
        value = cell.get(key)
        out[key] = UNKNOWN if value in (None, "") else value
    return out


def recommend_asset(
    asset: dict[str, Any],
    inspected: dict[str, Any],
    defects: list[str],
    *,
    approved_configured: bool,
) -> tuple[str, str]:
    """Return (recommendation, next_action)."""
    if "fixture_listed_in_sitemap" in defects or "fixture_has_public_canonical" in defects:
        return "STOP", "remove_fixture_from_public_surface"
    if is_fixture(asset):
        return (
            "READY_FOR_APPROVED_ASSET",
            "swap_fixture_id_for_approved_asset_in_registry",
        )
    if "noindex_listed_in_sitemap" in defects or "index_intent_but_noindex" in defects:
        return "ADJUST", "reconcile_index_intent_robots_sitemap"
    if "structured_data_name_mismatch" in defects or "structured_data_description_mismatch" in defects:
        return "ADJUST", "align_structured_data_with_visible_copy"
    if asset.get("index_intent") == "DO_NOT_INDEX":
        return "ADJUST", "hold_until_publication_gate"
    if not approved_configured:
        return "READY_FOR_APPROVED_ASSET", "keep_prepare_only_until_approved_asset"
    if defects:
        return "ADJUST", "fix_eligibility_defects"
    return "ADJUST", "observe_appearance_before_claiming_discovery"


def package_completeness(asset: dict[str, Any], data_desk_summary: dict[str, Any] | None) -> dict[str, Any]:
    if not data_desk_summary:
        return {
            "status": "not_this_asset" if not is_fixture(asset) else "missing",
            "fields_present": [],
        }
    required = (
        "citation_text",
        "method_version",
        "schema_version",
        "data_version",
        "as_of",
        "coverage",
        "limitations",
        "correction_link",
        "creator",
        "publisher",
        "license",
        "usage_guidance",
        "identifier",
        "provenance",
        "package_hash",
    )
    present = [key for key in required if data_desk_summary.get(key)]
    return {
        "status": "complete" if len(present) == len(required) else "incomplete",
        "fields_present": present,
        "watermark": data_desk_summary.get("watermark"),
    }


def build_asset_record(
    asset: dict[str, Any],
    inspected: dict[str, Any],
    observed: dict[str, Any],
    *,
    data_desk_summary: dict[str, Any] | None = None,
    external_targets_prepared: int = 0,
    approved_configured: bool = False,
    generated_at: str,
) -> dict[str, Any]:
    defects = eligibility_defects(asset, inspected)
    publicable = is_publicable(asset, inspected)
    external = overlay_external_state(asset["id"], observed)
    stages_observed = None
    assets_obs = observed.get("assets") if isinstance(observed.get("assets"), dict) else {}
    asset_obs = assets_obs.get(asset["id"]) if isinstance(assets_obs, dict) else None
    if isinstance(asset_obs, dict) and isinstance(asset_obs.get("stages"), dict):
        stages_observed = asset_obs["stages"]
    stages = apply_observed(empty_stage_payload(), stages_observed)
    rec, next_action = recommend_asset(
        asset, inspected, defects, approved_configured=approved_configured
    )
    validate_recommendation(rec)
    noindex = bool(asset.get("noindex")) or robots_is_noindex(inspected.get("robots_meta"))
    record = {
        "id": asset.get("id"),
        "category": asset.get("category"),
        "canonical": asset.get("canonical"),
        "index_intent": asset.get("index_intent"),
        "http": inspected.get("http"),
        "robots_meta": inspected.get("robots_meta"),
        "robots_txt_blocked": inspected.get("robots_txt_blocked"),
        "sitemap": inspected.get("sitemap"),
        "renderability": inspected.get("renderability"),
        "structured_data_visible": inspected.get("structured_data_visible") or [],
        "title": inspected.get("title"),
        "description": inspected.get("description"),
        "content_version": inspected.get("content_version"),
        "method_version": inspected.get("method_version"),
        "as_of": inspected.get("as_of"),
        "freshness": inspected.get("freshness"),
        "correction_owner": inspected.get("correction_owner"),
        "google_index_state": external["google_index_state"],
        "bing_index_state": external["bing_index_state"],
        "gsc_state": external["gsc_state"],
        "generative_ai_visibility": external["generative_ai_visibility"],
        "chatgpt_ai_referrals": external["chatgpt_ai_referrals"],
        "authorized_crawler_logs": external["authorized_crawler_logs"],
        "referring_domains": external["referring_domains"],
        "citations": external["citations"],
        "downstream_attribution": external["downstream_attribution"],
        "fixture": is_fixture(asset),
        "noindex": noindex,
        "publicable": publicable,
        "indexnow_eligible": False,
        "eligibility_defects": defects,
        "metric_stages": stages,
        "package_completeness": package_completeness(asset, data_desk_summary),
        "correction_freshness": {
            "as_of": inspected.get("as_of"),
            "freshness": inspected.get("freshness"),
            "correction_owner": inspected.get("correction_owner"),
            "correction_link": asset.get("correction_link") or "https://confenge.com.br/correcoes/",
        },
        "external_targets_prepared": external_targets_prepared if is_fixture(asset) else 0,
        "maintenance_cost": asset.get("maintenance_cost") or MAINTENANCE_COST_DEFAULT,
        "next_action": next_action,
        "recommendation": rec,
        "generated_at": generated_at,
        "related_issues": list(asset.get("related_issues") or []),
    }
    missing = [field for field in REQUIRED_ASSET_FIELDS if field not in record]
    if missing:
        raise RuntimeError("report_missing_fields:" + ",".join(missing))
    return record


def recommend_cohort(records: list[dict[str, Any]]) -> str:
    if any(r["recommendation"] == "STOP" for r in records):
        return "STOP"
    if any(is_fixture({"fixture": r.get("fixture")}) for r in records) and not any(
        r.get("id") != "fixture-only-citation-kit" and r.get("recommendation") == "ADJUST" and r.get("publicable")
        and r.get("package_completeness", {}).get("status") == "complete"
        for r in records
    ):
        return "READY_FOR_APPROVED_ASSET"
    return "READY_FOR_APPROVED_ASSET"


def load_data_desk_summary(root: Path) -> dict[str, Any] | None:
    path = root / "data" / "data-desk" / "packages" / "fixture-only" / "package.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def build_report(
    *,
    root: Path | None = None,
    generated_at: str | None = None,
    data_desk_summary: dict[str, Any] | None = None,
    external_targets_prepared: int = 0,
    approved_asset_id: str | None = None,
) -> dict[str, Any]:
    root = root or repo_root()
    cohort = load_cohort(root=root)
    observed = load_observed(root=root)
    allowlist = load_allowlist(root=root)
    if data_desk_summary is None:
        data_desk_summary = load_data_desk_summary(root)
    if data_desk_summary and not external_targets_prepared:
        targets = (data_desk_summary.get("syndication") or {}).get("targets") or []
        external_targets_prepared = len(targets)
    stamp = generated_at or cohort.get("generated_at") or "1970-01-01T00:00:00Z"
    approved_configured = bool(approved_asset_id) or bool(cohort.get("approved_asset_id"))
    inspections: dict[str, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []
    for asset in cohort["assets"]:
        inspected = inspect_asset(asset, root=root)
        inspections[asset["id"]] = inspected
        desk = data_desk_summary if is_fixture(asset) else None
        record = build_asset_record(
            asset,
            inspected,
            observed,
            data_desk_summary=desk,
            external_targets_prepared=external_targets_prepared if is_fixture(asset) else 0,
            approved_configured=approved_configured,
            generated_at=stamp,
        )
        records.append(record)

    allowlisted = list(allowlist.get("urls") or [])
    publicable = [r["canonical"] for r in records if r.get("publicable") and r.get("canonical")]
    indexnow_candidates = [url for url in publicable if url in allowlisted]
    for record in records:
        record["indexnow_eligible"] = bool(
            record.get("canonical") in indexnow_candidates and not record.get("fixture")
        )

    report = {
        "schema": SCHEMA_ID,
        "mode": "prepare-only",
        "generated_at": stamp,
        "network_probed": False,
        "llms_txt_strategy": False,
        "geo_hacks": False,
        "cloaking": False,
        "fake_citations": False,
        "metric_stages": list(METRIC_STAGES),
        "stage_rules": {
            "bot_hit_is_not_citation": True,
            "impression_is_not_session": True,
            "referral_is_not_lead": True,
            "receipt_is_not_indexation": True,
        },
        "cohort_size": len(records),
        "categories": sorted({r["category"] for r in records}),
        "assets": records,
        "publicable_urls": publicable,
        "indexnow_allowlist": allowlisted,
        "indexnow_candidates": indexnow_candidates,
        "fixture_ids": [r["id"] for r in records if r.get("fixture")],
        "recommendation": recommend_cohort(records),
        "next_action": "swap_fixture_for_approved_asset_then_human_gate",
    }
    return report


def format_report(report: dict[str, Any]) -> str:
    lines = [
        "DISCOVERY OBSERVATORY",
        "mode: prepare-only",
        f"generated_at: {report['generated_at']}",
        f"network_probed: {str(report['network_probed']).lower()}",
        f"llms_txt_strategy: {str(report['llms_txt_strategy']).lower()}",
        f"cohort_size: {report['cohort_size']}",
        f"recommendation: {report['recommendation']}",
        f"next_action: {report['next_action']}",
        "",
        "METRIC STAGES",
    ]
    for stage in report["metric_stages"]:
        lines.append(f"  - {stage}")
    lines.extend(
        [
            "  bot_hit ≠ citation",
            "  impression ≠ session",
            "  referral ≠ lead",
            "  IndexNow receipt ≠ indexation",
            "",
            "ASSETS",
        ]
    )
    for asset in report["assets"]:
        lines.append(f"  id: {asset['id']}")
        lines.append(f"    category: {asset['category']}")
        lines.append(f"    canonical: {asset.get('canonical')}")
        lines.append(f"    index_intent: {asset['index_intent']}")
        lines.append(f"    http: {asset['http'].get('status')}")
        lines.append(f"    robots_meta: {asset['robots_meta']}")
        lines.append(f"    sitemap: {str(asset['sitemap']).lower()}")
        lines.append(f"    renderability: {asset['renderability']}")
        sd = ",".join(asset["structured_data_visible"]) or UNKNOWN
        lines.append(f"    structured_data: {sd}")
        lines.append(f"    title: {asset['title']}")
        lines.append(f"    description: {asset['description']}")
        lines.append(f"    content_version: {asset['content_version']}")
        lines.append(f"    method_version: {asset['method_version']}")
        lines.append(f"    as_of: {asset['as_of']}")
        lines.append(f"    freshness: {asset['freshness']}")
        lines.append(f"    correction_owner: {asset['correction_owner']}")
        lines.append(f"    google_index_state: {asset['google_index_state']}")
        lines.append(f"    bing_index_state: {asset['bing_index_state']}")
        lines.append(f"    gsc_state: {asset['gsc_state']}")
        lines.append(f"    generative_ai_visibility: {asset['generative_ai_visibility']}")
        lines.append(f"    chatgpt_ai_referrals: {asset['chatgpt_ai_referrals']}")
        lines.append(f"    authorized_crawler_logs: {asset['authorized_crawler_logs']}")
        lines.append(f"    referring_domains: {asset['referring_domains']}")
        lines.append(f"    citations: {asset['citations']}")
        lines.append(f"    downstream_attribution: {asset['downstream_attribution']}")
        lines.append(f"    fixture: {str(asset['fixture']).lower()}")
        lines.append(f"    publicable: {str(asset['publicable']).lower()}")
        lines.append(f"    indexnow_eligible: {str(asset['indexnow_eligible']).lower()}")
        defects = ",".join(asset["eligibility_defects"]) or "(none)"
        lines.append(f"    eligibility_defects: {defects}")
        lines.append("    stages:")
        for stage in METRIC_STAGES:
            cell = asset["metric_stages"][stage]
            lines.append(f"      {stage}: {cell['status']}")
        lines.append(f"    package_completeness: {asset['package_completeness']['status']}")
        lines.append(f"    external_targets_prepared: {asset['external_targets_prepared']}")
        lines.append(f"    maintenance_cost: {asset['maintenance_cost']}")
        lines.append(f"    next_action: {asset['next_action']}")
        lines.append(f"    recommendation: {asset['recommendation']}")
    lines.extend(
        [
            "",
            "PUBLICABLE",
        ]
    )
    if not report["publicable_urls"]:
        lines.append("  (none)")
    for url in report["publicable_urls"]:
        lines.append(f"  - {url}")
    lines.extend(["", "INDEXNOW CANDIDATES"])
    if not report["indexnow_candidates"]:
        lines.append("  (none)")
    for url in report["indexnow_candidates"]:
        lines.append(f"  - {url}")
    lines.append("")
    return "\n".join(lines)


def dump_stable(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
