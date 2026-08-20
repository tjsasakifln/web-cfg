"""Drive the shipped CLI/write path, not a reimplementation."""

from __future__ import annotations

import json

from scripts.bofu_dominance.core.__main__ import main
from scripts.bofu_dominance.core.hashing import sha256_json
from tests.bofu_dominance.core.helpers import ROOT, build_status, write_artifacts


def test_write_artifacts_roundtrip(tmp_path):
    status = build_status()
    paths = write_artifacts(status, data_dir=tmp_path, docs_dir=tmp_path / "docs")
    written = json.loads(paths["status"].read_text(encoding="utf-8"))
    assert written["family_count"] == status["family_count"]
    assert sha256_json(written) == sha256_json(status)
    assert "BOFU intent dominance" in paths["report"].read_text(encoding="utf-8")
    next_md = paths["next_actions"].read_text(encoding="utf-8")
    assert next_md.count("## ") >= 5
    assert "authorizes_html_edit: `False`" in next_md
    assert (ROOT / "data" / "bofu-dominance" / "core" / "intent-registry.v2.json").is_file()


def test_module_main_builds():
    assert main(["--print"]) == 0
