"""Drive shipped SELECT-only consume for the margin-defense vertical (#60)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.money_asset.select_only import evaluate_select_only


def test_money_asset_consumes_select_only_export_with_unknown():
    report = evaluate_select_only(ROOT)
    assert report["ok"], report["fails"]
    page = (ROOT / "ferramentas/diagnostico-defesa-margem/index.html").read_text(
        encoding="utf-8"
    )
    assert "CONFENGE" in page
    assert "UNKNOWN" in page
    assert "smartlic.tech" not in page.lower()


def test_write_sql_in_export_fails_closed(tmp_path):
    export = tmp_path / "data/extra-cli/public-read-margin-defense/1.0"
    export.mkdir(parents=True)
    (export / "evil.sql").write_text("INSERT INTO leads VALUES (1);", encoding="utf-8")
    page_dir = tmp_path / "ferramentas/diagnostico-defesa-margem"
    page_dir.mkdir(parents=True)
    src = ROOT / "ferramentas/diagnostico-defesa-margem/index.html"
    page_dir.joinpath("index.html").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    report = evaluate_select_only(tmp_path)
    assert report["ok"] is False
    assert any("write_sql" in f for f in report["fails"])
