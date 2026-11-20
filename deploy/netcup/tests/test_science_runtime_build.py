from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SITE = Path("lib/python3.12/site-packages")
DIST_INFO = SITE / "example-1.0.dist-info"
FILES = {
    DIST_INFO / "METADATA": "Name: example\nVersion: 1.0\nLicense-Expression: MIT\n",
    DIST_INFO / "LICENSE.txt": "Example license\n",
    DIST_INFO / "licenses/NOTICE.txt": "Bundled dependency notice\n",
    DIST_INFO / "README.txt": "Not a license notice\n",
    SITE / "matplotlib/mpl-data/fonts/ttf/LICENSE_DEJAVU": "Font license\n",
    SITE / "matplotlib/mpl-data/fonts/ttf/LICENSE_STIX": "Font license\n",
}


@pytest.fixture
def builder():
    spec = importlib.util.spec_from_file_location(
        "science_runtime_builder", ROOT / "runtime/science-tools/build_runtime.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_runtime(target: Path, reverse: bool = False) -> Path:
    for relative in sorted(FILES, reverse=reverse):
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(FILES[relative], encoding="utf-8")
    return target


def test_license_inventory_is_independent_of_directory_order(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, builder
) -> None:
    targets = [make_runtime(tmp_path / "forward"), make_runtime(tmp_path / "reverse", True)]
    trees = [{p: (target / p).read_bytes() for p in FILES} for target in targets]
    assert trees[0] == trees[1]

    original_rglob = Path.rglob

    def enumerate_paths(path, pattern):
        paths = original_rglob(path, pattern)
        # Pin opposite traversal orders so the regression does not depend on
        # the filesystem's current directory iteration behavior.
        if path in [target / DIST_INFO for target in targets]:
            return iter(sorted(paths, reverse=path == targets[1] / DIST_INFO))
        return paths

    monkeypatch.setattr(Path, "rglob", enumerate_paths)
    inventories = [builder.license_inventory(target) for target in targets]
    serialized = [(json.dumps(value, indent=2) + "\n").encode() for value in inventories]
    assert serialized[0] == serialized[1]
    expected = {
        (str(path), hashlib.sha256(FILES[path].encode()).hexdigest())
        for path in (DIST_INFO / "LICENSE.txt", DIST_INFO / "licenses/NOTICE.txt")
    }
    assert {(item["path"], item["sha256"]) for item in inventories[0][0]["notices"]} == expected


def test_license_inventory_still_rejects_missing_license(tmp_path: Path, builder) -> None:
    target = make_runtime(tmp_path)
    (target / DIST_INFO / "LICENSE.txt").unlink()
    (target / DIST_INFO / "licenses/NOTICE.txt").unlink()
    with pytest.raises(RuntimeError, match="License text missing for example"):
        builder.license_inventory(target)
