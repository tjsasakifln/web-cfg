"""Human HOLD_NOINDEX gate for three striking-distance URLs (#127)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

GATE = ROOT / "data" / "editorial" / "indexation-human-gate.v1.json"


def _robots(html: str) -> str:
    m = re.search(
        r'<meta[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']',
        html,
        re.I,
    )
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").lower()


def test_indexation_human_gate_holds_three_noindex_paths():
    data = json.loads(GATE.read_text(encoding="utf-8"))
    rows = data.get("urls") or []
    assert len(rows) == 3, rows
    for row in rows:
        assert row.get("decision") == "HOLD_NOINDEX", row
        assert row.get("reason")
        rel = row.get("html")
        path = ROOT / rel
        assert path.is_file(), f"missing {rel}"
        html = path.read_text(encoding="utf-8")
        robots = _robots(html)
        assert "noindex" in robots, f"{row['path']} is indexable: {robots!r}"
        assert "smartlic.tech" not in html.lower()
        assert "confenge.com.br" in html
        assert row["path"].startswith("/conteudos/")
