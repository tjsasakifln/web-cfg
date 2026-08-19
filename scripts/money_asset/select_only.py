"""Fail-closed extra-cli consume for the margin-defense vertical (#60).

web-cfg may only consume versioned SELECT-only public-read contracts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "docs" / "contracts" / "public-read-margin-defense-v1.json"
EXPORT = ROOT / "data" / "extra-cli" / "public-read-margin-defense" / "1.0"
PAGE = ROOT / "ferramentas" / "diagnostico-defesa-margem" / "index.html"
FORBIDDEN_SQL = ("insert ", "update ", "delete ", "drop ", "create ", "alter ")
FORBIDDEN_CRAWL = ("crawler", "spider", "scrape_all", "parallel datalake")


def load_contract() -> dict[str, Any]:
    if CONTRACT.is_file():
        return json.loads(CONTRACT.read_text(encoding="utf-8"))
    # fallback: lineage next to the export
    lineage = EXPORT / "LINEAGE.json"
    if lineage.is_file():
        return json.loads(lineage.read_text(encoding="utf-8"))
    manifest = EXPORT / "manifest.json"
    return json.loads(manifest.read_text(encoding="utf-8")) if manifest.is_file() else {}


def evaluate_select_only(root: Path | None = None) -> dict[str, Any]:
    root = root or ROOT
    fails: list[str] = []
    export = root / "data" / "extra-cli" / "public-read-margin-defense" / "1.0"
    page = root / "ferramentas" / "diagnostico-defesa-margem" / "index.html"
    if not export.is_dir():
        fails.append("missing_export")
    if not page.is_file():
        fails.append("missing_money_asset_page")
    blob = ""
    for path in export.glob("*"):
        if path.is_file() and path.suffix.lower() in {".json", ".md", ".sql"}:
            blob += path.read_text(encoding="utf-8", errors="replace").lower() + "\n"
    for token in FORBIDDEN_SQL:
        if token in blob:
            fails.append(f"write_sql:{token.strip()}")
    for token in FORBIDDEN_CRAWL:
        if token in blob:
            fails.append(f"crawler:{token}")
    html = page.read_text(encoding="utf-8") if page.is_file() else ""
    if "smartlic.tech" in html.lower() or "smartlic" in html.lower() and "CONFENGE" not in html:
        if "smartlic" in html.lower():
            fails.append("smartlic_on_money_asset")
    if "CONFENGE" not in html:
        fails.append("missing_confenge_brand")
    if "UNKNOWN" not in html:
        fails.append("missing_unknown_honesty")
    return {
        "schema_version": "margin-defense-select-only-v1",
        "ok": not fails,
        "fails": fails,
        "export": str(export),
        "page": "/ferramentas/diagnostico-defesa-margem/",
    }
