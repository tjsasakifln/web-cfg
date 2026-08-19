"""Drive the shipped striking-distance noindex gate (#127)."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.striking_distance import (
    DECISIONS_PATH,
    evaluate_striking_distance,
    is_noindex,
    load_decisions,
    may_flip_index,
)


def test_committed_decisions_keep_all_three_noindex():
    data = load_decisions()
    assert data["canary_cap"] == 1
    report = evaluate_striking_distance(data=data)
    assert report["ok"], report["fails"]
    assert report["indexed_live"] == []
    assert report["decisions"]["/conteudos/chuva-prorrogacao-prazo-obra-publica/"] == (
        "REWRITE_THEN_INDEX"
    )
    assert report["decisions"]["/conteudos/aditivo-qualitativo-quantitativo/"] == (
        "KEEP_NOINDEX"
    )
    assert report["decisions"][
        "/conteudos/prazo-vigencia-prazo-execucao-contrato-obra/"
    ] == "KEEP_NOINDEX"
    for row in data["urls"]:
        html = (ROOT / row["html"]).read_text(encoding="utf-8")
        assert is_noindex(html), row["path"]
        assert may_flip_index(row) is False


def test_robots_flip_without_approve_cli_fails_closed():
    data = load_decisions()
    chuva = ROOT / "conteudos/chuva-prorrogacao-prazo-obra-publica/index.html"
    original = chuva.read_text(encoding="utf-8")
    try:
        chuva.write_text(
            original.replace("noindex,follow", "index,follow", 1), encoding="utf-8"
        )
        report = evaluate_striking_distance(data=data)
        assert report["ok"] is False
        assert any("unauthorized_index" in f or "canary_indexed" in f for f in report["fails"])
    finally:
        chuva.write_text(original, encoding="utf-8")


def test_second_canary_exceeds_cap():
    data = copy.deepcopy(load_decisions())
    for row in data["urls"]:
        row["canary"] = True
    report = evaluate_striking_distance(data=data)
    assert report["ok"] is False
    assert "canary_cap_exceeded" in report["fails"]


def test_decisions_file_is_the_source():
    raw = json.loads(DECISIONS_PATH.read_text(encoding="utf-8"))
    assert raw["issue"] == 127
    assert len(raw["urls"]) == 3
