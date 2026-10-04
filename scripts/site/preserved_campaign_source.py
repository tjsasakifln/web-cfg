"""Read the immutable predecessor used by historical campaign regression tests."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

CAMPAIGN_PREDECESSOR_SHA = "c7d2d0a42ebb531efc0547b34f2f38b4077ee45e"


def preserved_source_bytes(root: Path, relative_path: str) -> bytes:
    """Fail closed if the preserved commit is missing or outside this history."""
    assert re.fullmatch(r"[0-9a-f]{40}", CAMPAIGN_PREDECESSOR_SHA), "baseline must be an immutable commit"
    resolved = subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", f"{CAMPAIGN_PREDECESSOR_SHA}^{{commit}}"],
        text=True,
    ).strip()
    assert resolved == CAMPAIGN_PREDECESSOR_SHA, "baseline identity mismatch"
    subprocess.check_call([
        "git", "-C", str(root), "merge-base", "--is-ancestor",
        CAMPAIGN_PREDECESSOR_SHA, "HEAD",
    ])
    return subprocess.check_output([
        "git", "-C", str(root), "show", f"{CAMPAIGN_PREDECESSOR_SHA}:{relative_path}",
    ])
