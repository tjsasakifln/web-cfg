"""Prepare-only paid-search canary (#87). Reads shipped JSON + landing HTML."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CANARY = ROOT / "data" / "distribution" / "paid-search-canary.v1.json"


def test_paid_search_canary_prepare_only_landing_exists():
    data = json.loads(CANARY.read_text(encoding="utf-8"))
    assert data["status"] == "PREPARE"
    assert data["mode"] == "prepare-only"
    assert data["spend_authorized"] is False
    assert data["spend"] is None
    assert data["outcomes"]["spend_brl"] == "UNKNOWN"
    assert data["canonical_host"] == "confenge.com.br"
    assert "smartlic.tech" not in data["canonical_url"].lower()
    assert "smartlic.tech" not in data["landing_path"].lower()
    assert "smartlic.tech" in [str(x).lower() for x in data.get("exclusions") or []]

    landing = str(data["landing_path"])
    assert landing.startswith("/")
    html_rel = data["html"]
    html_path = ROOT / html_rel
    assert html_path.is_file(), f"landing HTML missing: {html_rel}"
    html = html_path.read_text(encoding="utf-8")
    assert "confenge.com.br" in html
    assert "smartlic.tech" not in html.lower()
    canonical = re.search(
        r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',
        html,
        re.I,
    ) or re.search(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']canonical["\']',
        html,
        re.I,
    )
    assert canonical, "landing missing canonical"
    href = canonical.group(1)
    assert href.startswith("https://confenge.com.br/")
    assert landing.rstrip("/") in href
    assert data["canonical_url"] == href.rstrip("/") + "/" or data["canonical_url"] in href
