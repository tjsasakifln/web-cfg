"""#84 VALIDATE: live Market Answer canary shows coverage/UNKNOWN/source, not empty-as-success."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "inteligencia/valor-tipico-contratos-pavimentacao/index.html"


def test_canary_html_shows_coverage_unknown_source_not_empty_success() -> None:
    html = PAGE.read_text(encoding="utf-8")
    assert PAGE.is_file()
    lower = html.lower()
    assert "coverage" in lower or "cobertura" in lower
    assert "unknown" in lower
    assert "source" in lower or "fonte" in lower
    assert 'id="ma-empty-not-success"' in html
    assert "não é sucesso" in lower or "nao e sucesso" in lower
    assert "n=0 nunca vira prova" in lower
    assert "smartlic" not in lower
    # Empty coverage must not be sold as a complete national answer.
    assert "não descreve o país inteiro" in lower or "nao descreve o pais inteiro" in lower
