"""Inspect eligible landings that actually exist on this branch."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scripts.paid_search.schema import LANDING_60, LANDING_84

ROOT = Path(__file__).resolve().parents[2]


def _robots_directive(html: str) -> str:
    match = re.search(
        r'<meta\s+name=["\']robots["\']\s+content=["\']([^"\']+)["\']',
        html,
        re.I,
    )
    if match:
        return match.group(1).strip().lower()
    return ""


def inspect_landing(spec: dict[str, Any], root: Path | str | None = None) -> dict[str, Any]:
    base = Path(root) if root else ROOT
    html_path = base / spec["html"]
    exists = html_path.is_file()
    html = html_path.read_text(encoding="utf-8") if exists else ""
    robots = _robots_directive(html) if exists else ""
    noindex = "noindex" in robots or (exists and re.search(r"noindex", html, re.I) is not None and "index,follow" not in robots)
    if robots:
        noindex = "noindex" in robots
    sitemap = (base / "sitemap.xml").read_text(encoding="utf-8") if (base / "sitemap.xml").is_file() else ""
    in_sitemap = spec["canonical"] in sitemap or spec["path"] in sitemap
    return {
        "id": spec["id"],
        "issue": spec["issue"],
        "kind": spec["kind"],
        "path": spec["path"],
        "canonical": spec["canonical"],
        "html_path": spec["html"],
        "exists": exists,
        "robots": robots,
        "noindex": bool(noindex),
        "indexable": bool(exists and not noindex and "index" in (robots or "index")),
        "in_sitemap": bool(in_sitemap),
        "asset_id": spec.get("asset_id"),
        "route_family": spec.get("route_family"),
        "cta_id": spec.get("cta_id"),
        "jornada": spec.get("jornada"),
    }


def inspect_known_landings(root: Path | str | None = None) -> dict[str, dict[str, Any]]:
    return {
        LANDING_60["id"]: inspect_landing(LANDING_60, root),
        LANDING_84["id"]: inspect_landing(LANDING_84, root),
    }


def choose_landing_for_family(
    family_id: str,
    landing_id: str | None,
    landings: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """#84 is eligible only if the page exists and the package is honest about noindex.

    Paid traffic to a missing or unlabeled noindex fixture is rejected.
    The unpaid-eligible #60 utility is the honest landing on origin/main.
    """
    utility = landings[LANDING_60["id"]]
    answer = landings[LANDING_84["id"]]

    if family_id == "market_answer_pavimentacao":
        if not answer["exists"]:
            return {
                **answer,
                "eligible": False,
                "wrong_landing": True,
                "honesty": (
                    "#84 market-answer landing is absent on this branch "
                    "(PR #94 only, noindex fixture / UNKNOWN demand). "
                    "Paying to it is not eligible."
                ),
            }
        if answer["noindex"]:
            return {
                **answer,
                "eligible": False,
                "wrong_landing": True,
                "honesty": (
                    "#84 landing exists as noindex/fixture. Package refuses unpaid "
                    "eligibility. Use #60 utility instead of paying to a noindex page."
                ),
            }

    if landing_id and landing_id in landings:
        chosen = landings[landing_id]
    else:
        chosen = utility if utility["exists"] else answer

    if chosen["id"] == LANDING_84["id"]:
        return {
            **chosen,
            "eligible": False,
            "wrong_landing": True,
            "honesty": "Refusing #84 as paid landing unless official_live + indexable.",
        }

    if not chosen["exists"]:
        return {
            **chosen,
            "eligible": False,
            "wrong_landing": True,
            "honesty": "Landing HTML is not on this branch.",
        }

    if chosen["noindex"]:
        return {
            **chosen,
            "eligible": False,
            "wrong_landing": True,
            "honesty": "Landing is noindex; unpaid-eligible #60 utility is required.",
        }

    if family_id in {"sinapi_desonerado", "bdi", "legacy_avcb", "brand"}:
        return {
            **chosen,
            "eligible": False,
            "wrong_landing": True,
            "honesty": (
                f"Family {family_id} is not a contract-event the #60 diagnostic answers. "
                "Wrong landing for Diagnóstico de Defesa de Margem."
            ),
        }

    return {
        **chosen,
        "eligible": True,
        "wrong_landing": False,
        "honesty": (
            "Unpaid-eligible #60 utility on origin/main: indexable Diagnóstico de "
            "Defesa de Margem. #84 paving-ticket answer is not on this branch."
        ),
    }
