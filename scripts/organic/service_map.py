"""Extensible content → service_fit mapping (testable, data-driven)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAP = ROOT / "data" / "organic" / "content-service-map.json"


def load_service_map(path: Path | str | None = None) -> dict[str, Any]:
    p = Path(path) if path else DEFAULT_MAP
    return json.loads(p.read_text(encoding="utf-8"))


def resolve_cluster(path: str, smap: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Map a site path to a cluster entry (service_fit)."""
    smap = smap or load_service_map()
    path_n = path if path.startswith("/") else f"/{path}"
    if not path_n.endswith("/") and "." not in path_n.rsplit("/", 1)[-1]:
        path_n = path_n + "/"
    overrides = smap.get("path_overrides") or {}
    cluster_id = overrides.get(path_n)
    clusters = {c["id"]: c for c in smap.get("clusters") or []}
    if cluster_id and cluster_id in clusters:
        return dict(clusters[cluster_id])
    blob = path_n.lower()
    best = None
    best_hits = 0
    for c in smap.get("clusters") or []:
        hits = sum(1 for t in c.get("tokens") or [] if t.lower() in blob)
        if hits > best_hits:
            best_hits = hits
            best = c
    return dict(best) if best and best_hits > 0 else None


def map_content_to_service(path: str, smap: dict[str, Any] | None = None) -> dict[str, Any]:
    smap = smap or load_service_map()
    cluster = resolve_cluster(path, smap)
    if not cluster:
        return {
            "path": path,
            "matched": False,
            "cluster_id": None,
            "service_path": None,
            "service_slug": None,
            "tools": [],
            "specialist": smap.get("default_specialist"),
        }
    return {
        "path": path,
        "matched": True,
        "cluster_id": cluster["id"],
        "service_path": cluster.get("service_path"),
        "service_slug": cluster.get("service_slug"),
        "tools": list(cluster.get("tools") or []),
        "specialist": smap.get("default_specialist"),
        "bridge_title": cluster.get("bridge_title"),
        "bridge_body": cluster.get("bridge_body"),
        "cta_label": cluster.get("cta_label"),
    }


def html_has_service_link(html: str, service_path: str) -> bool:
    if not service_path:
        return False
    # accept with/without trailing slash variants
    variants = {service_path, service_path.rstrip("/"), service_path.rstrip("/") + "/"}
    return any(v and v in html for v in variants)


def html_has_commercial_bridge(html: str) -> bool:
    return bool(
        re.search(
            r'data-commercial-bridge\s*=|class="[^"]*commercial-bridge|data-organic-bridge\s*=',
            html,
            re.I,
        )
    )


def audit_link_coverage(
    root: Path,
    *,
    content_glob: str = "conteudos/*/index.html",
    smap: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute content_to_service / bridge coverage on disk."""
    smap = smap or load_service_map()
    content_pages = list(root.glob(content_glob))
    mapped = 0
    linked = 0
    bridged = 0
    indexable_mapped = 0
    indexable_linked = 0
    indexable_bridged = 0
    details: list[dict[str, Any]] = []

    for page in content_pages:
        rel = "/" + str(page.parent.relative_to(root)).replace("\\", "/") + "/"
        html = page.read_text(encoding="utf-8", errors="replace")
        robots_noindex = bool(
            re.search(r'name=["\']robots["\'][^>]*noindex|content=["\'][^"\']*noindex', html, re.I)
        )
        fit = map_content_to_service(rel, smap)
        has_link = html_has_service_link(html, fit.get("service_path") or "")
        has_bridge = html_has_commercial_bridge(html)
        if fit["matched"]:
            mapped += 1
            if has_link:
                linked += 1
            if has_bridge:
                bridged += 1
            if not robots_noindex:
                indexable_mapped += 1
                if has_link:
                    indexable_linked += 1
                if has_bridge:
                    indexable_bridged += 1
        details.append(
            {
                "path": rel,
                "matched": fit["matched"],
                "service_path": fit.get("service_path"),
                "has_service_link": has_link,
                "has_commercial_bridge": has_bridge,
                "indexable": not robots_noindex,
            }
        )

    # service → supporting content
    services = {
        c["service_path"]: c for c in smap.get("clusters") or [] if c.get("service_path")
    }
    service_support: list[dict[str, Any]] = []
    support_ok = 0
    for spath, c in services.items():
        sp = root / spath.strip("/") / "index.html"
        if not sp.exists():
            service_support.append(
                {"service_path": spath, "exists": False, "has_supporting_content": False}
            )
            continue
        html = sp.read_text(encoding="utf-8", errors="replace")
        has_content = "/conteudos/" in html or "library-item" in html or "guias" in html.lower()
        if has_content:
            support_ok += 1
        service_support.append(
            {
                "service_path": spath,
                "exists": True,
                "has_supporting_content": has_content,
                "cluster_id": c["id"],
            }
        )

    n = max(mapped, 1)
    n_idx = max(indexable_mapped, 1)
    n_svc = max(len(services), 1)
    return {
        "schema_version": "link-coverage-v1",
        "content_pages_scanned": len(content_pages),
        "mapped": mapped,
        "content_to_service_link_coverage": round(linked / n, 4),
        "commercial_bridge_coverage": round(bridged / n, 4),
        "indexable_mapped": indexable_mapped,
        "indexable_content_to_service_link_coverage": round(indexable_linked / n_idx, 4),
        "indexable_commercial_bridge_coverage": round(indexable_bridged / n_idx, 4),
        "service_to_supporting_content_coverage": round(support_ok / n_svc, 4),
        "service_support": service_support,
        "sample": [d for d in details if d["matched"]][:20],
    }
