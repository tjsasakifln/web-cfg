"""#83 VALIDATE: shipped canary HTML keeps FACT/UNKNOWN/limitation and forbids legal-conclusion verbs."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CANARY = (
    ROOT
    / "analises-contratos-publicos"
    / "reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026"
    / "index.html"
)
FORBIDDEN_VERBS = (
    "garantimos êxito",
    "garantimos exito",
    "asseguramos êxito",
    "ganhar o caso",
)


def test_canary_html_has_fact_unknown_limitation_and_no_legal_conclusion() -> None:
    html = CANARY.read_text(encoding="utf-8")
    assert CANARY.is_file()
    assert "FACT" in html
    assert "UNKNOWN" in html
    lower = html.lower()
    assert "limitation" in lower or "limitação" in lower or "limitações" in lower
    assert 'id="ca-editorial-gate"' in html
    for phrase in FORBIDDEN_VERBS:
        assert phrase not in lower, f"legal-conclusion verb leaked: {phrase}"
    assert "smartlic" not in lower
    assert "não é um caso confenge" in lower or "nao e um caso confenge" in lower
