"""The public virtual filesystem must never hide actual secret findings."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.pseo.public_artifact import audit_public_artifact


@pytest.mark.parametrize("relative,source,leaks", [
    ("assets/freecad/FreeCAD-3f8c1ff4a0ee.js", 'FS.mkdir("/home/web_user/Documents")', False),
    ("cad/freecad/vendor/graphics.js", 'FS.readFile("/home/web_user/model.FCStd")', False),
    ("assets/freecad/FreeCAD-3f8c1ff4a0ee.js", 'FS.mkdir("/home/web_user/");const path="/home/operator/private"', True),
    ("cad/freecad/vendor/graphics.js", 'FS.mkdir("/home/web_user/");const api_key="fixture_not_a_real_secret"', True),
    ("assets/another-tool.js", 'const path="/home/web_user/private"', True),
    ("assets/freecad/FreeCAD-000000000000.js", 'const path="/home/web_user/private"', True),
])
def test_real_artifact_scan_keeps_secret_and_host_path_detection(tmp_path, relative, source, leaks):
    artifact = tmp_path / "_site" / relative
    artifact.parent.mkdir(parents=True)
    artifact.write_text(source)
    report = audit_public_artifact(tmp_path)
    detected = [row for row in report["findings"]
                if row["code"] == "secret_or_internal_leak" and row["path"] == relative]
    assert bool(detected) is leaks
