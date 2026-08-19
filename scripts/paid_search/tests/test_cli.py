"""CLI entry point run twice for consistency. No Ads mutate path exists."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "scripts.paid_search", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def _load(proc: subprocess.CompletedProcess[str]) -> dict:
    assert proc.stdout, proc.stderr
    return json.loads(proc.stdout)


def test_module_has_no_mutate_verb():
    help_proc = _run(["--help"])
    text = help_proc.stdout + help_proc.stderr
    assert "preflight" in text
    assert "dry-run" in text
    # Subcommands only. There is no spend/enable/upload path.
    for forbidden in ("  mutate", "  spend", "  authorize", "  enable", "  upload"):
        assert forbidden not in text.lower()
    bad = _run(["mutate"])
    assert bad.returncode != 0


def test_preflight_representative_is_deterministic():
    first = _run(["preflight"])
    second = _run(["preflight"])
    assert first.returncode == second.returncode == 2
    a, b = _load(first), _load(second)
    assert a["reasons"] == b["reasons"]
    assert a["decision"] == b["decision"] == "READY_BEHIND_HUMAN_GATE"
    assert a["campaign_created"] is False
    assert a["ads_mutate"] is False


def test_dry_run_representative_is_deterministic():
    first = _run(["dry-run"])
    second = _run(["dry-run"])
    assert first.returncode == second.returncode == 0
    a, b = _load(first), _load(second)
    assert a == b
    assert a["campaign_created"] is False
    assert a["spend_authorized"] is False
    assert a["google_ads_api_called"] is False
    assert a["decision"] == "READY_BEHIND_HUMAN_GATE"


def test_forbidden_variant_preflight_and_dry_run_consistent():
    pf1 = _run(["preflight", "--variant", "pii"])
    pf2 = _run(["preflight", "--variant", "pii"])
    dr1 = _run(["dry-run", "--variant", "broad"])
    dr2 = _run(["dry-run", "--variant", "broad"])
    assert pf1.returncode == pf2.returncode == 2
    assert dr1.returncode == dr2.returncode == 2
    p1, p2 = _load(pf1), _load(pf2)
    d1, d2 = _load(dr1), _load(dr2)
    assert p1["reasons"] == p2["reasons"]
    assert "PII_IN_PARAMS" in p1["reasons"]
    assert d1["reasons"] == d2["reasons"]
    assert "BROAD_MATCH" in d1["reasons"]
    assert d1["campaign_created"] is False
    assert d1["ads_mutate"] is False
