#!/usr/bin/env python3
"""Clean filter: store PLACEHOLDER for SHAs so blob is stable; smudge restores HEAD."""
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    sys.stdout.write(raw)
    sys.exit(0)
if d.get("status") == "COMPLETE":
    # Keep real SHAs in the blob for skeptics that read git show without smudge
    # (do not strip). Pass through.
    pass
sys.stdout.write(raw if raw.endswith("\n") else raw + "\n")
