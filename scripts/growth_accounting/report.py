"""Build the deterministic JSON report and Markdown rendering."""

from __future__ import annotations

from typing import Any

from scripts.growth_accounting.classify import classify_state
from scripts.growth_accounting.clock import parse_as_of
from scripts.growth_accounting.cohorts import build_cohorts
from scripts.growth_accounting.components import attach_components, metric
from scripts.growth_accounting.constants import (
    COHORT_DAYS,
    COMPONENT_KEYS,
    DEFINITION_ID,
    FRESHNESS_LAG_DAYS,
    NORTH_STAR_NAME,
    PAYLOAD_STALE_DAYS,
    PRIMARY_SERIES_NAME,
    PRIMARY_SOURCE_FAMILY,
    REASON_GSC_SYNC_BLOCKED,
    REASON_INCOMPLETE_WINDOW,
    REASON_STALE_PAYLOAD,
    SCHEMA,
    SCHEMA_VERSION,
    SOURCE_FAMILIES,
    TIMEZONE,
    UNKNOWN,
)
from scripts.growth_accounting.records import is_missing, validate_input
from scripts.growth_accounting.serialize import canonical_dumps, sha256_canonical


def _payload_stale(payload: dict[str, Any], as_of) -> bool:
    observed = payload.get("payload_observed_at")
    if not observed:
        return False
    try:
        observed_dt = parse_as_of(str(observed), timezone_field=TIMEZONE)
    except Exception:
        return False
    delta = as_of.date() - observed_dt.date()
    return delta.days > PAYLOAD_STALE_DAYS


def _family_totals(cohorts: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for family in SOURCE_FAMILIES:
        clicks_unknown = False
        impressions_unknown = False
        clicks = 0.0
        impressions = 0.0
        seen = False
        for cohort in cohorts:
            family_block = (cohort.get("by_family") or {}).get(family) or {}
            metrics = family_block.get("metrics") or {}
            row_count = family_block.get("row_count") or 0
            if row_count == 0:
                continue
            c = metrics.get("clicks", UNKNOWN)
            i = metrics.get("impressions", UNKNOWN)
            if is_missing(c):
                clicks_unknown = True
            else:
                clicks += float(c)
                seen = True
            if is_missing(i):
                impressions_unknown = True
            else:
                impressions += float(i)
                seen = True
        out[family] = {
            "clicks": metric(UNKNOWN if clicks_unknown or not seen else clicks),
            "impressions": metric(UNKNOWN if impressions_unknown or not seen else impressions),
            "separated": True,
            "in_primary_series": family == PRIMARY_SOURCE_FAMILY,
        }
    return out


def _snapshot_components(payload: dict[str, Any]) -> dict[str, Any]:
    snapshots = payload.get("snapshot_aggregates") or []
    gsc = next((row for row in snapshots if row.get("id", "").startswith("gsc")), None)
    commercial = payload.get("commercial") or {}
    moat = payload.get("moat") or {}
    quality = payload.get("quality") or {}
    inventory = payload.get("inventory") or {}

    def _unk(obj: dict[str, Any], key: str) -> Any:
        if key not in obj:
            return UNKNOWN
        return obj.get(key)

    clicks = gsc.get("clicks", UNKNOWN) if gsc else UNKNOWN
    impressions = gsc.get("impressions", UNKNOWN) if gsc else UNKNOWN
    return {
        "input": {
            "approved_indexable_assets": metric(_unk(inventory, "approved_indexable_assets")),
            "substantive_changes": metric(_unk(inventory, "substantive_changes")),
            "editorial_hours": metric(_unk(inventory, "editorial_hours")),
            "refresh_cost": metric(_unk(inventory, "refresh_cost")),
            "defects": metric(_unk(quality, "defects")),
            "corrections": metric(_unk(quality, "corrections")),
            "stale_rate": metric(_unk(quality, "stale_rate")),
        },
        "discovery": {
            "non_branded_impressions": metric(impressions),
            "non_branded_clicks": metric(clicks),
            "query_coverage_count": metric(gsc.get("query_coverage_count", UNKNOWN) if gsc else UNKNOWN),
            "ctr": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
            "commercial_impressions_snapshot": metric(
                gsc.get("commercial_impressions", UNKNOWN) if gsc else UNKNOWN
            ),
            "commercial_clicks_snapshot": metric(
                gsc.get("commercial_clicks", UNKNOWN) if gsc else UNKNOWN
            ),
            "note": "Snapshot totals are not a closed 28-day cohort. Impression is not a click.",
        },
        "qualified_use": {
            "engagement_admitted": metric(_unk(payload.get("qualified_use") or {}, "engagement_admitted")),
            "method_evidence_opened": metric(
                _unk(payload.get("qualified_use") or {}, "method_evidence_opened")
            ),
            "utility_completed": metric(_unk(payload.get("qualified_use") or {}, "utility_completed")),
            "content_to_service": metric(_unk(payload.get("qualified_use") or {}, "content_to_service")),
            "contract": "#153 content→service IDs; observed events only",
        },
        "commercial": {
            "lead_valid": metric(_unk(commercial, "lead_valid")),
            "qualified": metric(_unk(commercial, "qualified")),
            "meeting": metric(_unk(commercial, "meeting")),
            "proposal": metric(_unk(commercial, "proposal")),
            "qualified_pipeline_brl": metric(_unk(commercial, "qualified_pipeline_brl")),
            "won": metric(_unk(commercial, "won")),
            "lost": metric(_unk(commercial, "lost")),
            "contracted_revenue_brl": metric(_unk(commercial, "contracted_revenue_brl")),
            "received_revenue_brl": metric(_unk(commercial, "received_revenue_brl")),
            "note": "Warmbly #88 outcomes remain UNKNOWN until observed. UNKNOWN never becomes zero.",
        },
        "moat": {
            "citations": metric(_unk(moat, "citations")),
            "referring_domains": metric(_unk(moat, "referring_domains")),
            "download_embed_reuse": metric(_unk(moat, "download_embed_reuse")),
            "return_visits": metric(_unk(moat, "return_visits")),
        },
        "efficiency": {
            "clicks_per_active_asset": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
            "pipeline_per_mature_active_asset": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
            "cost_per_click": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
        },
    }


def build_report(payload: dict[str, Any]) -> dict[str, Any]:
    validate_input(payload)
    as_of = parse_as_of(str(payload["as_of"]), timezone_field=str(payload["timezone"]))
    extra: list[str] = []
    if payload.get("gsc_sync_blocked") is True:
        extra.append(REASON_GSC_SYNC_BLOCKED)
    if _payload_stale(payload, as_of):
        extra.append(REASON_STALE_PAYLOAD)

    freshness = int(payload.get("freshness_lag_days") or FRESHNESS_LAG_DAYS)
    raw_cohorts = build_cohorts(payload, as_of, freshness_lag_days=freshness)
    cohorts = [attach_components(cohort) for cohort in raw_cohorts]
    if any(not cohort.get("complete") for cohort in cohorts):
        extra.append(REASON_INCOMPLETE_WINDOW)

    classification = classify_state(cohorts, payload, extra_reasons=extra)
    state = classification["state"]
    assert state != "SCALE_ALLOWED"

    north = UNKNOWN
    north_status = UNKNOWN
    complete = [c for c in cohorts if c.get("complete")]
    if complete:
        last = complete[-1]["components"]["commercial"]["qualified_pipeline_brl"]
        north_status = last.get("status")
        north = last.get("value")
    else:
        commercial = payload.get("commercial") or {}
        if "qualified_pipeline_brl" in commercial and not is_missing(
            commercial.get("qualified_pipeline_brl")
        ):
            north = commercial.get("qualified_pipeline_brl")
            north_status = "OBSERVED"
        else:
            north = None
            north_status = UNKNOWN

    if complete:
        components = complete[-1]["components"]
    else:
        components = _snapshot_components(payload)

    for key in COMPONENT_KEYS:
        if key not in components:
            raise AssertionError(f"component {key} missing")

    families = _family_totals(cohorts)
    if not cohorts:
        for family in SOURCE_FAMILIES:
            families[family] = {
                "clicks": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
                "impressions": metric(UNKNOWN, reason="NO_CLOSED_COHORT"),
                "separated": True,
                "in_primary_series": family == PRIMARY_SOURCE_FAMILY,
            }
        snapshots = payload.get("snapshot_aggregates") or []
        for row in snapshots:
            family = row.get("source_family")
            if family in families:
                families[family] = {
                    "clicks": metric(row.get("clicks", UNKNOWN)),
                    "impressions": metric(row.get("impressions", UNKNOWN)),
                    "separated": True,
                    "in_primary_series": family == PRIMARY_SOURCE_FAMILY,
                    "complete_closed_cohort": False,
                    "note": "Snapshot only; not a closed 28-day cohort.",
                }

    report: dict[str, Any] = {
        "schema": SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "definition_id": DEFINITION_ID,
        "timezone": TIMEZONE,
        "cohort_days": COHORT_DAYS,
        "as_of": as_of.isoformat(),
        "labeled_synthetic": bool(payload.get("labeled_synthetic")),
        "current_state": state,
        "exponential_gate_eligible": bool(classification["exponential_gate_eligible"]),
        "primary_series": {
            "name": PRIMARY_SERIES_NAME,
            "source_family": PRIMARY_SOURCE_FAMILY,
            "unit": "clicks",
            "description": "Non-branded clicks on approved indexable routes",
        },
        "north_star": {
            "name": NORTH_STAR_NAME,
            "status": north_status,
            "value": north,
        },
        "flags": {
            "source_families_separated": True,
            "unknown_preserved": True,
            "query_to_lead_join": False,
            "page_count_kpi": False,
            "scale_allowed_auto_emitted": False,
            "impression_is_not_click": True,
            "click_is_not_lead": True,
            "lead_is_not_qualified_pipeline": True,
            "contracted_is_not_received": True,
        },
        "reason_codes": classification["reason_codes"],
        "cohorts_available": classification["cohorts_available"],
        "cohorts_complete": classification["cohorts_complete"],
        "cohorts": [
            {
                "cohort_id": c["cohort_id"],
                "index": c["index"],
                "start": c["start"],
                "end": c["end"],
                "complete": c["complete"],
                "complete_days": c["complete_days"],
                "mid_cohort_new_asset_ids": c.get("mid_cohort_new_asset_ids") or [],
                "refresh_without_new_asset": c.get("refresh_without_new_asset"),
                "components": c["components"],
                "asset_ids": c.get("asset_ids") or [],
                "per_asset_clicks": c.get("per_asset_clicks") or {},
            }
            for c in cohorts
        ],
        "components": components,
        "source_families": families,
        "classification": {
            "state": state,
            "scale_allowed": False,
            "gates": classification["gates"],
            "human_scale_decision_required": True,
        },
        "human_decisions": payload.get("human_decisions") or [],
        "compatibility": payload.get("compatibility") or {},
        "sources": payload.get("sources") or [],
        "public_claim": None,
        "notes": list(payload.get("notes") or []),
    }
    if "crescimento exponencial" in canonical_dumps(report).lower():
        raise AssertionError("public exponential-growth claim is forbidden")

    hashed = dict(report)
    hashed.pop("input_hash", None)
    hashed.pop("report_hash", None)
    report["input_hash"] = sha256_canonical(
        {k: payload[k] for k in sorted(payload) if k not in {"notes"}}
    )
    report["report_hash"] = sha256_canonical(hashed)
    return report


def render_markdown(report: dict[str, Any]) -> str:
    state = report["current_state"]
    lines = [
        f"# {report['schema']} growth-accounting report",
        "",
        f"- as_of: `{report['as_of']}`",
        f"- timezone: `{report['timezone']}`",
        f"- cohort_days: `{report['cohort_days']}`",
        f"- current_state: **{state}**",
        f"- exponential_gate_eligible: `{report['exponential_gate_eligible']}`",
        f"- primary_series: `{report['primary_series']['name']}`",
        f"- north_star: `{report['north_star']['name']}` status=`{report['north_star']['status']}` value=`{report['north_star']['value']}`",
        f"- cohorts_complete: `{report['cohorts_complete']}` / available `{report['cohorts_available']}`",
        f"- labeled_synthetic: `{report['labeled_synthetic']}`",
        "",
        "## Flags",
        "",
    ]
    for key, value in report["flags"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Reason codes", ""])
    if report["reason_codes"]:
        for reason in report["reason_codes"]:
            lines.append(f"- `{reason}`")
    else:
        lines.append("- (none)")
    lines.extend(["", "## Components (always visible; no composite score)", ""])
    for key in COMPONENT_KEYS:
        lines.append(f"### {key}")
        lines.append("")
        lines.append("```json")
        from scripts.growth_accounting.serialize import canonical_dumps as dumps

        lines.append(dumps(report["components"].get(key)).rstrip())
        lines.append("```")
        lines.append("")
    lines.extend(
        [
            "## Source families (separated)",
            "",
            "Paid, branded, legacy_brand/SmartLic, outbound, partner and direct are never folded into the primary series.",
            "",
        ]
    )
    for family, body in report["source_families"].items():
        clicks = (body.get("clicks") or {}).get("status")
        lines.append(f"- `{family}` clicks_status=`{clicks}` in_primary=`{body.get('in_primary_series')}`")
    lines.extend(
        [
            "",
            "## Classification",
            "",
            f"- state: `{report['classification']['state']}`",
            f"- scale_allowed: `{report['classification']['scale_allowed']}` (never auto-emitted)",
            f"- compounding.passed: `{report['classification']['gates']['compounding']['passed']}`",
            f"- exponential.passed: `{report['classification']['gates']['exponential']['passed']}`",
            "",
            "SCALE_ALLOWED is a human decision recorded outside this generator.",
            "This report does not make a public claim of crescimento exponencial.",
            "",
            f"input_hash: `{report.get('input_hash')}`",
            f"report_hash: `{report.get('report_hash')}`",
            "",
        ]
    )
    return "\n".join(lines)


def write_report(report: dict[str, Any], out_dir, *, stem: str = "current-state") -> dict[str, str]:
    from pathlib import Path

    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    json_path = directory / f"{stem}.json"
    md_path = directory / f"{stem}.md"
    json_path.write_text(canonical_dumps(report), encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    return {"json": str(json_path), "md": str(md_path)}
