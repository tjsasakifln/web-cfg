#!/usr/bin/env python3
"""Clean filter: store PLACEHOLDER for tip SHAs so the git blob never claims a wrong tip.

On commit, final_sha/deployed_sha become PLACEHOLDER when status is COMPLETE.
Smudge (and build:site pin_release_result_shas) restore the authentic tip SHA.
"""
from __future__ import annotations

import json
import sys

PLACEHOLDER = "PLACEHOLDER"


def main() -> None:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except Exception:
        sys.stdout.write(raw if raw.endswith("\n") else raw + "\n")
        return

    if data.get("status") == "COMPLETE":
        data["final_sha"] = PLACEHOLDER
        data["deployed_sha"] = PLACEHOLDER
        if "git_head" in data:
            data["git_head"] = PLACEHOLDER
        data["final_sha_note"] = (
            "PLACEHOLDER in git blob; smudge injects HEAD on checkout; "
            "build:site and /.well-known/release-result.json carry the real tip SHA"
        )

    out = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    sys.stdout.write(out)


if __name__ == "__main__":
    main()
