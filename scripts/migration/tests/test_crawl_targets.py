"""Drive the shipped crawler against ready CONFENGE targets on disk."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/migration"))

from crawl_targets import crawl  # noqa: E402


def test_ready_targets_exist_and_are_confenge_only():
    report = crawl()
    assert report["ok"], report["failures"]
    ready = [r for r in report["rows"] if r["decision"] == "REDIRECT"]
    assert ready
    for row in ready:
        assert row["status"] == 200
        assert row["canonical"].startswith("https://confenge.com.br/")
        assert row["has_confenge_brand"]
        assert not row["has_smartlic_brand"]
        robots = (row.get("robots") or "").lower()
        assert "noindex" not in robots
