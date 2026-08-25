"""Fail-closed semantic query ownership contract for Medicoes/Glosas.

The contract is decision data only.  This module reads public HTML and evidence
files to prove that every existing route in the cluster is classified; it never
writes HTML, robots directives, canonical tags or redirects.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "data" / "organic" / "medicoes-glosas-query-ownership.v1.json"
SERVICE_MAP_PATH = ROOT / "data" / "organic" / "content-service-map.json"

ALLOWED_STATUSES = {
    "INDEXABLE",
    "RETAIN_NOINDEX",
    "CONSOLIDATE",
    "REDIRECT",
    "RETIRE",
}
ALLOWED_STAGES = {"INFORMATIONAL", "COMMERCIAL_INVESTIGATION", "TRANSACTIONAL"}
REQUIRED_OVERLAPS = {
    "aditivos",
    "atrasos-prorrogacao",
    "reequilibrio",
    "orcamento-bdi",
    "defesa-margem",
}
SKIP_DISCOVERY_PARTS = {
    ".git",
    ".netlify",
    ".pytest_cache",
    "_site",
    "data",
    "docs",
    "node_modules",
    "scripts",
    "seo",
    "tests",
    "work",
}


@dataclass(frozen=True)
class OwnershipFinding:
    reason: str
    path: str
    detail: str = ""
    severity: str = "error"


@dataclass
class OwnershipReport:
    ok: bool
    findings: list[OwnershipFinding] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "findings": [asdict(item) for item in self.findings],
            "stats": self.stats,
        }


def load_query_ownership_contract(
    root: Path | None = None,
) -> dict[str, Any]:
    base = root or ROOT
    path = base / CONTRACT_PATH.relative_to(ROOT)
    return json.loads(path.read_text(encoding="utf-8"))


def _route_for_file(root: Path, page: Path) -> str:
    rel = page.relative_to(root).as_posix()
    if rel == "index.html":
        return "/"
    return "/" + rel.removesuffix("index.html")


def _file_for_route(root: Path, route: str) -> Path:
    if route == "/":
        return root / "index.html"
    return root / route.strip("/") / "index.html"


def _robots(html: str) -> str:
    match = re.search(
        r'<meta[^>]+name=["\']robots["\'][^>]+content=["\']([^"\']+)',
        html,
        re.I,
    ) or re.search(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']robots["\']',
        html,
        re.I,
    )
    return (match.group(1) if match else "MISSING").lower()


def _canonical(html: str) -> str | None:
    match = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
        html,
        re.I,
    ) or re.search(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        re.I,
    )
    return match.group(1) if match else None


def discover_cluster_routes(
    root: Path | None = None,
    contract: dict[str, Any] | None = None,
) -> set[str]:
    """Discover the bounded cluster from paths plus the canonical service map."""
    base = root or ROOT
    doc = contract or load_query_ownership_contract(base)
    discovery = ((doc.get("inventory") or {}).get("discovery") or {})
    tokens = tuple(str(token).lower() for token in discovery.get("path_tokens") or [])
    routes = set(discovery.get("exact_paths") or [])

    for page in base.rglob("index.html"):
        rel = page.relative_to(base)
        if any(part in SKIP_DISCOVERY_PARTS for part in rel.parts):
            continue
        route = _route_for_file(base, page)
        if any(token in route.lower() for token in tokens):
            routes.add(route)

    registry_rel = discovery.get("service_map") or SERVICE_MAP_PATH.relative_to(ROOT).as_posix()
    registry_path = base / registry_rel
    if registry_path.exists():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        cluster_id = discovery.get("service_map_cluster_id")
        clusters = [item for item in registry.get("clusters") or [] if item.get("id") == cluster_id]
        if len(clusters) == 1 and clusters[0].get("service_path"):
            routes.add(clusters[0]["service_path"])
        for route, mapped_cluster in (registry.get("path_overrides") or {}).items():
            if mapped_cluster == cluster_id:
                routes.add(route)

    return routes


def _csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _url_path(value: str) -> str:
    parsed = urlparse(value)
    path = parsed.path or "/"
    return path if path.endswith("/") else path + "/"


def _number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value).replace("%", "").replace(",", ".").strip() or 0)


def _historical_page_rows(path: Path, cluster_routes: set[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in _csv_rows(path):
        route = _url_path(row.get("Páginas principais") or "")
        if route not in cluster_routes:
            continue
        rows.append(
            {
                "route": route,
                "clicks": int(_number(row.get("Cliques"))),
                "impressions": int(_number(row.get("Impressões"))),
                "position": _number(row.get("Posição")),
            }
        )
    return sorted(rows, key=lambda item: item["route"])


def _historical_device_rows(path: Path, cluster_routes: set[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in _csv_rows(path):
        route = _url_path(row.get("Página") or "")
        if route not in cluster_routes:
            continue
        rows.append(
            {
                "route": route,
                "country": "UNKNOWN_NOT_EXPORTED",
                "device": row.get("Dispositivo"),
                "clicks": int(_number(row.get("Cliques"))),
                "impressions": int(_number(row.get("Impressões"))),
                "position": _number(row.get("Posição")),
            }
        )
    return sorted(rows, key=lambda item: (item["route"], item["device"] or ""))


def _validate_baseline(
    root: Path,
    contract: dict[str, Any],
    cluster_routes: set[str],
    bad: Any,
) -> None:
    baseline = contract.get("gsc_baseline") or {}
    current = baseline.get("current_country_device") or {}
    source = current.get("source")
    if not source or not (root / source).is_file():
        bad("gsc_current_source_missing", str(source or "gsc_baseline"))
    else:
        payload = json.loads((root / source).read_text(encoding="utf-8"))
        dimensions = current.get("dimensions") or []
        if dimensions != ["date", "query_hash", "page", "country", "device"]:
            bad("gsc_country_device_dimensions_invalid", str(source), str(dimensions))
        rows = payload.get("queries") or []
        matched = [row for row in rows if _url_path(str(row.get("page") or "")) in cluster_routes]
        clicks = sum(_number(row.get("clicks")) for row in matched)
        impressions = sum(_number(row.get("impressions")) for row in matched)
        declared = current.get("returned_cluster_set") or {}
        expected = {
            "rows": len(matched),
            "clicks": int(clicks),
            "impressions": int(impressions),
        }
        observed = {key: declared.get(key) for key in expected}
        if observed != expected:
            bad("gsc_current_baseline_drift", str(source), f"declared={observed} actual={expected}")
        if current.get("missing_row_semantics") != "UNKNOWN_NOT_ZERO":
            bad("gsc_missing_row_semantics_unsafe", str(source))

    historical = baseline.get("historical_page_device") or {}
    pages_source = historical.get("pages_source")
    devices_source = historical.get("devices_source")
    if not pages_source or not (root / pages_source).is_file():
        bad("gsc_historical_pages_source_missing", str(pages_source or "gsc_baseline"))
    else:
        actual = _historical_page_rows(root / pages_source, cluster_routes)
        declared = sorted(historical.get("page_rows") or [], key=lambda item: item.get("route", ""))
        if declared != actual:
            bad("gsc_historical_page_baseline_drift", str(pages_source))
    if not devices_source or not (root / devices_source).is_file():
        bad("gsc_historical_devices_source_missing", str(devices_source or "gsc_baseline"))
    else:
        actual = _historical_device_rows(root / devices_source, cluster_routes)
        declared = sorted(
            historical.get("country_device_rows") or [],
            key=lambda item: (item.get("route", ""), item.get("device", "")),
        )
        if declared != actual:
            bad("gsc_historical_device_baseline_drift", str(devices_source))
    if historical.get("country_dimension") != "UNAVAILABLE_IN_HISTORICAL_EXPORT":
        bad("gsc_historical_country_honesty_missing", str(pages_source or "gsc_baseline"))


def validate_query_ownership(
    root: Path | None = None,
    contract: dict[str, Any] | None = None,
) -> OwnershipReport:
    """Validate contract shape, live route state, conflicts and evidence sources."""
    base = root or ROOT
    doc = contract or load_query_ownership_contract(base)
    findings: list[OwnershipFinding] = []

    def bad(reason: str, path: str, detail: str = "", severity: str = "error") -> None:
        findings.append(OwnershipFinding(reason, path, detail, severity))

    if doc.get("schema_version") != "semantic-query-ownership/v1":
        bad("schema_version_invalid", CONTRACT_PATH.relative_to(ROOT).as_posix())
    if doc.get("decision_state") != "EXECUTE_NOW" or doc.get("priority") != "P1":
        bad("market_capture_decision_invalid", CONTRACT_PATH.relative_to(ROOT).as_posix())
    if doc.get("public_surface") != "https://confenge.com.br":
        bad("public_surface_invalid", CONTRACT_PATH.relative_to(ROOT).as_posix())

    policy = doc.get("mutation_policy") or {}
    for key in ("automatic_robots", "automatic_canonical", "automatic_redirect"):
        if policy.get(key) is not False:
            bad("automatic_public_mutation_forbidden", key)
    protected = {int(item.get("issue", 0)): item for item in policy.get("protected_routes") or []}
    if 126 not in protected or 128 not in protected:
        bad("protected_window_missing", "mutation_policy.protected_routes", "issues #126 and #128 required")

    discovered = discover_cluster_routes(base, doc)
    route_rows = doc.get("routes") or []
    by_route: dict[str, dict[str, Any]] = {}
    for row in route_rows:
        route = row.get("path")
        if not isinstance(route, str) or not route.startswith("/") or not route.endswith("/"):
            bad("route_path_invalid", str(route))
            continue
        if route in by_route:
            bad("route_duplicate", route)
            continue
        by_route[route] = row

        status = row.get("status")
        if status not in ALLOWED_STATUSES:
            bad("route_status_invalid", route, str(status))
        page = _file_for_route(base, route)
        if not page.is_file():
            bad("classified_route_missing", route)
            continue
        html = page.read_text(encoding="utf-8", errors="replace")
        robots = _robots(html)
        if status == "INDEXABLE" and "noindex" in robots:
            bad("index_state_mismatch", route, f"status={status} robots={robots}")
        if status == "RETAIN_NOINDEX" and "noindex" not in robots:
            bad("index_state_mismatch", route, f"status={status} robots={robots}")
        expected_canonical = f"https://confenge.com.br{route}"
        if _canonical(html) != expected_canonical:
            bad("self_canonical_mismatch", route, f"expected={expected_canonical} actual={_canonical(html)}")

        bridge = row.get("semantic_bridge") or {}
        if bridge.get("destination") != doc.get("commercial_destination"):
            bad("semantic_bridge_destination_invalid", route)
        if status == "INDEXABLE" and route != doc.get("commercial_destination"):
            if bridge.get("mode") != "INFORMATIONAL_TO_SERVICE":
                bad("informational_bridge_missing", route)
        if status == "RETAIN_NOINDEX" and bridge.get("mode") != "SUPPORTING_TO_SERVICE":
            bad("supporting_bridge_missing", route)

        if status in {"CONSOLIDATE", "REDIRECT", "RETIRE"}:
            transition = row.get("manual_transition") or {}
            required = {"owner_issue", "decision_evidence", "rollback"}
            if status != "RETIRE":
                required.add("target_path")
            missing = sorted(key for key in required if not transition.get(key))
            if missing:
                bad("irreversible_transition_contract", route, f"missing={','.join(missing)}")

    for route in sorted(discovered - set(by_route)):
        bad("unclassified_existing_route", route)
    for route in sorted(set(by_route) - discovered):
        bad("classified_route_outside_inventory", route)

    intent_rows = doc.get("intents") or []
    by_intent: dict[str, dict[str, Any]] = {}
    role_owners: dict[str, list[str]] = {}
    for route, row in by_route.items():
        for assignment in row.get("intent_roles") or []:
            if assignment.get("role") == "OWNER":
                role_owners.setdefault(str(assignment.get("intent_id")), []).append(route)

    for intent in intent_rows:
        intent_id = intent.get("id")
        if not intent_id or intent_id in by_intent:
            bad("intent_id_invalid_or_duplicate", str(intent_id))
            continue
        by_intent[intent_id] = intent
        if intent.get("stage") not in ALLOWED_STAGES:
            bad("intent_stage_invalid", intent_id)
        if not intent.get("representative_queries") or not intent.get("negative_queries"):
            bad("intent_query_boundary_missing", intent_id)
        owner = intent.get("canonical_owner")
        if owner not in by_route:
            bad("intent_owner_missing_route", intent_id, str(owner))
            continue
        owners = role_owners.get(intent_id) or []
        if owners != [owner]:
            bad("intent_owner_not_exactly_one", intent_id, f"declared={owner} role_owners={owners}")
        if by_route[owner].get("status") != "INDEXABLE":
            bad("intent_owner_not_indexable", intent_id, str(owner))
        if intent.get("stage") == "INFORMATIONAL" and owner != doc.get("commercial_destination"):
            bridge = by_route[owner].get("semantic_bridge") or {}
            if bridge.get("mode") != "INFORMATIONAL_TO_SERVICE":
                bad("informational_intent_direct_to_commercial", intent_id, str(owner))

    for route, row in by_route.items():
        for assignment in row.get("intent_roles") or []:
            intent_id = assignment.get("intent_id")
            if intent_id not in by_intent:
                bad("route_references_unknown_intent", route, str(intent_id))
        if not row.get("intent_roles"):
            bad("route_without_intent_role", route)

    overlap_ids = {item.get("family") for item in doc.get("overlaps") or []}
    for missing in sorted(REQUIRED_OVERLAPS - overlap_ids):
        bad("required_overlap_missing", "overlaps", missing)
    for overlap in doc.get("overlaps") or []:
        if not overlap.get("owner_path") or not overlap.get("ownership_rule"):
            bad("overlap_rule_incomplete", str(overlap.get("family")))

    conflict_count = 0
    for conflict in doc.get("conflicts") or []:
        conflict_count += 1
        cid = str(conflict.get("id") or "conflict")
        intent_id = conflict.get("intent_id")
        intent = by_intent.get(intent_id) or {}
        if conflict.get("owner_path") != intent.get("canonical_owner"):
            bad("conflict_owner_mismatch", cid)
        competitors = conflict.get("competing_routes") or []
        if not competitors:
            bad("conflict_competitors_missing", cid)
        if conflict.get("state") == "UNRESOLVED":
            bad("query_conflict_unresolved", cid)
        elif conflict.get("state") == "CONTROLLED_BY_CURRENT_NOINDEX":
            for route in competitors:
                if (by_route.get(route) or {}).get("status") != "RETAIN_NOINDEX":
                    bad("controlled_conflict_competitor_indexable", cid, str(route))
            bad(
                "declared_query_conflict_controlled",
                cid,
                str(conflict.get("resolution") or ""),
                severity="warn",
            )
        else:
            bad("conflict_state_invalid", cid, str(conflict.get("state")))
        if not conflict.get("resolution") or not conflict.get("rollback"):
            bad("conflict_control_incomplete", cid)

    _validate_baseline(base, doc, discovered, bad)

    next_decision = doc.get("next_decision") or {}
    if not next_decision.get("owner") or not next_decision.get("not_before"):
        bad("next_decision_incomplete", "next_decision")
    if not (doc.get("kill_rule") or {}).get("trigger"):
        bad("kill_rule_missing", "kill_rule")

    errors = [item for item in findings if item.severity == "error"]
    return OwnershipReport(
        ok=not errors,
        findings=findings,
        stats={
            "contract": CONTRACT_PATH.relative_to(ROOT).as_posix(),
            "cluster": doc.get("cluster_id"),
            "discovered_routes": len(discovered),
            "classified_routes": len(by_route),
            "coverage": round(len(set(by_route) & discovered) / len(discovered), 4) if discovered else 0.0,
            "indexable": sum(1 for row in by_route.values() if row.get("status") == "INDEXABLE"),
            "retain_noindex": sum(
                1 for row in by_route.values() if row.get("status") == "RETAIN_NOINDEX"
            ),
            "intents": len(by_intent),
            "declared_conflicts": conflict_count,
            "overlaps": sorted(overlap_ids),
            "automatic_public_mutation": False,
            "errors": len(errors),
            "warnings": sum(1 for item in findings if item.severity == "warn"),
        },
    )
