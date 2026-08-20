"""#66 VALIDATE: prepare-only syndication record points at a real CONFENGE page."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RECORD = ROOT / "data/distribution/syndication-canary.radar-nacional.v1.json"


def test_syndication_canary_reads_real_page_and_forbids_smartlic() -> None:
    data = json.loads(RECORD.read_text(encoding="utf-8"))
    assert data.get("auto_send") is False
    assert data.get("prepare_only") is True
    assert data.get("posted") is False
    assert data.get("live_post") is False
    asset = data["asset"]
    path = ROOT / asset["in_repo_path"]
    assert path.is_file(), f"target HTML missing: {path}"
    html = path.read_text(encoding="utf-8")
    url = asset["canonical_url"]
    assert url.startswith("https://confenge.com.br/")
    assert url.rstrip("/").endswith("radar/nacional-obras-publicas")
    assert "https://confenge.com.br/radar/nacional-obras-publicas/" in html
    blob = json.dumps(data) + html
    assert "smartlic" not in blob.lower()
    assert asset.get("brand") == "CONFENGE"
