"""publish() must withdraw packaged fixture pages when official input is absent."""

from __future__ import annotations

import shutil
from pathlib import Path

from scripts.live_intelligence import publish as P
from scripts.live_intelligence.test_consume import _write_539_candidate


def test_publish_withdraws_fixture_pages_when_official_absent(
    tmp_path: Path, monkeypatch
) -> None:
    pages = tmp_path / "oportunidades" / "pe-2026-000188-reforma-ubs-londrina-pr"
    pages.mkdir(parents=True)
    (pages / "index.html").write_text("<html>fixture</html>\n", encoding="utf-8")
    monkeypatch.setenv("CONFENGE_LI_OFFICIAL_DIR", str(tmp_path / "missing-official"))
    skipped = P.publish(root=tmp_path, public_root=tmp_path, mutate_discovery=False)
    assert skipped["reason"] == "official_input_absent"
    assert skipped["withdrawn"] == 0
    assert (pages / "index.html").is_file()
    result = P.publish(
        root=tmp_path,
        public_root=tmp_path,
        mutate_discovery=False,
        withdraw_if_absent=True,
    )
    assert result["ok"] is True
    assert result["skipped"] is True
    assert result["reason"] == "official_input_absent"
    assert result["withdrawn"] >= 1
    assert not (pages / "index.html").exists()


def test_publish_prunes_fixture_and_writes_index_when_official_present(
    tmp_path: Path, monkeypatch
) -> None:
    fixture = tmp_path / "oportunidades" / "pe-2026-000188-reforma-ubs-londrina-pr"
    fixture.mkdir(parents=True)
    (fixture / "index.html").write_text("<html>fixture</html>\n", encoding="utf-8")
    export = _write_539_candidate(tmp_path / "official-src", catalog_mode="official_live")
    monkeypatch.setenv("CONFENGE_LI_OFFICIAL_DIR", str(export))
    result = P.publish(root=tmp_path, public_root=tmp_path, mutate_discovery=False)
    assert result["ok"] is True
    assert result["skipped"] is False
    assert result["reason"] == "official_live_published"
    assert not (fixture / "index.html").exists()
    index_page = tmp_path / "oportunidades" / "12345678000190-1" / "2026" / "index.html"
    assert index_page.is_file()
    html = index_page.read_text(encoding="utf-8")
    assert "index,follow" in html
    assert "UNKNOWN" not in html
    shutil.rmtree(tmp_path / "data", ignore_errors=True)
