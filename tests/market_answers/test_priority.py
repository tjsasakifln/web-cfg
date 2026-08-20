"""#63 VALIDATE: versioned priority ranking lists the live canary first."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRIORITY = ROOT / "data/editorial/market-answers/priority.v1.json"


def test_priority_ranking_lists_live_canary_first_and_on_disk() -> None:
    data = json.loads(PRIORITY.read_text(encoding="utf-8"))
    ranked = data.get("ranked") or []
    assert ranked, "priority ranking is empty"
    first = ranked[0]
    assert first.get("rank") == 1
    assert first.get("role") == "live_canary"
    path = ROOT / first["path"]
    assert path.is_file(), f"canary HTML missing: {path}"
    html = path.read_text(encoding="utf-8")
    assert "pavimentação" in html.lower() or "pavimentacao" in html.lower()
    assert "confenge.com.br" in html
    assert "smartlic" not in html.lower()
    assert first["canonical_url"].startswith("https://confenge.com.br/")
    assert first["canonical_url"].rstrip("/").endswith(
        "inteligencia/valor-tipico-contratos-pavimentacao"
    )
