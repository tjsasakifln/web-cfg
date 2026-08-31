#!/usr/bin/env python3
"""Consolidate the #494 capture manifests into one readable index.

`scripts/site/capture_design_direction.sh` runs the #512 harness once per
(variant, job) and each run writes its own manifest. This collapses the nine
manifests into a single file that names, for every captured PNG: the route, the
viewport, the render state, the byte size and the SHA-256.

Why the index and not the binaries: the protocol (§11 of the brief) requires a
durable baseline "with SHA, date, per-file hash and a readable manifest,
outside /tmp". That is the hash index. The PNGs themselves are 28 MB of
losslessly compressed text screenshots, so they stay out of the tree and the
hashes bind the exact captured artifacts. Re-capture is comparable only when
the commit, browser and full-page preparation contract recorded by the harness
also match; manifests produced before #540 did not record that contract.

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


def layout_comparison_ready(layout: object) -> bool:
    if not isinstance(layout, dict):
        return False
    height = layout.get("scroll_height")
    before = layout.get("scroll_height_samples")
    after = layout.get("post_screenshot_scroll_height_samples")
    return (
        layout.get("strategy") == "content-visibility-visible/v1"
        and type(height) is int
        and height > 0
        and isinstance(before, list)
        and isinstance(after, list)
        and len(before) >= 3
        and len(after) >= 3
        and all(type(sample) is int and sample == height for sample in before + after)
    )


def manifest_comparison_ready(data: dict, files: list[dict]) -> bool:
    runtime = data.get("capture_runtime")
    preparation = runtime.get("fullpage_preparation") if isinstance(runtime, dict) else None
    return (
        data.get("schema_version") == "2.1.0"
        and data.get("tree_dirty") is False
        and bool(data.get("commit_sha"))
        and isinstance(runtime, dict)
        and bool(runtime.get("browser_version"))
        and isinstance(preparation, dict)
        and preparation.get("strategy") == "content-visibility-visible/v1"
        and bool(files)
        and all(layout_comparison_ready(entry.get("layout")) for entry in files)
    )


def collect_comparison_blockers(groups: list[dict]) -> list[str]:
    blockers = [group["group"] for group in groups if not group["comparison_ready"]]
    if len({group.get("commit_sha") for group in groups}) != 1:
        blockers.append("mixed_commit_sha")
    browsers = {
        (group.get("capture_runtime") or {}).get("browser_version")
        for group in groups
    }
    if len(browsers) != 1:
        blockers.append("mixed_browser_version")
    return blockers


def self_test() -> int:
    layout = {
        "strategy": "content-visibility-visible/v1",
        "scroll_height": 1200,
        "scroll_height_samples": [1200, 1200, 1200],
        "post_screenshot_scroll_height_samples": [1200, 1200, 1200],
    }
    data = {
        "schema_version": "2.1.0",
        "tree_dirty": False,
        "commit_sha": "a" * 40,
        "capture_runtime": {
            "browser_version": "Chrome/151.0.0.0",
            "fullpage_preparation": {"strategy": "content-visibility-visible/v1"},
        },
    }
    files = [{"layout": layout}]
    assert manifest_comparison_ready(data, files)
    assert not manifest_comparison_ready({**data, "tree_dirty": True}, files)
    assert not manifest_comparison_ready(data, [{"layout": {**layout, "scroll_height": 0}}])
    assert not manifest_comparison_ready(
        data,
        [{"layout": {**layout, "post_screenshot_scroll_height_samples": [1200, 1201, 1200]}}],
    )
    groups = [
        {
            "group": "one",
            "comparison_ready": True,
            "commit_sha": "a" * 40,
            "capture_runtime": data["capture_runtime"],
        },
        {
            "group": "two",
            "comparison_ready": True,
            "commit_sha": "b" * 40,
            "capture_runtime": {**data["capture_runtime"], "browser_version": "Chrome/152.0.0.0"},
        },
    ]
    assert collect_comparison_blockers(groups) == ["mixed_commit_sha", "mixed_browser_version"]
    print("CAPTURE_INDEX_SELF_TEST_OK")
    return 0


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
        runtime = data.get("capture_runtime")
        files = [
            {
                "file": entry["file"],
                "route": entry["route"],
                "viewport": entry["viewport"],
                "state": entry["state"],
                "bytes": entry["bytes"],
                "sha256": entry["sha256"],
                "layout": entry.get("layout"),
            }
            for entry in data["captures"]
            if entry["kind"] == "page"
        ]
        comparison_ready = manifest_comparison_ready(data, files)
        total += len(files)
        groups.append(
            {
                "group": rel_dir.split("evidence/capture/", 1)[-1],
                "manifest": path.relative_to(ROOT).as_posix(),
                "captured_at": data["captured_at"],
                "commit_sha": data["commit_sha"],
                "tree_dirty": data["tree_dirty"],
                "manifest_schema_version": data.get("schema_version"),
                "capture_runtime": runtime,
                "comparison_ready": comparison_ready,
                "state": data["state"],
                "viewports": data["viewports"],
                "routes": data["routes"],
                "files": files,
            }
        )

    comparison_blockers = collect_comparison_blockers(groups)
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
        "comparison_ready": not comparison_blockers,
        "comparison_blockers": comparison_blockers,
        "binaries_note": (
            "As 28 MB de PNG ficam fora da arvore; os hashes vinculam os artefatos exatos. "
            + (
                "Os manifests registram commit, browser e contrato de materializacao #540."
                if not comparison_blockers
                else "Ha manifests anteriores a #540 sem browser/materializacao; nao sao baseline direto."
            )
        ),
        "file_count": total,
        "groups": groups,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} groups={len(groups)} files={total}")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        raise SystemExit(self_test())
    raise SystemExit(main(sys.argv))
