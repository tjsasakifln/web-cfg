"""Syndication canary (#89): record + live Data Desk public HTML."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CANARY = ROOT / "data" / "data-desk" / "syndication-canary.v1.json"


def test_syndication_canary_points_at_live_data_desk_page():
    data = json.loads(CANARY.read_text(encoding="utf-8"))
    assert data["status"] == "PREPARED_NOT_SENT"
    assert data["auto_send"] is False
    assert data["sent"] is False
    assert data["canonical_host"] == "confenge.com.br"
    html_path = ROOT / data["html"]
    assert html_path.is_file(), data["html"]
    html = html_path.read_text(encoding="utf-8")
    assert "confenge.com.br" in html
    assert "smartlic.tech" not in html.lower()
    assert re.search(r"as_of", html, re.I), "live page missing as_of"
    assert re.search(r"fonte|source", html, re.I), "live page missing source"
    assert re.search(r"limita", html, re.I), "live page missing limit/limitations"
    canonical = re.search(
        r'<link[^>]+href=["\'](https://confenge\.com\.br/[^"\']+)["\'][^>]*rel=["\']canonical["\']|'
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](https://confenge\.com\.br/[^"\']+)["\']',
        html,
        re.I,
    )
    assert canonical, "live page missing confenge canonical"
    href = canonical.group(1) or canonical.group(2)
    assert data["public_page"].rstrip("/") in href
    assert data["canonical_url"].startswith("https://confenge.com.br/")
