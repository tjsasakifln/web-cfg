from __future__ import annotations

import json
import time
from pathlib import Path

from scripts.site import build_css


def _fixture_root(tmp_path: Path) -> tuple[Path, Path]:
    root = tmp_path
    (root / "assets").mkdir()
    (root / "css").mkdir()
    (root / "css" / "module.css").write_text(".module { color: red; }\n", encoding="utf-8", newline="\n")
    (root / "css" / "manifest.json").write_text(
        json.dumps({"framework": None, "bundle": "styles.css", "modules": ["css/module.css"]}),
        encoding="utf-8",
        newline="\n",
    )
    return root, root / "assets" / "home-10x.css"


def test_home_check_preserves_stale_crlf_and_normal_build_is_idempotent(tmp_path: Path) -> None:
    root, home = _fixture_root(tmp_path)
    (root / "assets" / "editorial.css").write_bytes(b"/* Type roles --- */\r\nnew\r\n")
    original = b"head\r\n/* BEGIN editorial-route-sheet */\r\nold\r\n/* END editorial-route-sheet */tail\r\n"
    home.write_bytes(original)
    before = home.stat().st_mtime_ns

    assert build_css.sync_home_sheet(root, check=True) is True
    assert home.read_bytes() == original
    assert home.stat().st_mtime_ns == before

    assert build_css.sync_home_sheet(root) is True
    generated = home.read_bytes()
    assert b"\r" not in generated
    after = home.stat().st_mtime_ns
    time.sleep(0.01)
    assert build_css.sync_home_sheet(root) is False
    assert home.read_bytes() == generated
    assert home.stat().st_mtime_ns == after


def test_main_check_does_not_write_stale_home(tmp_path: Path, monkeypatch) -> None:
    root, home = _fixture_root(tmp_path)
    (root / "assets" / "editorial.css").write_text("/* Type roles --- */\nnew\n", encoding="utf-8", newline="\n")
    home.write_bytes(b"head\r\n/* BEGIN editorial-route-sheet */\r\nold\r\n/* END editorial-route-sheet */tail\r\n")
    styles = root / "styles.css"
    manifest_path = root / "css" / "manifest.json"
    monkeypatch.setattr(build_css, "ROOT", root)
    monkeypatch.setattr(build_css, "MANIFEST_PATH", manifest_path)
    monkeypatch.setattr(build_css, "STYLES", styles)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    blob = build_css.module_blob(manifest)
    styles.write_text(build_css.assemble("body {}\n", blob), encoding="utf-8", newline="\n")
    before = home.read_bytes(), home.stat().st_mtime_ns
    monkeypatch.setattr("sys.argv", ["build_css.py", "--check"])
    assert build_css.main() == 1
    assert (home.read_bytes(), home.stat().st_mtime_ns) == before
