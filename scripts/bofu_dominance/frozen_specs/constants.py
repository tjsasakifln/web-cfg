"""Frozen BOFU pillar constants. Exclusive-tree only; no HTML writes."""

from __future__ import annotations

from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "bofu-dominance" / "frozen-specs"
PATCH_DIR = DATA_DIR / "patches"
SPEC_DIR = DATA_DIR / "specs"
DOCS_DIR = ROOT / "docs" / "seo" / "bofu-dominance" / "frozen-specs"

EARLIEST_SAFE_ACTION_AT = date(2026, 9, 16)
CORRESPONDING_ISSUE = 128
CAMPAIGN = "CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01"
PATCH_FORMAT = "frozen_patch_v1"

PILLARS: tuple[dict[str, str], ...] = (
    {
        "slug": "aditivos-obras-publicas",
        "path": "/aditivos-obras-publicas/",
        "html_rel": "aditivos-obras-publicas/index.html",
        "family": "aditivos",
        "canonical_url": "https://confenge.com.br/aditivos-obras-publicas/",
    },
    {
        "slug": "medicoes-glosas-obras-publicas",
        "path": "/medicoes-glosas-obras-publicas/",
        "html_rel": "medicoes-glosas-obras-publicas/index.html",
        "family": "medicoes-pagamentos",
        "canonical_url": "https://confenge.com.br/medicoes-glosas-obras-publicas/",
    },
    {
        "slug": "reequilibrio-obras-publicas",
        "path": "/reequilibrio-obras-publicas/",
        "html_rel": "reequilibrio-obras-publicas/index.html",
        "family": "reequilibrio",
        "canonical_url": "https://confenge.com.br/reequilibrio-obras-publicas/",
    },
    {
        "slug": "auditoria-orcamento-licitacao",
        "path": "/auditoria-orcamento-licitacao/",
        "html_rel": "auditoria-orcamento-licitacao/index.html",
        "family": "orcamento-bdi",
        "canonical_url": "https://confenge.com.br/auditoria-orcamento-licitacao/",
    },
    {
        "slug": "diagnostico-b2g-360",
        "path": "/diagnostico-b2g-360/",
        "html_rel": "diagnostico-b2g-360/index.html",
        "family": "carteira-operacao",
        "canonical_url": "https://confenge.com.br/diagnostico-b2g-360/",
    },
    {
        "slug": "diagnostico-pre-licitacao",
        "path": "/diagnostico-pre-licitacao/",
        "html_rel": "diagnostico-pre-licitacao/index.html",
        "family": "edital-proposta",
        "canonical_url": "https://confenge.com.br/diagnostico-pre-licitacao/",
    },
)

PILLAR_SLUGS: tuple[str, ...] = tuple(p["slug"] for p in PILLARS)

FORBIDDEN_RELATIVE_PATHS: tuple[str, ...] = (
    "aditivos-obras-publicas/index.html",
    "medicoes-glosas-obras-publicas/index.html",
    "reequilibrio-obras-publicas/index.html",
    "auditoria-orcamento-licitacao/index.html",
    "diagnostico-b2g-360/index.html",
    "diagnostico-pre-licitacao/index.html",
    "script.js",
    "styles.css",
    "styles-tokens.css",
    "styles-tools.css",
    "robots.txt",
    "sitemap.xml",
    "sitemap.txt",
    "sitemap-index.xml",
    "_redirects",
    "data/organic/content-service-map.json",
    "js/modules/analytics.js",
)

REQUIRED_SPEC_FIELDS: tuple[str, ...] = (
    "slug",
    "path",
    "snapshot",
    "serp_census",
    "query_ownership",
    "negative_queries",
    "cannibalization",
    "before_after_blocks",
    "evidence_proof_needed",
    "gsc_precondition",
    "success_metrics",
    "kill_metrics",
    "revert_metrics",
    "earliest_safe_action_at",
    "corresponding_issue",
)

GSC_BASELINE_ISSUE_128: dict[str, dict[str, float | int | str]] = {
    "/aditivos-obras-publicas/": {
        "impressions": 12,
        "clicks": 0,
        "position": 49.25,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
    "/medicoes-glosas-obras-publicas/": {
        "impressions": 8,
        "clicks": 0,
        "position": 7.88,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
    "/reequilibrio-obras-publicas/": {
        "impressions": 4,
        "clicks": 0,
        "position": 7.75,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
    "/auditoria-orcamento-licitacao/": {
        "impressions": 3,
        "clicks": 0,
        "position": 9.0,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
    "/diagnostico-b2g-360/": {
        "impressions": 1,
        "clicks": 0,
        "position": 15.0,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
    "/diagnostico-pre-licitacao/": {
        "impressions": 1,
        "clicks": 0,
        "position": 18.0,
        "source": "seo/gsc-2026-08-09 + issue#128",
    },
}


def pillar_by_slug(slug: str) -> dict[str, str]:
    for item in PILLARS:
        if item["slug"] == slug:
            return item
    raise KeyError(slug)


def html_path(slug: str, root: Path | None = None) -> Path:
    return (root or ROOT) / pillar_by_slug(slug)["html_rel"]


def patch_path(slug: str) -> Path:
    return PATCH_DIR / f"{slug}.patch.txt"


def spec_path(slug: str) -> Path:
    return SPEC_DIR / f"{slug}.json"
