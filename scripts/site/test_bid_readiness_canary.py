"""Prepare-only bid-readiness landing (#155). Reads shipped HTML + flag JSON."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANDING = ROOT / "piloto" / "prontidao-licitacao" / "index.html"
FLAG = ROOT / "data" / "conversion" / "bid-readiness-canary.v1.json"
SITEMAP_FILES = (
    ROOT / "sitemap.xml",
    ROOT / "sitemap-index.xml",
    ROOT / "sitemap.txt",
    ROOT / "sitemap-editorial.xml",
    ROOT / "sitemap-inteligencia.xml",
)


def test_bid_readiness_canary_prepare_only():
    data = json.loads(FLAG.read_text(encoding="utf-8"))
    assert data["enabled"] is False
    assert data["status"] == "PREPARE"
    assert data["upload_store"] is False
    assert data["document_upload"] is False
    assert data["in_sitemap"] is False
    assert LANDING.is_file()
    html = LANDING.read_text(encoding="utf-8")
    robots = re.search(
        r'<meta[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']|'
        r'<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']',
        html,
        re.I,
    )
    assert robots, "missing robots"
    robots_val = (robots.group(1) or robots.group(2) or "").lower()
    assert "noindex" in robots_val
    assert "smartlic" not in html.lower()
    assert "confenge.com.br" in html
    assert 'href="/bid-room-licitacoes-obras/"' in html
    assert 'href="/diagnostico-pre-licitacao/"' in html
    assert "FACT" in html
    assert "UNKNOWN" in html
    assert re.search(r"fict[ií]cia", html, re.I)
    assert re.search(r"revis[aã]o humana obrigat", html, re.I)
    assert 'type="file"' not in html.lower()
    assert 'data-flag-enabled="false"' in html
    for sm in SITEMAP_FILES:
        if not sm.is_file():
            continue
        text = sm.read_text(encoding="utf-8")
        assert "prontidao-licitacao" not in text
        assert "/piloto/prontidao" not in text


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("OK", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, exc)
    raise SystemExit(1 if failed else 0)
