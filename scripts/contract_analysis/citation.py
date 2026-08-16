"""Feed the existing #66 prepare-only OS. auto_send stays false."""

from __future__ import annotations

from typing import Any

from scripts.contract_analysis import ASSET_FAMILY, FAMILY_PATH, GATE_VERSION
from scripts.distribution.prepare import prepare

SITE = "https://confenge.com.br"


def citation_registry(record: dict[str, Any], *, indexable: bool) -> dict[str, Any]:
    slug = str(record.get("slug") or record.get("id") or "")
    path = f"{FAMILY_PATH}{slug}/" if slug else FAMILY_PATH
    url = f"{SITE}{path}"
    as_of = str(record.get("as_of") or "")[:10]
    title = str(record.get("title") or record.get("reason_summary") or slug)
    author = record.get("author") if isinstance(record.get("author"), dict) else {"name": record.get("author")}
    reviewer = record.get("reviewer") if isinstance(record.get("reviewer"), dict) else {"name": record.get("reviewer")}
    author_name = str((author or {}).get("name") or "Engº Tiago Sasaki")
    reviewer_name = str((reviewer or {}).get("name") or "")
    limitations = str(record.get("limitations") or "")
    methodology = str(record.get("methodology") or GATE_VERSION)
    citation_text = (
        f"CONFENGE. {title}. Análise técnica de contrato público. "
        f"as_of {as_of or 'n/d'}. {url}"
    )
    fixture = bool(record.get("is_fixture") or record.get("catalog_mode") == "fixture")
    return {
        "schema": "earned_distribution_v1",
        "version": 1,
        "auto_send": False,
        "human_send_only": True,
        "fixture": fixture,
        "asset": {
            "id": f"{ASSET_FAMILY}:{slug}",
            "asset_type": "contract_analysis",
            "name": title,
            "canonical_url": url,
            "indexable": bool(indexable) and not fixture,
            "do_not_index": (not indexable) or fixture,
            "needs_data": record.get("publication_readiness") != "DATA_READY",
            "press_allowed": bool(indexable) and not fixture,
            "verdict": "PUBLISHED_OPEN_METHODOLOGY" if indexable and not fixture else "DO_NOT_DISTRIBUTE",
            "owner": str(record.get("maintenance_owner") or author_name),
            "source": "extra-cli public-read-contract-analysis/1.0 + editorial overlay",
            "date": as_of or "2026-08-16",
            "as_of": as_of,
            "utility": {
                "distinct_user_utility": bool(indexable) and not fixture,
                "utility_note": str(record.get("utility_beyond_source") or "preview / não indexável"),
                "invented_national_contract_stats": False,
            },
            "citation_primitives": {
                "stable_citation_link": {"status": "present", "url": url},
                "quotable_stat": {
                    "status": "present" if record.get("insight_singular") else "missing",
                    "text": str(record.get("insight_singular") or ""),
                    "as_of": as_of,
                },
                "chart_card_metadata": {
                    "status": "no_real_chart",
                    "note": "Canário sem gráfico raster próprio.",
                },
                "source_method_block": {
                    "status": "present",
                    "text": methodology,
                    "url": url,
                },
                "safe_download": {"status": "absent", "pii": False},
            },
            "citation_pack": {
                "canonical_url": url,
                "permanent_url": url,
                "title": title,
                "author": author_name,
                "reviewer": reviewer_name,
                "date": as_of,
                "as_of": as_of,
                "methodology_version": GATE_VERSION,
                "evidence_pack_version": record.get("evidence_pack_version"),
                "citation_text": citation_text,
                "source_notes": str(record.get("reason_summary") or ""),
                "limitations": limitations,
                "chart_figure": {"status": "no_real_chart"},
                "alt_text": title,
                "caption": title,
                "stable_asset_id": f"{ASSET_FAMILY}:{slug}",
            },
        },
        "targets": [],
    }


def prepare_citation(record: dict[str, Any], *, indexable: bool) -> dict[str, Any]:
    """Drive the shipped #66 prepare() entry. Never sends."""
    registry = citation_registry(record, indexable=indexable)
    report = prepare(registry)
    report["auto_send"] = False
    report["registry_auto_send"] = registry["auto_send"]
    return report
