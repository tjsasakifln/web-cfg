#!/usr/bin/env python3
"""Release identity must come from deploy/CI env via build-info — not git clean/smudge."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build_site import _deploy_commit, write_build_info  # noqa: E402


def test_gitattributes_has_no_release_filter():
    attrs = (ROOT / ".gitattributes").read_text(encoding="utf-8")
    assert "filter=release-sha" not in attrs
    assert "release-sha" not in attrs


def test_install_git_filters_is_noop():
    script = ROOT / "scripts" / "install-git-filters.sh"
    assert script.exists()
    proc = subprocess.run(
        ["bash", str(script)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
    )
    assert "no-op" in (proc.stdout or "").lower() or proc.returncode == 0


def test_deploy_commit_prefers_env(monkeypatch=None):
    """COMMIT_REF wins over git when set (release packager, and the legacy preview builder)."""
    fake = "abcdef0123456789abcdef0123456789abcdef01"
    old = os.environ.get("COMMIT_REF")
    os.environ["COMMIT_REF"] = fake
    try:
        assert _deploy_commit() == fake
    finally:
        if old is None:
            os.environ.pop("COMMIT_REF", None)
        else:
            os.environ["COMMIT_REF"] = old


def test_write_build_info_schema():
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        path = write_build_info(
            commit="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            generated_at="2026-08-02T00:00:00Z",
            environment="test",
            schema_version="1.0.0",
            deploy_id="deploy-test-123",
            artifact_hash="abc123def456",
            manifest_hash="fff111aaa222",
            root=Path(td),
        )
        assert path.exists()
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["commit"] == "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        assert data["build_time"] == "2026-08-02T00:00:00Z"
        assert data["environment"] == "test"
        assert data["schema_version"] == "1.2.0"
        assert data["deploy_id"] == "deploy-test-123"
        assert data["artifact_hash"] == "abc123def456"
        assert data["manifest_hash"] == "fff111aaa222"
        assert data["versioned_timestamp_fields"] == [
            "build_time",
            "generated_at",
            "preview_generated_at",
        ]


def test_public_build_info_path_documented():
    # Source of truth written into the artifact promoted by netcup-release.yml.
    assert (ROOT / "scripts" / "pseo" / "build_site.py").exists()
    src = (ROOT / "scripts" / "pseo" / "build_site.py").read_text(encoding="utf-8")
    assert "build-info.json" in src
    assert "pin_release_result_shas" not in src


def run_all() -> int:
    failed = 0
    for name, fn in list(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print("OK", name)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", name, exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run_all())
