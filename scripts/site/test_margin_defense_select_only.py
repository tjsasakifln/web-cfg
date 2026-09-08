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
    # 2026-09-08: a asserção literal era `assert "UNKNOWN" in page`. Ela exigia
    # que um rótulo de estado interno em inglês permanecesse no texto público da
    # ferramenta -- o defeito que esta campanha corrige. A propriedade que ela
    # protegia (a página não esconde o que a fonte pública não publica) passa a
    # ser verificada pelo que o visitante lê: a seção de limites e as famílias
    # de evento que ficam a conferir.
    assert 'id="limites-unknown"' in page
    assert "a conferir" in page
    for familia in ("Aditivos", "reajuste", "medições", "pagamentos"):
        assert familia in page
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
