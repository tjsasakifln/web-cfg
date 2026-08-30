#!/usr/bin/env python3
"""Executable, evidence-only scorecard for the CONFENGE public surface.

The public seam is deliberately small: collectors and adversarial fixtures both
submit observations to :func:`evaluate_signal`.  The function returns one of
the three contract states and stable failure codes; no caller supplies a score.
"""

from __future__ import annotations

import copy
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


PASS = "MEASURED_PASS"
FAIL = "MEASURED_FAIL"
BLOCKED = "BLOCKED_EXTERNAL"

_COLLECTOR_IDS = {
    "copy-contract",
    "published-route-census",
    "internal-link-reachability",
    "responsive-geometry",
    "conversion-capture",
    "turnstile-coverage",
    "offer-truth",
    "price-geometry",
    "permissioned-proof",
    "seo-contract",
    "editorial-originality",
    "performance-budget",
    "accessibility-audit",
    "security-privacy",
    "analytics-revops",
    "deploy-identity",
    "gsc-freshness",
}


def collector_ids() -> set[str]:
    """Metric identifiers for which the executable gate has an adapter."""
    return set(_COLLECTOR_IDS)


def _finding_codes(observation: dict[str, Any]) -> list[str]:
    codes: list[str] = []
    for finding in observation.get("findings") or []:
        if isinstance(finding, str):
            codes.append(finding.split(" ", 1)[0])
        elif isinstance(finding, dict) and finding.get("code"):
            codes.append(str(finding["code"]))
    return codes


def _result(status: str, codes: list[str], observation: dict[str, Any]) -> dict[str, Any]:
    evidence = {
        key: observation[key]
        for key in ("route", "viewport", "owner", "as_of", "age_days")
        if observation.get(key) is not None
    }
    return {"status": status, "codes": sorted(set(codes)), "evidence": evidence}


def evaluate_signal(
    metric_id: str,
    observation: dict[str, Any],
    *,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Evaluate a measured observation through the versioned contract seam."""
    policy = policy or {}
    codes = _finding_codes(observation)

    if metric_id == "published-route-census":
        source = set(observation.get("source_routes") or [])
        artifact = set(observation.get("artifact_routes") or [])
        manifest = set(observation.get("manifest_routes") or [])
        manifest_expected = set(observation.get("manifest_expected_routes") or source)
        if not source:
            codes.append("census_source_empty")
        if source != artifact:
            codes.append("census_artifact_drift")
        if manifest_expected != manifest:
            codes.append("census_manifest_drift")

    elif metric_id == "internal-link-reachability":
        if observation.get("orphans"):
            codes.append("orphan_url")
        if observation.get("broken_internal"):
            codes.append("broken_internal_link")
        if observation.get("depth_gt_3"):
            codes.append("crawl_depth_exceeded")

    elif metric_id in {"responsive-geometry", "price-geometry", "conversion-capture"}:
        for row in observation.get("measurements") or []:
            for error in row.get("errors") or []:
                error = str(error)
                if "header_cta_missing" in error:
                    codes.append("cta_missing_at_viewport")
                elif "price_" in error or "hub_price_" in error:
                    codes.append("broken_price_geometry")
                elif "name_starved" in error or "text_width_" in error:
                    codes.append("word_squeezed")
                else:
                    codes.append(error.split("=", 1)[0])

    elif metric_id == "turnstile-coverage":
        if observation.get("missing_routes"):
            codes.append("form_without_turnstile")
        if observation.get("production_empty_key"):
            codes.append("turnstile_production_key_empty")

    elif metric_id == "permissioned-proof":
        if observation.get("unpermissioned_markers"):
            codes.append("fake_or_unpermissioned_proof")
        if codes:
            return _result(FAIL, codes, observation)
        if observation.get("external_state") == BLOCKED:
            return _result(BLOCKED, ["proof_external_blocker"], observation)

    elif metric_id == "performance-budget":
        maximum = policy.get("maximum_lcp_ms")
        measured = observation.get("lcp_ms")
        if maximum is not None and measured is not None and float(measured) > float(maximum):
            codes.append("lcp_budget_exceeded")
        codes.extend(str(row).split(" ", 1)[0] for row in observation.get("evaluation_errors") or [])

    elif metric_id == "accessibility-audit":
        if int(observation.get("critical") or 0) > 0:
            codes.append("axe_critical")
        if int(observation.get("serious") or 0) > 0:
            codes.append("axe_serious")
        if observation.get("unlabelled_controls"):
            codes.append("unlabelled_control")
        if observation.get("coverage_complete") is False:
            codes.append("accessibility_census_incomplete")

    elif metric_id == "analytics-revops":
        forbidden = set(policy.get("forbidden_fields") or [])
        present = set(observation.get("event_fields") or [])
        if forbidden & present or observation.get("pii_value_detected"):
            codes.append("analytics_pii")
        if observation.get("source") not in (None, "CONFENGE_WEB"):
            codes.append("analytics_source_drift")

    elif metric_id == "deploy-identity":
        expected = observation.get("expected") or {}
        observed = observation.get("observed") or {}
        for field in ("commit", "environment", "host_architecture_version"):
            if expected.get(field) != observed.get(field):
                codes.append(f"deploy_identity_{field}_drift")

    elif metric_id == "gsc-freshness":
        as_of = observation.get("as_of")
        today = observation.get("today")
        if not as_of or not today or observation.get("source_available") is False:
            return _result(BLOCKED, ["gsc_unavailable"], observation)
        age = (date.fromisoformat(str(today)) - date.fromisoformat(str(as_of))).days
        observation = {**observation, "age_days": age}
        if age > int(policy["maximum_age_days"]):
            return _result(BLOCKED, ["gsc_stale"], observation)

    # copy, offer, SEO, editorial and security adapters all expose findings at
    # this seam. Their implementations remain in the existing canonical gates.
    return _result(FAIL if codes else PASS, codes, observation)


def score_dimensions(
    contract: dict[str, Any],
    metric_results: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Derive an unweighted score and claim state from measured metric states."""
    dimensions: list[dict[str, Any]] = []
    for declared in contract.get("dimensions") or []:
        metrics: list[dict[str, Any]] = []
        statuses: list[str] = []
        for metric in declared.get("metrics") or []:
            metric_id = str(metric["id"])
            observed = metric_results.get(metric_id)
            if observed is None:
                observed = {
                    "status": FAIL,
                    "codes": ["metric_evidence_missing"],
                    "evidence": {"owner": declared.get("owner")},
                }
            status = str(observed.get("status") or FAIL)
            if status not in {PASS, FAIL, BLOCKED}:
                status = FAIL
                observed = {
                    **observed,
                    "codes": [*(observed.get("codes") or []), "invalid_metric_status"],
                }
            statuses.append(status)
            metrics.append(
                {
                    "id": metric_id,
                    "status": status,
                    "codes": list(observed.get("codes") or []),
                    "evidence": dict(observed.get("evidence") or {}),
                }
            )

        if FAIL in statuses or not statuses:
            dimension_status = FAIL
        elif BLOCKED in statuses:
            dimension_status = BLOCKED
        else:
            dimension_status = PASS
        dimensions.append(
            {
                "id": declared["id"],
                "label": declared.get("label") or declared["id"],
                "owner": declared.get("owner"),
                "status": dimension_status,
                "metrics": metrics,
            }
        )

    passed = sum(row["status"] == PASS for row in dimensions)
    failed = sum(row["status"] == FAIL for row in dimensions)
    blocked = sum(row["status"] == BLOCKED for row in dimensions)
    denominator = passed + failed
    addressable_score = round(10 * passed / denominator, 2) if denominator else None
    if failed:
        overall = FAIL
    elif blocked:
        overall = BLOCKED
    else:
        overall = PASS
    claimable = overall == PASS and passed == len(dimensions)
    label = f"{addressable_score:g}/10" if addressable_score is not None else "N/A"
    return {
        "overall_status": overall,
        "global_excellence_claim": "10/10" if claimable else "WITHHELD",
        "addressable_score": addressable_score,
        "addressable_score_label": label,
        "addressable_dimensions": denominator,
        "measured_pass_dimensions": passed,
        "measured_fail_dimensions": failed,
        "blocked_external_dimensions": blocked,
        # CI only hard-fails on MEASURED_FAIL. BLOCKED_EXTERNAL dimensions (e.g.
        # trust-proof, blocked on issue #328 pending a real client's permission
        # grant) are still fully measured, scored and reported above, and they
        # still withhold the 10/10 global excellence claim — but they cannot be
        # cleared by any code change, so they must not fail the required
        # site-ci check on every unrelated PR indefinitely.
        "ci_blocking": failed > 0,
        "dimensions": dimensions,
    }


def measure_published_route_census(
    source_root: Path,
    artifact_root: Path,
    manifest_path: Path,
) -> dict[str, Any]:
    """Compare independently derived source, artifact and publish-manifest sets."""
    from scripts.site.public_copy_scope import (
        MANIFEST_ROUTE_EXEMPT,
        relpath,
        route_for,
        visitor_facing_html_files,
        visitor_facing_routes,
    )

    source = set(visitor_facing_routes(source_root))
    artifact = set(visitor_facing_routes(artifact_root))
    manifest_expected = {
        route_for(relpath(path, source_root))
        for path in visitor_facing_html_files(source_root)
        if path.name == "index.html"
    } - MANIFEST_ROUTE_EXEMPT
    payload = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    manifest = {
        str(route)
        for route in payload.get("html_routes") or []
        if str(route) not in MANIFEST_ROUTE_EXEMPT
    }
    result = evaluate_signal(
        "published-route-census",
        {
            "source_routes": sorted(source),
            "artifact_routes": sorted(artifact),
            "manifest_expected_routes": sorted(manifest_expected),
            "manifest_routes": sorted(manifest),
        },
    )
    result["evidence"] = {
        "source_count": len(source),
        "artifact_count": len(artifact),
        "manifest_count": len(manifest),
        "manifest_expected_count": len(manifest_expected),
        "missing_in_artifact": sorted(source - artifact),
        "unexpected_in_artifact": sorted(artifact - source),
        "missing_in_manifest": sorted(manifest_expected - manifest),
        "unexpected_in_manifest": sorted(manifest - manifest_expected),
        "owner": "web-cfg public artifact",
    }
    return result


def measure_deliverables_report(path: Path) -> dict[str, dict[str, Any]]:
    """Adapt the #468 browser report into scorecard observations."""
    if not path.is_file():
        missing = {
            "findings": [{"code": "browser_evidence_missing"}],
            "owner": "web-cfg #468",
        }
        return {
            metric_id: evaluate_signal(metric_id, missing)
            for metric_id in ("responsive-geometry", "price-geometry", "conversion-capture")
        }
    report = json.loads(path.read_text(encoding="utf-8"))
    rows = [row for row in report.get("findings") or [] if isinstance(row, dict)]
    responsive_rows = [
        {
            **row,
            "errors": [
                error
                for error in row.get("errors") or []
                if any(
                    token in str(error)
                    for token in (
                        "overflow",
                        "name_starved",
                        "text_width_",
                        "word_",
                    )
                )
            ],
        }
        for row in rows
        if row.get("width") is not None and row.get("check") is None
    ]
    price_rows = [
        {**row, "errors": [error for error in row.get("errors") or [] if "price" in str(error)]}
        for row in rows
        if row.get("priceGeometry") is not None
        or any("price" in str(error) for error in row.get("errors") or [])
    ]
    conversion_rows = [
        {
            **row,
            "errors": [
                error
                for error in row.get("errors") or []
                if "cta" in str(error) or "form" in str(error)
            ],
        }
        for row in rows
        if row.get("check") == "header_commercial_path"
        or any("cta" in str(error) or "form" in str(error) for error in row.get("errors") or [])
    ]
    adapted: dict[str, dict[str, Any]] = {}
    for metric_id, selected in (
        ("responsive-geometry", responsive_rows),
        ("price-geometry", price_rows),
        ("conversion-capture", conversion_rows),
    ):
        result = evaluate_signal(metric_id, {"measurements": selected})
        result["evidence"] = {
            "routes": sorted({str(row.get("route")) for row in selected if row.get("route")}),
            "viewports": sorted(
                {
                    f"{row['width']}x{row.get('height') or 'auto'}"
                    for row in selected
                    if row.get("width") is not None
                }
            ),
            "owner": "web-cfg #468",
        }
        adapted[metric_id] = result
    return adapted


def measure_accessibility_report(axe_path: Path, manifest_path: Path) -> dict[str, Any]:
    """Verify axe results and prove that its risk census was not truncated."""
    axe = json.loads(axe_path.read_text(encoding="utf-8")) if axe_path.is_file() else {}
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.is_file()
        else {}
    )
    expected_public_routes = {
        str(route) for route in manifest.get("html_routes") or []
    } | {
        f"/{name}"
        for name in manifest.get("root_files") or []
        if str(name).endswith(".html") and str(name) != "index.html"
    }
    coverage = axe.get("coverage") or {}
    audited_routes = {
        str(row.get("route") if isinstance(row, dict) else row)
        for row in coverage.get("audited_routes") or []
    }
    viewport_ids = {
        str(row.get("id") if isinstance(row, dict) else row)
        for row in coverage.get("viewports") or []
    }
    pages = axe.get("pages") or []
    observed_pairs = {
        (str(row.get("path")), str(row.get("viewport")))
        for row in pages
        if isinstance(row, dict)
    }
    expected_pairs = {
        (route, viewport) for route in audited_routes for viewport in viewport_ids
    }
    sampling = coverage.get("sampling") or {}
    coverage_complete = bool(axe and expected_public_routes and audited_routes and viewport_ids)
    coverage_complete = coverage_complete and all(
        (
            int(coverage.get("public_route_count") or -1) == len(expected_public_routes),
            int(coverage.get("audited_route_count") or -1) == len(audited_routes),
            int(coverage.get("page_loads") or -1) == len(expected_pairs),
            len(pages) == len(expected_pairs),
            observed_pairs == expected_pairs,
            sampling.get("enabled") is False,
            not (sampling.get("dropped") or []),
        )
    )
    result = evaluate_signal(
        "accessibility-audit",
        {
            "critical": axe.get("critical"),
            "serious": axe.get("serious"),
            "coverage_complete": coverage_complete,
        },
    )
    blocking_routes = [
        str(row.get("path"))
        for row in pages
        if isinstance(row, dict) and int(row.get("blocking") or 0) > 0
    ]
    result["evidence"] = {
        "routes": sorted(set(blocking_routes or audited_routes or ["derived axe risk census"])),
        "viewports": sorted(viewport_ids or {"not available"}),
        "owner": "web-cfg public surface",
        "audited_route_count": coverage.get("audited_route_count"),
        "public_route_count": coverage.get("public_route_count"),
        "expected_public_route_count": len(expected_public_routes),
        "page_loads": len(pages),
    }
    return result


def _sensitive_paths(value: Any, forbidden: set[str], at: str = "$") -> list[str]:
    findings: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{at}.{key}"
            if str(key).casefold() in forbidden:
                findings.append(path)
            findings.extend(_sensitive_paths(child, forbidden, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(_sensitive_paths(child, forbidden, f"{at}[{index}]"))
    elif isinstance(value, str) and re.search(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b", value):
        findings.append(at)
    return findings


def build_report(
    contract: dict[str, Any],
    score: dict[str, Any],
    *,
    commit_sha: str,
    generated_at: str,
) -> dict[str, Any]:
    """Build the private CI artifact and reject any sensitive evidence."""
    report = {
        "schema": "confenge.site-excellence-report/1.0",
        "contract_version": contract["contract_version"],
        "implementation_base_sha": contract["implementation_base_sha"],
        "commit_sha": commit_sha,
        "generated_at": generated_at,
        "contains_sensitive_data": False,
        "score": copy.deepcopy(score),
    }
    for dimension in report["score"].get("dimensions") or []:
        for metric in dimension.get("metrics") or []:
            evidence = metric.setdefault("evidence", {})
            if "routes" not in evidence:
                evidence["routes"] = [evidence.pop("route")] if evidence.get("route") else ["derived census"]
            if "viewports" not in evidence:
                evidence["viewports"] = [evidence.pop("viewport")] if evidence.get("viewport") else ["not applicable"]
            evidence.setdefault("owner", dimension.get("owner") or "web-cfg")
    forbidden = {str(key).casefold() for key in contract["report"]["sensitive_fields_forbidden"]}
    sensitive = _sensitive_paths(report, forbidden)
    if sensitive:
        raise ValueError(f"sensitive evidence is forbidden at {', '.join(sensitive[:8])}")
    return report


def _run_command(root: Path, argv: list[str]) -> tuple[bool, str]:
    completed = subprocess.run(
        argv,
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=300,
    )
    tail = " | ".join(line.strip() for line in completed.stdout.splitlines()[-3:] if line.strip())
    return completed.returncode == 0, tail[:500]


def _metric_result(
    metric_id: str,
    *,
    codes: list[str] | None = None,
    routes: list[str] | None = None,
    viewports: list[str] | None = None,
    owner: str,
    blocked: bool = False,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    unique_codes = sorted(set(codes or []))
    status = BLOCKED if blocked and not unique_codes else FAIL if unique_codes else PASS
    evidence = {
        "routes": sorted(set(routes or ["derived census"])),
        "viewports": sorted(set(viewports or ["not applicable"])),
        "owner": owner,
        **(extra or {}),
    }
    return {"status": status, "codes": unique_codes, "evidence": evidence}


def _merge_metric_results(
    metric_id: str,
    parts: list[dict[str, Any]],
    *,
    owner: str,
) -> dict[str, Any]:
    statuses = [part.get("status") for part in parts]
    codes = [str(code) for part in parts for code in part.get("codes") or []]
    routes = [
        str(route)
        for part in parts
        for route in (part.get("evidence") or {}).get("routes") or []
    ]
    viewports = [
        str(viewport)
        for part in parts
        for viewport in (part.get("evidence") or {}).get("viewports") or []
    ]
    if FAIL in statuses:
        status = FAIL
    elif BLOCKED in statuses:
        status = BLOCKED
    else:
        status = PASS
    return {
        "status": status,
        "codes": sorted(set(codes)),
        "evidence": {
            "routes": sorted(set(routes or ["derived census"])),
            "viewports": sorted(set(viewports or ["not applicable"])),
            "owner": owner,
        },
    }


def _turnstile_observation(site_root: Path, *, expected_environment: str) -> dict[str, Any]:
    from scripts.site.public_copy_scope import relpath, route_for, visitor_facing_html_files

    forms = re.compile(r"<form\b(?P<attrs>[^>]*)>(?P<body>.*?)</form>", re.I | re.S)
    action = re.compile(
        r'\baction=["\'][^"\']*/\.netlify/functions/'
        r'(?P<endpoint>lead|conversion-intake|offer-eligibility|nurture)'
        r'(?:\?[^"\']*)?["\']',
        re.I,
    )
    action_input = re.compile(r'<input\b[^>]*\bname=["\']action["\'][^>]*>', re.I)
    action_value = re.compile(r'\bvalue=["\'](?P<value>[^"\']+)["\']', re.I)
    missing: list[str] = []
    production_empty = False
    protected_form_count = 0
    for path in visitor_facing_html_files(site_root):
        html = path.read_text(encoding="utf-8", errors="replace")
        route = route_for(relpath(path, site_root))
        for match in forms.finditer(html):
            endpoint_match = action.search(match.group("attrs"))
            if endpoint_match is None:
                continue
            endpoint = endpoint_match.group("endpoint").casefold()
            protected = endpoint in {"lead", "nurture"}
            if endpoint == "conversion-intake":
                action_tag = action_input.search(match.group("body"))
                value_match = action_value.search(action_tag.group(0)) if action_tag else None
                protected = bool(value_match and value_match.group("value").casefold() == "handraise")
            if not protected:
                continue
            protected_form_count += 1
            if "cf-turnstile" not in match.group("body") and "turnstile_token" not in match.group("body"):
                missing.append(route)
        if expected_environment == "production" and 'data-turnstile-sitekey=""' in html:
            production_empty = True
    return {
        "missing_routes": sorted(set(missing)),
        "production_empty_key": production_empty,
        "protected_form_count": protected_form_count,
    }


def _permissioned_proof_observation(root: Path) -> dict[str, Any]:
    from scripts.site.public_copy_scope import relpath, route_for, visitor_facing_html_files

    marker = re.compile(
        r'"@type"\s*:\s*"(?:Review|AggregateRating)"|'
        r'itemprop=["\'](?:ratingValue|aggregateRating|reviewBody)["\']|'
        r'(?:testimonial-carousel|client-logo-wall|logo-carousel|carrossel-de-logos)',
        re.I,
    )
    hits: list[str] = []
    for path in visitor_facing_html_files(root):
        if marker.search(path.read_text(encoding="utf-8", errors="replace")):
            hits.append(route_for(relpath(path, root)))
    registry_path = root / "data" / "commercial" / "real-proof-registry.v1.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.is_file() else {}
    return {
        "unpermissioned_markers": hits,
        "external_state": BLOCKED if registry.get("state") == BLOCKED else None,
        "owner": "web-cfg #328",
    }


def _latest_gsc_observation(root: Path, *, today: date, maximum_age_days: int) -> dict[str, Any]:
    candidates: list[tuple[date, str]] = []
    for path in sorted((root / "seo").glob("gsc-*/search-analytics-redacted.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("synthetic") is True or payload.get("fixture") is True:
            continue
        value = payload.get("max_date") or payload.get("as_of")
        try:
            candidates.append((date.fromisoformat(str(value)), str(path.relative_to(root))))
        except (TypeError, ValueError):
            continue
    if not candidates:
        observation = {
            "as_of": None,
            "today": today.isoformat(),
            "source_available": False,
            "owner": "web-cfg #413",
        }
    else:
        newest, source = max(candidates)
        observation = {
            "as_of": newest.isoformat(),
            "today": today.isoformat(),
            "source_available": True,
            "owner": "web-cfg #413",
            "source_path": source,
        }
    result = evaluate_signal(
        "gsc-freshness",
        observation,
        policy={"maximum_age_days": maximum_age_days},
    )
    result["evidence"].update(
        {
            "routes": ["search observation aggregate"],
            "viewports": ["not applicable"],
            "owner": "web-cfg #413",
            "source_available": observation["source_available"],
        }
    )
    return result


def collect_site_metrics(
    *,
    root: Path,
    site_root: Path,
    reports_dir: Path,
    contract: dict[str, Any],
    expected_environment: str,
    today: date,
) -> dict[str, dict[str, Any]]:
    """Collect every declared metric from existing gates and generated evidence."""
    if collector_ids() != {
        metric["id"]
        for dimension in contract.get("dimensions") or []
        for metric in dimension.get("metrics") or []
    }:
        raise ValueError("contract metric set does not match executable collectors")

    from scripts.organic.post_cutover_audit import internal_link_census
    from scripts.organic.sitemap_graph import load_graph_locs
    from scripts.site.audit_performance import evaluate_performance
    from scripts.site.commercial_surface_truth import evaluate_commercial_site
    from scripts.site.inbound_gates import gate_conversion, gate_naturalness
    from scripts.site.public_copy_scope import (
        indexable_visitor_html_files,
        relpath,
        route_for,
    )
    from scripts.site.seo_molds import editorial_corpus_findings, editorial_mold_findings

    results: dict[str, dict[str, Any]] = {}
    browser = measure_deliverables_report(reports_dir / "deliverables-hub-ui.json")

    manifest = root / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    results["published-route-census"] = measure_published_route_census(root, site_root, manifest)

    graph = internal_link_census(root, load_graph_locs(root))
    results["internal-link-reachability"] = _metric_result(
        "internal-link-reachability",
        codes=[
            *("orphan_url" for _ in graph["orphans"]),
            *("broken_internal_link" for _ in graph["broken_internal"]),
            *("crawl_depth_exceeded" for _ in graph["depth_gt_3"]),
        ],
        routes=[
            *graph["orphans"],
            *(row["to"] for row in graph["broken_internal"]),
            *(row["path"] for row in graph["depth_gt_3"]),
        ],
        owner="web-cfg #481",
        extra={
            "indexable_routes": graph["indexable_paths"],
            "reachable_from_home": graph["reachable_from_home"],
        },
    )

    commercial_findings = evaluate_commercial_site(root)
    naturalness = gate_naturalness(only_indexable=True)
    copy_command_ok, _ = _run_command(root, [sys.executable, "scripts/site/test_copy_gates.py"])
    copy_codes = [
        *("commercial_claim_contradiction" for _ in commercial_findings),
        *(str(finding.reason) for finding in naturalness.findings if finding.severity == "error"),
        *([] if copy_command_ok else ["copy_gate_failed"]),
    ]
    copy_routes = [
        route_for(str(finding.path))
        for finding in naturalness.findings
        if finding.severity == "error" and str(finding.path).endswith(".html")
    ]
    results["copy-contract"] = _metric_result(
        "copy-contract", codes=copy_codes, routes=copy_routes, owner="web-cfg #327"
    )
    results["offer-truth"] = _metric_result(
        "offer-truth",
        codes=["commercial_offer_truth" for _ in commercial_findings],
        routes=["commercial census"] if commercial_findings else [],
        owner="web-cfg #343",
    )

    conversion = gate_conversion()
    conversion_static = _metric_result(
        "conversion-capture",
        codes=[str(finding.reason) for finding in conversion.findings if finding.severity == "error"],
        routes=[
            route_for(str(finding.path))
            for finding in conversion.findings
            if finding.severity == "error" and str(finding.path).endswith(".html")
        ],
        owner="web-cfg #267",
    )
    results["conversion-capture"] = _merge_metric_results(
        "conversion-capture",
        [browser["conversion-capture"], conversion_static],
        owner="web-cfg #267",
    )
    results["responsive-geometry"] = browser["responsive-geometry"]
    results["price-geometry"] = browser["price-geometry"]

    turnstile_observation = _turnstile_observation(
        site_root, expected_environment=expected_environment
    )
    turnstile = evaluate_signal("turnstile-coverage", turnstile_observation)
    turnstile["evidence"] = {
        "routes": turnstile_observation["missing_routes"] or ["capture-form census"],
        "viewports": ["all"],
        "owner": "web-cfg #482",
    }
    results["turnstile-coverage"] = turnstile

    proof_observation = _permissioned_proof_observation(root)
    proof = evaluate_signal("permissioned-proof", proof_observation)
    proof["evidence"] = {
        "routes": proof_observation["unpermissioned_markers"] or ["permissioned-proof registry"],
        "viewports": ["not applicable"],
        "owner": "web-cfg #328",
    }
    results["permissioned-proof"] = proof

    seo_ok, _ = _run_command(root, [sys.executable, "seo/scripts/validate_seo.py"])
    results["seo-contract"] = _metric_result(
        "seo-contract",
        codes=[] if seo_ok else ["seo_validation_failed"],
        owner="web-cfg #61",
    )

    editorial_codes: list[str] = []
    editorial_routes: list[str] = []
    corpus: list[tuple[str, str]] = []
    for path in indexable_visitor_html_files(root):
        html = path.read_text(encoding="utf-8", errors="replace")
        route = route_for(relpath(path, root))
        slug = route.strip("/") or "home"
        mold = editorial_mold_findings(html, slug, indexable=True)
        if mold["errors"]:
            editorial_codes.append("indexable_boilerplate")
            editorial_routes.append(route)
        corpus.append((slug, html))
    clusters = editorial_corpus_findings(corpus)
    editorial_codes.extend("editorial_mold_cluster" for _ in clusters)
    results["editorial-originality"] = _metric_result(
        "editorial-originality",
        codes=editorial_codes,
        routes=editorial_routes,
        owner="web-cfg #83",
    )

    lighthouse_path = root / "docs" / "lighthouse-runs" / "summary.json"
    lighthouse = json.loads(lighthouse_path.read_text(encoding="utf-8")) if lighthouse_path.is_file() else {}
    lighthouse_ok, _ = _run_command(root, ["node", "scripts/site/test_lighthouse_thresholds.mjs"])
    evaluation_errors = list((lighthouse.get("evaluation") or {}).get("errors") or [])
    if not lighthouse_ok:
        evaluation_errors.append("lighthouse_evidence_recompute_failed")
    if not lighthouse:
        evaluation_errors.append("lighthouse_evidence_missing")
    performance = evaluate_signal(
        "performance-budget", {"evaluation_errors": evaluation_errors}
    )
    performance["evidence"] = {
        "routes": sorted({str(row.get("path")) for row in lighthouse.get("results") or []}),
        "viewports": ["mobile 390x844"],
        "owner": "web-cfg public runtime",
        "runs": len(lighthouse.get("results") or []),
    }
    asset_budget = evaluate_performance(root)
    if not asset_budget.get("ok"):
        performance["status"] = FAIL
        performance["codes"] = sorted(set([*performance["codes"], "asset_budget_exceeded"]))
    results["performance-budget"] = performance

    current_axe_path = reports_dir / "axe-report.json"
    axe_path = (
        current_axe_path
        if current_axe_path.is_file()
        else root / "docs" / "uiux-evidence" / "axe-report.json"
    )
    results["accessibility-audit"] = measure_accessibility_report(
        axe_path, root / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    )

    security_codes: list[str] = []
    try:
        from scripts.site.test_csp_contract import evaluate_live

        # evaluate_live returns (errors, inline_scripts, style_blocks,
        # style_attributes). Unpack loosely so adding another observation
        # cannot silently downgrade this dimension to "evidence unavailable".
        csp_errors, *_csp_observations = evaluate_live()
        if csp_errors:
            security_codes.append("csp_contract_failed")
    except AssertionError:
        # The built artifact is genuinely absent, so there is nothing to judge.
        security_codes.append("csp_evidence_unavailable")
    except Exception as exc:  # noqa: BLE001
        # A real defect in the evaluator must not read as missing evidence.
        security_codes.append(f"csp_evaluator_error:{type(exc).__name__}")
    secrets_ok, _ = _run_command(root, ["node", "scripts/site/test_secrets_scan.mjs"])
    if not secrets_ok:
        security_codes.append("secret_scan_failed")
    results["security-privacy"] = _metric_result(
        "security-privacy",
        codes=security_codes,
        routes=["/_headers", "public artifact"],
        owner="web-cfg public runtime",
    )

    analytics_ok, _ = _run_command(root, ["node", "seo/scripts/test_analytics_pii.mjs"])
    browser_payload = (
        json.loads((reports_dir / "deliverables-hub-ui.json").read_text(encoding="utf-8"))
        if (reports_dir / "deliverables-hub-ui.json").is_file()
        else {}
    )
    browser_analytics_failed = any(
        row.get("check") == "analytics" and row.get("errors")
        for row in browser_payload.get("findings") or []
    )
    results["analytics-revops"] = _metric_result(
        "analytics-revops",
        codes=[
            *([] if analytics_ok else ["analytics_pii_gate_failed"]),
            *(["browser_analytics_contract_failed"] if browser_analytics_failed else []),
        ],
        routes=["/entregas/"],
        viewports=["390x844"],
        owner="web-cfg #267; Warmbly downstream",
    )

    build_info_path = site_root / ".well-known" / "build-info.json"
    build_info = json.loads(build_info_path.read_text(encoding="utf-8")) if build_info_path.is_file() else {}
    runtime_contract = json.loads((root / "runtime" / "contract.json").read_text(encoding="utf-8"))
    authority = (root / "docs" / "architecture" / "RUNTIME-AUTHORITY.md").read_text(encoding="utf-8")
    architecture = re.search(r"^\s*host_architecture_version:\s*(\S+)", authority, re.M)
    expected_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    runtime_ok, _ = _run_command(root, ["node", "--test", "scripts/site/test_runtime_authority.mjs"])
    deploy = evaluate_signal(
        "deploy-identity",
        {
            "expected": {
                "commit": expected_sha,
                "environment": expected_environment,
                "host_architecture_version": architecture.group(1) if architecture else None,
            },
            "observed": {
                "commit": build_info.get("commit"),
                "environment": build_info.get("environment"),
                "host_architecture_version": runtime_contract.get("host_architecture_version"),
            },
        },
    )
    if not runtime_ok:
        deploy["status"] = FAIL
        deploy["codes"] = sorted(set([*deploy["codes"], "runtime_authority_contract_failed"]))
    deploy["evidence"] = {
        "routes": ["/.well-known/build-info.json"],
        "viewports": ["not applicable"],
        "owner": "RUNTIME-AUTHORITY; web-cfg #466",
        "expected_environment": expected_environment,
        "observed_environment": build_info.get("environment"),
        "expected_commit": expected_sha,
        "observed_commit": build_info.get("commit"),
    }
    results["deploy-identity"] = deploy

    freshness_metric = next(
        metric
        for dimension in contract["dimensions"]
        for metric in dimension["metrics"]
        if metric["id"] == "gsc-freshness"
    )
    results["gsc-freshness"] = _latest_gsc_observation(
        root,
        today=today,
        maximum_age_days=int(freshness_metric["maximum_age_days"]),
    )
    return results


def render_markdown(report: dict[str, Any]) -> str:
    def compact(values: list[str], *, limit: int = 5) -> str:
        rendered = [str(value) for value in values]
        if len(rendered) <= limit:
            return ", ".join(rendered)
        return ", ".join([*rendered[:limit], f"... +{len(rendered) - limit} in JSON artifact"])

    score = report["score"]
    lines = [
        "# CONFENGE site excellence",
        "",
        f"- Contract: `{report['contract_version']}`",
        f"- Base SHA: `{report['implementation_base_sha']}`",
        f"- Commit: `{report['commit_sha']}`",
        f"- Overall: **{score['overall_status']}**",
        f"- Addressable: **{score['addressable_score_label']}**",
        f"- Global excellence claim: **{score['global_excellence_claim']}**",
        f"- External blockers: **{score['blocked_external_dimensions']}**",
        "",
        "| Dimension | State | Evidence | Owner |",
        "|---|---|---|---|",
    ]
    for dimension in score["dimensions"]:
        evidence_bits: list[str] = []
        owners: list[str] = []
        for metric in dimension["metrics"]:
            evidence = metric["evidence"]
            routes = compact(evidence.get("routes") or [])
            viewports = compact(evidence.get("viewports") or [])
            codes = ", ".join(metric.get("codes") or ["measured pass"])
            evidence_bits.append(f"{metric['id']}: {codes}; route={routes}; viewport={viewports}")
            owner = str(evidence.get("owner") or dimension.get("owner") or "web-cfg")
            if owner not in owners:
                owners.append(owner)
        lines.append(
            f"| {dimension['label']} | {dimension['status']} | {'<br>'.join(evidence_bits)} | "
            f"{'; '.join(owners)} |"
        )
    lines.extend(
        [
            "",
            "`BLOCKED_EXTERNAL` is never converted to zero or PASS. It is outside the "
            "addressable denominator and withholds the global 10/10 claim, but it does "
            "not hard-fail CI or promotion -- no code PR can clear an external blocker "
            "(see issue #328). Only `MEASURED_FAIL` blocks CI.",
            "",
        ]
    )
    return "\n".join(lines)


def render_ci_annotations(score: dict[str, Any]) -> list[str]:
    """Emit explicit GitHub annotations without converting blockers into scores."""
    annotations: list[str] = []
    for dimension in score.get("dimensions") or []:
        status = dimension.get("status")
        if status not in {FAIL, BLOCKED}:
            continue
        level = "error" if status == FAIL else "warning"
        codes = sorted(
            {
                str(code)
                for metric in dimension.get("metrics") or []
                for code in metric.get("codes") or []
            }
        )
        owners = sorted(
            {
                str((metric.get("evidence") or {}).get("owner") or dimension.get("owner"))
                for metric in dimension.get("metrics") or []
            }
        )
        message = (
            f"{dimension.get('id')}: {status}; codes={','.join(codes) or 'none'}; "
            f"owner={','.join(owners)}"
        )
        annotations.append(f"::{level} title=Site excellence {dimension.get('id')}::{message}")
    return annotations


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--site-root", type=Path)
    parser.add_argument("--reports-dir", type=Path)
    parser.add_argument("--expected-environment", default="local")
    parser.add_argument("--today", type=date.fromisoformat, default=date.today())
    args = parser.parse_args(argv)
    root = args.root.resolve()
    site_root = (args.site_root or root / "_site").resolve()
    reports_dir = (args.reports_dir or root / "build" / "reports").resolve()
    contract_path = root / "data" / "quality" / "site-excellence.v1.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    metric_results = collect_site_metrics(
        root=root,
        site_root=site_root,
        reports_dir=reports_dir,
        contract=contract,
        expected_environment=args.expected_environment,
        today=args.today,
    )
    score = score_dimensions(contract, metric_results)
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    generated = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    report = build_report(contract, score, commit_sha=sha, generated_at=generated)
    markdown = render_markdown(report)
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / "site-excellence.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (reports_dir / "site-excellence.md").write_text(markdown, encoding="utf-8")
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as stream:
            stream.write(markdown)
    for annotation in render_ci_annotations(score):
        print(annotation)
    print(markdown)
    return 1 if score["ci_blocking"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
