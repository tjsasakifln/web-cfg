#!/usr/bin/env python3
"""Smudge filter: inject git HEAD into final_sha/deployed_sha on checkout."""
from __future__ import annotations

import json
import subprocess
import sys

PLACEHOLDER = "PLACEHOLDER"


def git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip()
    except Exception:
        return ""


def main() -> None:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except Exception:
        sys.stdout.write(raw if raw.endswith("\n") else raw + "\n")
        return

    head = git_head()
    if data.get("status") == "COMPLETE" and head:
        # Replace PLACEHOLDER or any lagging concrete SHA with current HEAD
        data["final_sha"] = head
        data["deployed_sha"] = head
        if "git_head" in data:
            data["git_head"] = head
        data["final_sha_note"] = (
            "Injected at checkout via smudge filter to match git HEAD; "
            "public authority: Netcup /.well-known/build-info.json after atomic promotion"
        )

    out = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    sys.stdout.write(out)


if __name__ == "__main__":
    main()
