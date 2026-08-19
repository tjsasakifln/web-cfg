"""Drive the shipped ANÁLISE ≠ CASO gate against live pages (#74)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.analise_caso import evaluate_analise_caso, wears_caso_confenge


def test_live_analises_are_not_caso_confenge():
    report = evaluate_analise_caso(ROOT)
    assert report["ok"], report["fails"]
    assert report["analise_pages"] >= 1
    hub = (ROOT / "analises-contratos-publicos" / "index.html").read_text(encoding="utf-8")
    assert wears_caso_confenge(hub) is False


def test_caso_badge_without_negation_fails_closed(tmp_path):
    dest = tmp_path / "analises-contratos-publicos"
    dest.mkdir(parents=True)
    (dest / "index.html").write_text(
        "<html><h1>CASO CONFENGE</h1></html>", encoding="utf-8"
    )
    (tmp_path / "casos").mkdir()
    report = evaluate_analise_caso(tmp_path)
    assert report["ok"] is False
    assert any("analise_wears_caso" in f for f in report["fails"])
    assert wears_caso_confenge("<h1>CASO CONFENGE</h1>") is True
    assert wears_caso_confenge("<p>NÃO É CASO CONFENGE</p>") is False
