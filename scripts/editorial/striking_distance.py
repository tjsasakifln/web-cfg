"""Human noindex gate for three striking-distance library URLs (#127).

Dimensional GSC demand never flips robots. approve_cli INDEXABLE is required.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DECISIONS_PATH = ROOT / "data" / "editorial" / "striking-distance-noindex.v1.json"
ALLOWED = frozenset({"REWRITE_THEN_INDEX", "KEEP_NOINDEX", "CONSOLIDATE"})
CANARY_CAP = 1


def load_decisions(path: Path | None = None) -> dict[str, Any]:
    data = json.loads((path or DECISIONS_PATH).read_text(encoding="utf-8"))
    if data.get("canary_cap") != CANARY_CAP:
        raise ValueError("canary_cap must be 1")
    return data


def html_robots(html: str) -> str:
    m = re.search(
        r'<meta[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']',
        html,
        re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").lower()


def is_noindex(html: str) -> bool:
    return "noindex" in html_robots(html)


def may_flip_index(row: dict[str, Any]) -> bool:
    """Only a rewritten REWRITE_THEN_INDEX URL with human INDEXABLE may leave noindex."""
    if row.get("decision") != "REWRITE_THEN_INDEX":
        return False
    if row.get("canary") is not True:
        return False
    if row.get("rewrite_complete") is not True:
        return False
    if row.get("approve_cli_indexable") is not True:
        return False
    return True


def evaluate_striking_distance(
    *, root: Path | None = None, data: dict[str, Any] | None = None
) -> dict[str, Any]:
    root = root or ROOT
    data = data or load_decisions()
    fails: list[str] = []
    rows = list(data.get("urls") or [])
    if len(rows) != 3:
        fails.append("expected_three_urls")
    canaries = [r for r in rows if r.get("canary") is True]
    if len(canaries) > CANARY_CAP:
        fails.append("canary_cap_exceeded")
    indexed_live = []
    for row in rows:
        decision = row.get("decision")
        if decision not in ALLOWED:
            fails.append(f"invalid_decision:{row.get('path')}")
        if not row.get("owner"):
            fails.append(f"missing_owner:{row.get('path')}")
        rel = row.get("html") or ""
        page = root / rel
        if not page.is_file():
            fails.append(f"missing_html:{rel}")
            continue
        html = page.read_text(encoding="utf-8")
        live_noindex = is_noindex(html)
        if not live_noindex:
            indexed_live.append(row.get("path"))
            if not may_flip_index(row):
                fails.append(f"unauthorized_index:{row.get('path')}")
        if row.get("decision") == "KEEP_NOINDEX" and not live_noindex:
            fails.append(f"keep_noindex_but_indexable:{row.get('path')}")
        if row.get("decision") == "REWRITE_THEN_INDEX" and not may_flip_index(row):
            if not live_noindex:
                fails.append(f"canary_indexed_before_approve:{row.get('path')}")
    if len(indexed_live) > CANARY_CAP:
        fails.append("more_than_one_indexed")
    return {
        "schema_version": "striking-distance-gate-v1",
        "ok": not fails,
        "fails": fails,
        "canary_count": len(canaries),
        "indexed_live": indexed_live,
        "decisions": {r.get("path"): r.get("decision") for r in rows},
    }
