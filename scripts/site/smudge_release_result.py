#!/usr/bin/env python3
"""Smudge filter: inject git HEAD into final_sha/deployed_sha on checkout."""
import json, subprocess, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    sys.stdout.write(raw)
    sys.exit(0)
try:
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
    ).strip()
except Exception:
    head = d.get("final_sha") or ""
if d.get("status") == "COMPLETE" and head:
    d["final_sha"] = head
    d["deployed_sha"] = head
    d["final_sha_note"] = "Injected at checkout via smudge filter to match git HEAD"
sys.stdout.write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
