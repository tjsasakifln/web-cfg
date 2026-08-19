"""ANÁLISE TÉCNICA ≠ CASO CONFENGE honesty gate (#74)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def _html_files(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return list(folder.rglob("index.html"))


def wears_caso_confenge(html: str) -> bool:
    lower = html.lower()
    if "caso confenge" not in lower:
        return False
    negated = (
        "não é caso" in lower
        or "nao e caso" in lower
        or "não e caso" in lower
        or "nao é caso" in lower
    )
    return not negated


def evaluate_analise_caso(root: Path | None = None) -> dict[str, Any]:
    root = root or ROOT
    fails: list[str] = []
    analises = _html_files(root / "analises-contratos-publicos")
    casos = _html_files(root / "casos")
    if not analises:
        fails.append("missing_analises_hub")
    for path in analises:
        html = path.read_text(encoding="utf-8")
        if wears_caso_confenge(html):
            fails.append(f"analise_wears_caso:{path.relative_to(root)}")
        if "smartlic.tech" in html.lower():
            fails.append(f"smartlic_on_analise:{path.relative_to(root)}")
    for path in casos:
        html = path.read_text(encoding="utf-8")
        if wears_caso_confenge(html) and "demonstrativo" not in html.lower():
            fails.append(f"caso_without_demonstrativo:{path.relative_to(root)}")
    return {
        "schema_version": "analise-caso-gate-v1",
        "ok": not fails,
        "fails": fails,
        "analise_pages": len(analises),
        "caso_pages": len(casos),
    }
