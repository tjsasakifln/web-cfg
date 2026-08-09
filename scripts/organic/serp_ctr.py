"""SERP Opportunity / CTR Gap layer — configurable, diagnostic, non-clickbait."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.organic.service_map import map_content_to_service

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ROOT / "data" / "organic" / "serp-ctr-config.json"

# Site-standard brand suffix "| CONFENGE" is NOT clickbait.
CLICKBAIT_PATTERNS = [
    re.compile(r"guia\s+completo\s+20\d{2}", re.I),
    re.compile(r"saiba\s+tudo", re.I),
    re.compile(r"tudo\s+sobre\s+.+\s+neste\s+guia", re.I),
    re.compile(r"imperdivel|imperdível|clique\s+aqui|voce\s+nao\s+vai\s+acreditar", re.I),
    re.compile(r"\b(clickbait|voce\s+precisa\s+ver|n[aã]o\s+vai\s+acreditar)\b", re.I),
]


def load_ctr_config(path: Path | str | None = None) -> dict[str, Any]:
    p = Path(path) if path else DEFAULT_CONFIG
    return json.loads(p.read_text(encoding="utf-8"))


def expected_ctr(position: float, config: dict[str, Any] | None = None) -> float:
    config = config or load_ctr_config()
    bands = config.get("expected_ctr_by_position_band") or []
    if position <= 0:
        return 0.0
    for band in bands:
        if position <= float(band["position_max"]):
            return float(band["expected_ctr"])
    return float(bands[-1]["expected_ctr"]) if bands else 0.01


def is_ctr_gap(
    *,
    impressions: float,
    clicks: float,
    position: float,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Decide if a URL is a SERP CTR opportunity under configured thresholds."""
    config = config or load_ctr_config()
    min_imp = float(config.get("min_impressions") or 10)
    max_pos = float(config.get("max_position_for_opportunity") or 12)
    min_pos = float(config.get("min_position_for_opportunity") or 1)
    ratio = float(config.get("ctr_gap_ratio") or 0.45)
    floor = float(config.get("absolute_ctr_floor") or 0.02)

    ctr = (clicks / impressions) if impressions else 0.0
    exp = expected_ctr(position, config)
    reasons: list[str] = []
    if impressions < min_imp:
        return {
            "is_opportunity": False,
            "ctr": ctr,
            "expected_ctr": exp,
            "gap": exp - ctr,
            "reasons": [f"impressions_below_min ({impressions}<{min_imp})"],
        }
    if position < min_pos or position > max_pos:
        return {
            "is_opportunity": False,
            "ctr": ctr,
            "expected_ctr": exp,
            "gap": exp - ctr,
            "reasons": [f"position_outside_band ({position} not in [{min_pos},{max_pos}])"],
        }
    gap = exp - ctr
    low_vs_expected = exp > 0 and ctr < exp * ratio
    low_absolute = ctr < floor and impressions >= min_imp
    if low_vs_expected:
        reasons.append(f"ctr_below_{ratio:.0%}_of_expected")
    if low_absolute:
        reasons.append("ctr_below_absolute_floor")
    # Priority paths always get diagnosis when they have min impressions + competitive pos
    return {
        "is_opportunity": bool(reasons),
        "ctr": round(ctr, 5),
        "expected_ctr": round(exp, 5),
        "gap": round(gap, 5),
        "reasons": reasons,
    }


def _extract(html: str, pattern: str, flags: int = re.I | re.S) -> str | None:
    m = re.search(pattern, html, flags)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip()


def diagnose_page_html(
    path: str,
    html: str | None,
    *,
    gsc: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    queries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Structured SERP diagnosis (12 dimensions from objective)."""
    config = config or load_ctr_config()
    gsc = gsc or {}
    title = _extract(html or "", r"<title>([^<]+)</title>") if html else None
    meta = None
    if html:
        meta = _extract(
            html,
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']',
        ) or _extract(
            html,
            r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']',
        )
    h1 = None
    if html:
        raw_h1 = _extract(html, r"<h1[^>]*>(.*?)</h1>")
        h1 = re.sub(r"<[^>]+>", "", raw_h1) if raw_h1 else None
    lead = None
    if html:
        lead = _extract(html, r'class=["\']content-lead["\'][^>]*>(.*?)</p>')
        if lead:
            lead = re.sub(r"<[^>]+>", "", lead)
    canonical = None
    if html:
        canonical = _extract(html, r'rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']') or _extract(
            html, r'href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']'
        )
    robots = None
    if html:
        robots = _extract(
            html, r'name=["\']robots["\'][^>]+content=["\']([^"\']+)["\']'
        ) or _extract(html, r'content=["\']([^"\']+)["\'][^>]+name=["\']robots["\']')
    has_jsonld = bool(html and "application/ld+json" in html)
    has_breadcrumb = bool(html and ("BreadcrumbList" in html or "breadcrumbs" in html))
    has_org = bool(html and '"Organization"' in html)
    site_name = _extract(html or "", r'property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']') if html else None
    if not site_name and html:
        site_name = _extract(html, r'content=["\']([^"\']+)["\'][^>]+property=["\']og:site_name["\']')

    fit = map_content_to_service(path)
    title_len = len(title or "")
    mobile_max = int(config.get("title_soft_max_chars_mobile") or 42)
    desktop_max = int(config.get("title_soft_max_chars_desktop") or 60)
    clickbait = [p.pattern for p in CLICKBAIT_PATTERNS if title and p.search(title)]

    # Intent from path tokens + GSC queries overlapping path
    intent = "informational"
    if any(x in path for x in ("/aditivos-", "/reequilibrio-", "/medicoes-", "/auditoria-", "/diagnostico-")):
        intent = "commercial"
    related_q = []
    slug = path.strip("/").split("/")[-1] if path else ""
    for q in queries or []:
        qt = (q.get("query") or "").lower()
        tokens = [t for t in re.split(r"[-_/]", slug) if len(t) > 3]
        if tokens and sum(1 for t in tokens if t in qt) >= max(1, len(tokens) // 3):
            related_q.append(q.get("query"))

    issues: list[str] = []
    if not title:
        issues.append("missing_title")
    if title_len > desktop_max:
        issues.append("title_long_desktop")
    if title_len > mobile_max:
        issues.append("title_long_mobile_truncation_risk")
    if not meta:
        issues.append("missing_meta_description")
    if meta and len(meta) > int(config.get("description_soft_max_chars") or 155):
        issues.append("meta_description_long")
    if not h1:
        issues.append("missing_h1")
    if title and h1 and title.split("|")[0].strip().lower() != h1.strip().lower():
        # soft signal only
        pass
    if robots and "noindex" in robots.lower():
        issues.append("robots_noindex")
    if not has_jsonld:
        issues.append("missing_jsonld")
    if not has_breadcrumb:
        issues.append("missing_breadcrumb_signal")
    if not canonical:
        issues.append("missing_canonical")
    if clickbait:
        issues.append("clickbait_title_pattern")

    # Recommended non-clickbait snippet: front-load differentiator
    recommended_title = None
    recommended_description = None
    if gsc.get("impressions", 0) >= float(config.get("min_impressions") or 10):
        if title and title_len > mobile_max:
            # Prefer keeping first clause before pipe/colon if long
            core = title.split("|")[0].strip()
            if len(core) > mobile_max and ":" in core:
                core = core.split(":", 1)[0].strip() + ":" + core.split(":", 1)[1][: max(0, mobile_max - 10)]
            recommended_title = core if len(core) <= desktop_max else core[: desktop_max - 1].rstrip() + "…"
        if meta and ("saiba" in meta.lower() or "neste guia" in meta.lower()):
            recommended_description = (
                "Problema concreto + critério técnico + o que documentar — sem genérico de SEO."
            )

    confidence = 0.35
    imp = float(gsc.get("impressions") or 0)
    if imp >= 50:
        confidence = 0.75
    elif imp >= 20:
        confidence = 0.55
    elif imp >= 10:
        confidence = 0.4
    if robots and "noindex" in robots.lower():
        confidence = min(confidence, 0.45)

    gap_info = is_ctr_gap(
        impressions=float(gsc.get("impressions") or 0),
        clicks=float(gsc.get("clicks") or 0),
        position=float(gsc.get("position") or 0),
        config=config,
    )

    return {
        "path": path,
        "query_intent": intent,
        "related_queries": related_q[:8],
        "intent_page_mismatch": intent == "commercial" and path.startswith("/conteudos/"),
        "title": title,
        "title_length": title_len,
        "meta_description": meta,
        "h1": h1,
        "above_the_fold_lead": (lead or "")[:280] if lead else None,
        "canonical": canonical,
        "robots": robots,
        "structured_data_present": has_jsonld,
        "breadcrumb_present": has_breadcrumb,
        "organization_schema_present": has_org,
        "site_name": site_name,
        "service_fit": fit,
        "alternate_landing_candidate": fit.get("service_path") if fit.get("matched") else None,
        "internal_cannibalization_note": (
            "Compare title/H1 with sibling /conteudos/ and service pillar for same cluster."
        ),
        "issues": issues,
        "clickbait_flags": clickbait,
        "recommended_title": recommended_title,
        "recommended_description": recommended_description,
        "gsc": gsc,
        "ctr_gap": gap_info,
        "confidence": confidence,
        "html_present": bool(html),
    }


def find_ctr_opportunities(
    pages: list[dict[str, Any]],
    *,
    root: Path | None = None,
    config: dict[str, Any] | None = None,
    queries: list[dict[str, Any]] | None = None,
    force_priority: bool = True,
) -> list[dict[str, Any]]:
    """Build SERP diagnosis list for CTR-gap + optional priority benchmarks.

    - Real gaps: ctr_gap.is_opportunity=True, kind='ctr_gap'
    - Priority paths with enough impressions but healthy CTR (when force_priority):
      kind='priority_benchmark' — for comparison only, NOT a CTR-gap action.
    """
    config = config or load_ctr_config()
    root = root or ROOT
    priority = set(config.get("priority_paths") or [])
    min_imp = float(config.get("min_impressions") or 10)
    out: list[dict[str, Any]] = []
    for p in pages:
        path = p.get("path") or p.get("url") or ""
        if path.startswith("http"):
            from scripts.organic.gsc_loader import normalize_path

            path = normalize_path(path)
        impressions = float(p.get("impressions") or 0)
        clicks = float(p.get("clicks") or 0)
        position = float(p.get("position") or 0)
        gap = is_ctr_gap(
            impressions=impressions,
            clicks=clicks,
            position=position,
            config=config,
        )
        is_priority = path in priority
        is_real_gap = bool(gap.get("is_opportunity"))
        is_priority_benchmark = bool(
            force_priority and is_priority and impressions >= min_imp and not is_real_gap
        )
        if not is_real_gap and not is_priority_benchmark:
            continue
        # load HTML if present
        rel = path.strip("/")
        html_path = root / rel / "index.html"
        if not html_path.exists() and rel.endswith(".html"):
            html_path = root / rel
        html = html_path.read_text(encoding="utf-8", errors="replace") if html_path.exists() else None
        diag = diagnose_page_html(
            path,
            html,
            gsc={
                "impressions": impressions,
                "clicks": clicks,
                "position": position,
                "ctr": p.get("ctr") if p.get("ctr") is not None else (clicks / impressions if impressions else 0.0),
                "url": p.get("url"),
            },
            config=config,
            queries=queries,
        )
        if is_real_gap:
            diag["kind"] = "ctr_gap"
            diag["ctr_gap"]["priority_force_include"] = False
        else:
            # Healthy-CTR priority page: keep diagnosis, do not claim CTR gap
            diag["kind"] = "priority_benchmark"
            diag["ctr_gap"]["priority_force_include"] = True
            diag["ctr_gap"]["is_opportunity"] = False
            diag["ctr_gap"]["reasons"] = list(diag["ctr_gap"].get("reasons") or []) + [
                "priority_path_benchmark_healthy_ctr"
            ]
        out.append(diag)
    # real gaps first (by gap*impressions), then benchmarks
    out.sort(
        key=lambda d: (
            0 if d.get("kind") == "ctr_gap" else 1,
            -(
                float((d.get("ctr_gap") or {}).get("gap") or 0)
                * float((d.get("gsc") or {}).get("impressions") or 0)
            ),
        )
    )
    return out


def real_ctr_gaps(diagnoses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter to diagnoses that are true CTR-gap opportunities."""
    return [
        d
        for d in diagnoses
        if d.get("kind") == "ctr_gap" or (d.get("ctr_gap") or {}).get("is_opportunity")
    ]
