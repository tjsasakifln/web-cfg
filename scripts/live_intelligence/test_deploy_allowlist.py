"""The Live Intelligence public routes must actually reach the deployed
artifact. `scripts/pseo/public_artifact.py`'s `PUBLIC_TOP_DIRS` allowlist is
what `assemble_public_artifact()` copies into `_site` — the exact tree
`npm run build:site` publishes. A route this repo serves in dev but that is
missing from that allowlist would never be reachable in production."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.public_artifact import PUBLIC_TOP_DIRS, assemble_public_artifact

LIVE_INTELLIGENCE_PUBLIC_DIRS = ("analise-cnpj",)


def test_live_intelligence_dirs_are_in_the_deploy_allowlist():
    missing = [d for d in LIVE_INTELLIGENCE_PUBLIC_DIRS if d not in PUBLIC_TOP_DIRS]
    assert not missing, f"missing from PUBLIC_TOP_DIRS: {missing}"
    assert "oportunidades" not in PUBLIC_TOP_DIRS, (
        "fixture opportunities must not ship in the package; the Netcup stage "
        "overlay is the only publisher of official_live opportunity pages"
    )


def test_assembled_artifact_actually_contains_the_routes():
    dest_name = "_site_test_live_intelligence_allowlist"
    try:
        assemble_public_artifact(root=ROOT, dest_name=dest_name)
        dest = ROOT / dest_name
        assert (dest / "analise-cnpj" / "index.html").exists()
        assert (dest / "analise-cnpj" / "r" / "index.html").exists()
        assert not (dest / "oportunidades").exists()
    finally:
        shutil.rmtree(ROOT / dest_name, ignore_errors=True)


if __name__ == "__main__":
    test_live_intelligence_dirs_are_in_the_deploy_allowlist()
    test_assembled_artifact_actually_contains_the_routes()
    print("LIVE_INTELLIGENCE_DEPLOY_ALLOWLIST_OK")
