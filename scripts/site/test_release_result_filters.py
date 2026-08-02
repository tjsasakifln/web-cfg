#!/usr/bin/env python3
"""Prove clean stores PLACEHOLDER and smudge injects HEAD — drives real filter scripts."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLEAN = ROOT / "scripts" / "site" / "clean_release_result.py"
SMUDGE = ROOT / "scripts" / "site" / "smudge_release_result.py"
PLACEHOLDER = "PLACEHOLDER"


def run_filter(script: Path, payload: dict) -> dict:
    raw = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    proc = subprocess.run(
        [sys.executable, str(script)],
        input=raw,
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        check=True,
        timeout=15,
    )
    return json.loads(proc.stdout)


def test_clean_stores_placeholder():
    sample = {
        "status": "COMPLETE",
        "final_sha": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        "deployed_sha": "cafebabecafebabecafebabecafebabecafebabe",
        "final_sha_note": "stale",
    }
    out = run_filter(CLEAN, sample)
    assert out["status"] == "COMPLETE"
    assert out["final_sha"] == PLACEHOLDER, out["final_sha"]
    assert out["deployed_sha"] == PLACEHOLDER, out["deployed_sha"]
    assert "PLACEHOLDER" in (out.get("final_sha_note") or "")


def test_smudge_injects_head():
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=str(ROOT), text=True
    ).strip()
    sample = {
        "status": "COMPLETE",
        "final_sha": PLACEHOLDER,
        "deployed_sha": PLACEHOLDER,
    }
    out = run_filter(SMUDGE, sample)
    assert out["final_sha"] == head, (out["final_sha"], head)
    assert out["deployed_sha"] == head


def test_clean_then_smudge_roundtrip():
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=str(ROOT), text=True
    ).strip()
    sample = {
        "status": "COMPLETE",
        "final_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "deployed_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "axe": {"critical": 0},
    }
    cleaned = run_filter(CLEAN, sample)
    assert cleaned["final_sha"] == PLACEHOLDER
    restored = run_filter(SMUDGE, cleaned)
    assert restored["final_sha"] == head
    assert restored["deployed_sha"] == head
    assert restored.get("axe", {}).get("critical") == 0


def test_git_blob_must_not_claim_wrong_concrete_tip():
    """If FINAL is COMPLETE in the index/HEAD blob, SHAs must be PLACEHOLDER."""
    blob = subprocess.check_output(
        ["git", "show", "HEAD:docs/FINAL-RELEASE-RESULT.json"],
        cwd=str(ROOT),
        text=True,
    )
    data = json.loads(blob)
    if data.get("status") != "COMPLETE":
        return
    for key in ("final_sha", "deployed_sha"):
        val = data.get(key) or ""
        assert val == PLACEHOLDER or val == "", (
            f"git blob {key}={val!r} must be PLACEHOLDER when COMPLETE "
            f"(not a lagging concrete tip)"
        )


if __name__ == "__main__":
    failed = 0
    for fn in (
        test_clean_stores_placeholder,
        test_smudge_injects_head,
        test_clean_then_smudge_roundtrip,
        test_git_blob_must_not_claim_wrong_concrete_tip,
    ):
        try:
            fn()
            print("OK", fn.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", fn.__name__, exc)
    sys.exit(1 if failed else 0)
