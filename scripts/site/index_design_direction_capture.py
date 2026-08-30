#!/usr/bin/env python3
"""Consolidate the #494 capture manifests into one readable index.

`scripts/site/capture_design_direction.sh` runs the #512 harness once per
(variant, job) and each run writes its own manifest. This collapses the nine
manifests into a single file that names, for every captured PNG: the route, the
viewport, the render state, the byte size and the SHA-256.

Why the index and not the binaries: the protocol (§11 of the brief) requires a
durable baseline "with SHA, date, per-file hash and a readable manifest,
outside /tmp". That is the hash index. The PNGs themselves are 28 MB of
losslessly compressed text screenshots, reproducible byte-for-byte from the
recorded commit by re-running the one script, so they stay out of the tree and
the hashes are what makes a re-capture checkable.

Usage: python3 scripts/site/index_design_direction_capture.py [captureRoot]
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CAPTURE = ROOT / "docs/design-audit/evidence/capture"
OUT = ROOT / "docs/design-audit/evidence/capture-index.json"


def commit_sha() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return None


def main(argv: list[str]) -> int:
    capture_root = Path(argv[1]) if len(argv) > 1 else DEFAULT_CAPTURE
    manifests = sorted(capture_root.rglob("manifest-*.json"))
    if not manifests:
        print(f"CAPTURE_INDEX_EMPTY root={capture_root}", file=sys.stderr)
        return 1

    groups = []
    total = 0
    for path in manifests:
        data = json.loads(path.read_text(encoding="utf-8"))
        rel_dir = path.parent.relative_to(ROOT).as_posix()
        files = [
            {
                "file": entry["file"],
                "route": entry["route"],
                "viewport": entry["viewport"],
                "state": entry["state"],
                "bytes": entry["bytes"],
                "sha256": entry["sha256"],
            }
            for entry in data["captures"]
            if entry["kind"] == "page"
        ]
        total += len(files)
        groups.append(
            {
                "group": rel_dir.split("evidence/capture/", 1)[-1],
                "manifest": path.relative_to(ROOT).as_posix(),
                "captured_at": data["captured_at"],
                "commit_sha": data["commit_sha"],
                "tree_dirty": data["tree_dirty"],
                "state": data["state"],
                "viewports": data["viewports"],
                "routes": data["routes"],
                "files": files,
            }
        )

    payload = {
        "schema": "confenge.design-direction-capture-index/1.0",
        "issue": 494,
        "indexed_at": date.today().isoformat(),
        "commit_sha": commit_sha(),
        "protocol": {
            "viewports": ["390x844", "768x1024", "1366x768", "1363x936", "1440x1000"],
            "state": "fullpage + JavaScript off + prefers-reduced-motion: reduce",
            "harness": "scripts/site/capture_screenshots.mjs (CAPTURE_VIEWPORTS=protocol), issue #512",
            "reproduce": "CHROME_PATH=... bash scripts/site/capture_design_direction.sh",
        },
        "binaries_committed": False,
        "binaries_note": (
            "As 28 MB de PNG ficam fora da arvore: sao reproduziveis byte a byte a partir do "
            "commit registrado, e o hash por arquivo abaixo e o que torna uma recaptura conferivel."
        ),
        "file_count": total,
        "groups": groups,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} groups={len(groups)} files={total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
