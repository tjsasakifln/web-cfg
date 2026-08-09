"""Extensible content → service_fit mapping (testable, data-driven).

Canonical registry: data/organic/content-service-map.json
Resolution order:
  1. path_overrides (explicit, high confidence)
  2. unique token-hit winner (fallback, medium confidence)
  3. tie / multi-cluster equal top score → unmatched (never JSON order)
"""

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


def normalize_path(path: str) -> str:
    """Normalize site path for override lookup."""
    path_n = path if path.startswith("/") else f"/{path}"
    if not path_n.endswith("/") and "." not in path_n.rsplit("/", 1)[-1]:
        path_n = path_n + "/"
    return path_n


def score_clusters(path: str, smap: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """Return per-cluster token hit details for a path (audit / ambiguity checks)."""
    smap = smap or load_service_map()
    blob = normalize_path(path).lower()
    scores: dict[str, dict[str, Any]] = {}
    for c in smap.get("clusters") or []:
        hits = [t for t in (c.get("tokens") or []) if t.lower() in blob]
        if hits:
            scores[c["id"]] = {
                "cluster_id": c["id"],
                "hits": hits,
                "hit_count": len(hits),
                "service_path": c.get("service_path"),
            }
    return scores


def resolve_cluster_result(
    path: str, smap: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Resolve path → cluster with explicit match metadata.

    Returns:
      {
        cluster: dict | None,
        match_source: "override" | "tokens" | None,
        confidence: "high" | "medium" | "low" | "none",
        ambiguous: bool,
        token_scores: dict,
        path: str,
      }
    """
    smap = smap or load_service_map()
    path_n = normalize_path(path)
    overrides = smap.get("path_overrides") or {}
    clusters = {c["id"]: c for c in smap.get("clusters") or []}
    token_scores = score_clusters(path_n, smap)

    cluster_id = overrides.get(path_n)
    if cluster_id and cluster_id in clusters:
        return {
            "cluster": dict(clusters[cluster_id]),
            "match_source": "override",
            "confidence": "high",
            "ambiguous": False,
            "token_scores": token_scores,
            "path": path_n,
        }
    if cluster_id and cluster_id not in clusters:
        # Broken override — do not fall through silently to tokens for known paths
        return {
            "cluster": None,
            "match_source": None,
            "confidence": "none",
            "ambiguous": False,
            "token_scores": token_scores,
            "path": path_n,
            "error": f"unknown_override_cluster:{cluster_id}",
        }

    if not token_scores:
        return {
            "cluster": None,
            "match_source": None,
            "confidence": "none",
            "ambiguous": False,
            "token_scores": {},
            "path": path_n,
        }

    max_hits = max(s["hit_count"] for s in token_scores.values())
    leaders = [cid for cid, s in token_scores.items() if s["hit_count"] == max_hits]
    if len(leaders) > 1:
        # Tie: never pick by JSON cluster order
        return {
            "cluster": None,
            "match_source": None,
            "confidence": "none",
            "ambiguous": True,
            "token_scores": token_scores,
            "path": path_n,
            "tied_clusters": leaders,
        }

    winner_id = leaders[0]
    multi = len(token_scores) > 1
    return {
        "cluster": dict(clusters[winner_id]),
        "match_source": "tokens",
        "confidence": "low" if multi else "medium",
        "ambiguous": False,
        "token_scores": token_scores,
        "path": path_n,
    }


def resolve_cluster(path: str, smap: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Map a site path to a cluster entry (service_fit). Back-compat wrapper."""
    result = resolve_cluster_result(path, smap)
    return result.get("cluster")


def map_content_to_service(path: str, smap: dict[str, Any] | None = None) -> dict[str, Any]:
    smap = smap or load_service_map()
    result = resolve_cluster_result(path, smap)
    cluster = result.get("cluster")
    base = {
        "path": result.get("path") or path,
        "match_source": result.get("match_source"),
        "confidence": result.get("confidence") or "none",
        "ambiguous": bool(result.get("ambiguous")),
        "token_scores": result.get("token_scores") or {},
        "tied_clusters": result.get("tied_clusters") or [],
    }
    if not cluster:
        return {
            **base,
            "matched": False,
            "cluster_id": None,
            "service_path": None,
            "service_slug": None,
            "tools": [],
            "specialist": smap.get("default_specialist"),
        }
    return {
        **base,
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


def extract_principal_aside_service(html: str, known_services: set[str] | None = None) -> str | None:
    """Principal commercial service linked from article-aside (if any)."""
    if not html:
        return None
    aside = re.search(
        r'<aside[^>]*class=["\'][^"\']*article-aside[^"\']*["\'][^>]*>.*?</aside>',
        html,
        flags=re.I | re.S,
    )
    if not aside:
        return None
    block = aside.group(0)
    services = known_services or set()
    if not services:
        # discover from default map
        smap = load_service_map()
        services = {
            (c.get("service_path") or "").rstrip("/") + "/"
            for c in smap.get("clusters") or []
            if c.get("service_path")
        }
    for href in re.findall(r'href=["\']([^"\']+)["\']', block):
        base = href.split("?")[0].split("#")[0]
        if not base.endswith("/"):
            base = base + "/"
        if base in services:
            return base
    return None


def extract_related_section_service(html: str, known_services: set[str] | None = None) -> str | None:
    """Principal cluster service from related-section 'Ver todos em …' link."""
    if not html:
        return None
    section = re.search(
        r'class=["\'][^"\']*related-section[^"\']*["\'][^>]*>.*?</section>',
        html,
        flags=re.I | re.S,
    )
    if not section:
        return None
    block = section.group(0)
    smap = load_service_map()
    services = known_services or {
        (c.get("service_path") or "").rstrip("/") + "/"
        for c in smap.get("clusters") or []
        if c.get("service_path")
    }
    # Prefer explicit "Ver todos" text-link
    for m in re.finditer(r'href=["\']([^"\']+)["\'][^>]*>\s*Ver todos', block, re.I):
        base = m.group(1).split("?")[0].split("#")[0]
        if not base.endswith("/"):
            base = base + "/"
        if base in services:
            return base
    for href in re.findall(r'href=["\']([^"\']+)["\']', block):
        base = href.split("?")[0].split("#")[0]
        if not base.endswith("/"):
            base = base + "/"
        if base in services:
            return base
    return None


def extract_bridge_service(html: str) -> str | None:
    """Service destination of commercial bridge CTA (origem query stripped)."""
    if not html:
        return None
    bridge = re.search(
        r'<aside[^>]*commercial-bridge[^>]*>.*?</aside>',
        html,
        flags=re.I | re.S,
    )
    if not bridge:
        return None
    m = re.search(
        r'data-cta-position=["\']organic_bridge["\'][^>]*href=["\']([^"\']+)["\']'
        r'|href=["\']([^"\']+)["\'][^>]*data-cta-position=["\']organic_bridge["\']',
        bridge.group(0),
        re.I,
    )
    if not m:
        m = re.search(r'href=["\']([^"\']+)["\']', bridge.group(0))
        href = m.group(1) if m else None
    else:
        href = m.group(1) or m.group(2)
    if not href:
        return None
    base = href.split("?")[0].split("#")[0]
    if not base.endswith("/"):
        base = base + "/"
    return base


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
                "match_source": fit.get("match_source"),
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
