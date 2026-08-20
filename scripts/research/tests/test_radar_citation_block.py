"""#65 VALIDATE: public radar surface keeps a visible citation/provenance block."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PAGE = ROOT / "radar/nacional-obras-publicas/index.html"


def test_radar_nacional_shows_title_as_of_method_unknown() -> None:
    html = PAGE.read_text(encoding="utf-8")
    assert PAGE.is_file()
    assert 'id="citacao-proveniencia"' in html
    assert "title:" in html
    assert "as_of" in html
    assert "method:" in html
    assert "UNKNOWN" in html
    assert "smartlic" not in html.lower()
    assert "https://confenge.com.br/radar/nacional-obras-publicas/" in html
