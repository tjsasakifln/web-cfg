from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from scripts.pseo.build_site import ROOT, build_contract_analysis_family


def _stage_build_root(tmp_path: Path) -> Path:
    for relative in (
        "scripts/contract_analysis/fixtures/official-live-01",
        "data/editorial/contract-analysis",
    ):
        shutil.copytree(ROOT / relative, tmp_path / relative, dirs_exist_ok=True)
    for pattern in ("sitemap*.xml", "sitemap.txt", "robots.txt", "_headers"):
        for source in ROOT.glob(pattern):
            shutil.copy2(source, tmp_path / source.name)
    return tmp_path


def _tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def test_build_site_contract_analysis_stage_is_offline_exact_and_reproducible(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _stage_build_root(tmp_path)
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1788955200")

    result = build_contract_analysis_family(root)

    assert result["approved_route"] == (
        "/analises-contratos-publicos/"
        "reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/"
    )
    assert result["withdrawn_routes"] == 5
    assert result["public_pages"] == [
        "analises-contratos-publicos/index.html",
        "analises-contratos-publicos/"
        "reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/index.html",
    ]
    assert "sitemap-analises-contratos.xml" in (
        root / "sitemap-index.xml"
    ).read_text(encoding="utf-8")
    family_sitemap = (root / "sitemap-analises-contratos.xml").read_text(
        encoding="utf-8"
    )
    assert "https://confenge.com.br/analises-contratos-publicos/" in family_sitemap
    assert family_sitemap.count("<url>") == 2
    status = json.loads(
        (root / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json").read_text(
            encoding="utf-8"
        )
    )
    assert status["generated_at"] == "2026-09-09T12:00:00Z"
    assert status["index_count"] == 1
    assert status["review_packets"] == []
    assert not (root / "docs/editorial/contract-analysis/review").exists()

    first_hashes = _tree_hashes(root)
    second_result = build_contract_analysis_family(root)
    second_hashes = _tree_hashes(root)
    assert second_result == result
    assert second_hashes == first_hashes


def test_build_site_refuses_a_withdrawn_draft_even_if_a_stale_file_returns(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root = _stage_build_root(tmp_path)
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1788955200")
    stale = (
        root
        / "analises-contratos-publicos"
        / "aditivo-saldo-art125-item-novo"
        / "index.html"
    )
    stale.parent.mkdir(parents=True)
    stale.write_text("<html><body>rascunho exposto</body></html>", encoding="utf-8")

    with pytest.raises(RuntimeError, match="contract_analysis_withdrawn_route_rendered"):
        build_contract_analysis_family(root)
