"""Prepare-only earned-distribution entry. Never sends."""

from __future__ import annotations

from typing import Any

from scripts.distribution.gates import evaluate_fit, evaluate_utility, interpret_non_response
from scripts.distribution.metrics import assert_no_backlink_kpi, metrics_payload
from scripts.distribution.outcomes import UNOBSERVED_DEFAULT, observed_or_unknown
from scripts.distribution.registry import (
    load_inherited_kit,
    load_registry,
    map_inherited_contact,
    registry_path_for,
    repo_root,
    validate_registry,
)
from scripts.distribution.schema import ALLOWED_OUTCOMES, NAMED_METRICS, require_auto_send_false


SEND_FORBIDDEN = True


def _primitive_pointer(primitives: dict[str, Any], key: str) -> dict[str, Any]:
    raw = primitives.get(key)
    if not isinstance(raw, dict):
        return {"key": key, "status": "missing"}
    status = raw.get("status") or "present"
    pointer = raw.get("url") or raw.get("page_section") or raw.get("note")
    links = raw.get("links")
    text = raw.get("text")
    return {
        "key": key,
        "status": status,
        "pointer": pointer,
        "links": links,
        "text": text,
    }


def prepare(registry: dict[str, Any], *, inherited_kit: dict[str, Any] | None = None) -> dict[str, Any]:
    """Apply kill gates and emit a human-readable prepare result. No send."""
    validate_registry(registry)
    require_auto_send_false(registry)
    asset = registry["asset"]
    utility = evaluate_utility(asset)
    primitives = asset.get("citation_primitives") if isinstance(asset.get("citation_primitives"), dict) else {}
    citation = [
        _primitive_pointer(primitives, key)
        for key in (
            "stable_citation_link",
            "quotable_stat",
            "chart_card_metadata",
            "source_method_block",
            "safe_download",
        )
    ]

    eligible: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    if utility.allow:
        for row in registry.get("targets") or []:
            fit = evaluate_fit(row, asset)
            outcome = observed_or_unknown(row.get("outcome"))
            item = {
                "id": row.get("id"),
                "target_class": row.get("target_class"),
                "target_nominal": row.get("target_nominal"),
                "editorial_angle": row.get("editorial_angle"),
                "citation_url": row.get("citation_url"),
                "owner": row.get("owner"),
                "outcome": outcome,
                "source": row.get("source"),
                "date": row.get("date"),
                "fit": fit.as_dict(),
            }
            if fit.allow:
                eligible.append(item)
            else:
                item["action"] = "do-not-contact"
                blocked.append(item)
        distribute = True
        distribute_reason = utility.reason
    else:
        distribute = False
        distribute_reason = utility.reason
        for row in registry.get("targets") or []:
            blocked.append(
                {
                    "id": row.get("id"),
                    "target_class": row.get("target_class"),
                    "target_nominal": row.get("target_nominal"),
                    "action": "do-not-contact",
                    "reason": "asset_do_not_distribute",
                    "outcome": observed_or_unknown(row.get("outcome")),
                }
            )

    inherited_audit: dict[str, Any] | None = None
    if inherited_kit is not None:
        mapped = [map_inherited_contact(c, registry) for c in inherited_kit.get("contacts") or []]
        inherited_audit = {
            "source": "data/distribution/radar-outreach-kit.json",
            "schema": inherited_kit.get("schema"),
            "auto_send": inherited_kit.get("auto_send"),
            "rows": len(mapped),
            "mapped_to_fit_registry": sum(1 for m in mapped if m["fit"]),
            "do_not_contact": sum(1 for m in mapped if not m["fit"]),
            "cloned_as_second_farm": False,
            "contacts": mapped,
        }

    observed_metrics = registry.get("metrics_observed")
    metrics = metrics_payload(observed_metrics if isinstance(observed_metrics, dict) else None)
    assert_no_backlink_kpi(metrics)

    report = {
        "schema": "earned_distribution_prepare_v1",
        "mode": "preview-report",
        "human_send_only": True,
        "auto_send": False,
        "send_forbidden": SEND_FORBIDDEN,
        "smtp_called": False,
        "webhook_called": False,
        "invented_external_mention": False,
        "invented_lead": False,
        "invented_pipeline": False,
        "invented_revenue": False,
        "asset": {
            "id": asset.get("id"),
            "name": asset.get("name"),
            "canonical_url": asset.get("canonical_url"),
            "verdict": asset.get("verdict"),
            "owner": asset.get("owner"),
        },
        "kill_gates": {
            "utility": utility.as_dict(),
            "distribute": distribute,
            "distribute_reason": distribute_reason,
            "no_utility_do_not_distribute": True,
            "no_fit_do_not_contact": True,
            "non_response_is_not_causal_failure": interpret_non_response(),
            "backlink_target_count_is_not_kpi": True,
        },
        "citation_primitives": citation,
        "eligible_targets": eligible,
        "blocked_targets": blocked,
        "inherited_pack_audit": inherited_audit,
        "allowed_outcomes": sorted(ALLOWED_OUTCOMES),
        "unobserved_outcome": UNOBSERVED_DEFAULT,
        "metrics": metrics,
        "named_metric_set": list(NAMED_METRICS),
    }
    return report


def prepare_asset(asset_id: str | None = None, *, root=None) -> dict[str, Any]:
    root = root or repo_root()
    registry = load_registry(registry_path_for(asset_id, root=root), root=root)
    kit = load_inherited_kit(root=root)
    return prepare(registry, inherited_kit=kit)


def format_prepare_report(report: dict[str, Any]) -> str:
    asset = report["asset"]
    utility = report["kill_gates"]["utility"]
    lines = [
        "EARNED DISTRIBUTION PREPARE",
        "mode: preview-report (human-send only)",
        "auto_send: false",
        "send_forbidden: true",
        "smtp_called: false",
        "webhook_called: false",
        "",
        "ASSET",
        f"  id: {asset.get('id')}",
        f"  name: {asset.get('name')}",
        f"  canonical: {asset.get('canonical_url')}",
        f"  verdict: {asset.get('verdict')}",
        f"  owner: {asset.get('owner')}",
        "",
        "KILL GATES",
        f"  utility: {'ALLOW' if utility['allow'] else 'BLOCK'} ({utility['code']}: {utility['reason']})",
        f"  distribute: {str(report['kill_gates']['distribute']).lower()}",
        f"  distribute_reason: {report['kill_gates']['distribute_reason']}",
        "  no_utility → do not distribute: armed",
        "  no_fit → do not contact: armed",
        "  non_response ≠ causal failure: armed",
        "  backlink_target_count KPI: forbidden",
        "",
        "CITATION PRIMITIVES",
    ]
    for item in report["citation_primitives"]:
        extra = item.get("links") or []
        pointer = item.get("pointer") or item.get("text") or (extra[0] if extra else "")
        if extra and pointer not in extra:
            extra_s = " | ".join(str(x) for x in extra)
            pointer = f"{pointer} | {extra_s}" if pointer else extra_s
        elif extra:
            pointer = " | ".join(str(x) for x in extra)
        lines.append(f"  {item['key']}: {item['status']} → {pointer}")
    lines.extend(["", "ELIGIBLE TARGETS (human decides/sends)"])
    if not report["eligible_targets"]:
        lines.append("  (none)")
    for row in report["eligible_targets"]:
        lines.append(
            f"  - {row.get('target_nominal')} [{row.get('target_class')}] "
            f"outcome={row.get('outcome')} owner={row.get('owner')}"
        )
        lines.append(f"    angle: {row.get('editorial_angle')}")
        lines.append(f"    citation: {row.get('citation_url')}")
    lines.extend(["", "BLOCKED TARGETS (do-not-contact)"])
    if not report["blocked_targets"]:
        lines.append("  (none)")
    for row in report["blocked_targets"]:
        reason = (row.get("fit") or {}).get("reason") or row.get("reason") or "blocked"
        label = row.get("target_nominal") or row.get("id") or "(no nominal)"
        lines.append(f"  - {label} [{row.get('target_class')}] {reason}")
    inherited = report.get("inherited_pack_audit")
    if inherited:
        lines.extend(
            [
                "",
                "INHERITED PACK AUDIT",
                f"  source: {inherited['source']}",
                f"  rows: {inherited['rows']}",
                f"  mapped_to_fit_registry: {inherited['mapped_to_fit_registry']}",
                f"  do_not_contact: {inherited['do_not_contact']}",
                f"  cloned_as_second_farm: {str(inherited['cloned_as_second_farm']).lower()}",
                f"  auto_send: {str(inherited['auto_send']).lower()}",
            ]
        )
    lines.extend(
        [
            "",
            "OUTCOMES",
            "  tokens: contacted/manual | mentioned | linked | reused | partner intro | assisted lead | UNKNOWN",
            f"  unobserved: {report['unobserved_outcome']}",
            "  invented_external_mention: false",
            "  invented_lead: false",
            "  invented_pipeline: false",
            "  invented_revenue: false",
            "",
            "METRICS (observable only; list size is not a KPI)",
        ]
    )
    for key in report["named_metric_set"]:
        cell = report["metrics"][key]
        lines.append(f"  {key}: {cell['status']}")
    lines.extend(
        [
            "",
            "SEND",
            "  action: none",
            "  human_decides: true",
        ]
    )
    return "\n".join(lines) + "\n"


def run_prepare_cli(asset_id: str | None = None, *, root=None) -> str:
    report = prepare_asset(asset_id, root=root)
    text = format_prepare_report(report)
    return text
