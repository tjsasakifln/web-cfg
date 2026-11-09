"""Contract test for keeping the IFC viewer runtime off the initial route load."""

from __future__ import annotations

import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "scripts" / "bim" / "aplicativo.tar.gz"
VIEWER = "web/visualizador.mjs"


def main() -> None:
    with tarfile.open(ARCHIVE, "r:gz") as package:
        names = package.getnames()
        assert VIEWER in names, f"{VIEWER} is absent from the BIM package"
        assert all("\\" not in name for name in names), "BIM package has Windows path separators"
        source = package.extractfile(VIEWER)
        assert source is not None
        code = source.read().decode("utf-8")

    assert "import * as THREE from" not in code
    assert "import {OrbitControls}" not in code
    assert "async function ensureViewerRuntime()" in code
    assert "import('./vendor/three/three.module.js')" in code
    assert "import('./vendor/three/addons/controls/OrbitControls.js')" in code
    assert "await ensureViewerRuntime();" in code
    # Clearing before the first open (pagehide, invalid input, retry) must not
    # dereference a scene that has intentionally not been loaded yet.
    assert "model?.clear();" in code

    print("OK BIM viewer lazily loads Three only after an open action")


if __name__ == "__main__":
    main()
