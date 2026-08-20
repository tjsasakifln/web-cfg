#!/usr/bin/env python3
"""Drive the shipped CI copy path and prove it is hermetic.

This is the last step of `npm run test:copy`. It must:
- read the real package.json / site-ci copy command (not a reimplementation);
- leave `git status --porcelain` unchanged after the shipped `--check`;
- still fail `--check` on a representative U+2014 input.

Do not mock the scrubber. Do not hard-code the mutated-file list.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRUB = ROOT / "scripts" / "site" / "scrub_em_dashes.py"
PKG = ROOT / "package.json"
SITE_CI = ROOT / ".github" / "workflows" / "site-ci.yml"


def _porcelain() -> str:
    return subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )


def test_shipped_copy_script_is_check_only():
    pkg = json.loads(PKG.read_text(encoding="utf-8"))
    copy = pkg["scripts"]["test:copy"]
    assert "scrub_em_dashes.py --write" not in copy, copy
    assert "scrub_em_dashes.py --check" in copy, copy
    assert "test_copy_gates.py" in copy
    assert "lint_editorial_copy.py" in copy
    assert pkg["scripts"]["scrub:em-dashes"].endswith("scrub_em_dashes.py --write")
    site_ci = SITE_CI.read_text(encoding="utf-8")
    assert "npm run test:copy" in site_ci
    npm_test = pkg["scripts"]["test"]
    assert "test:copy" in npm_test


def test_shipped_copy_check_leaves_porcelain_unchanged():
    before = _porcelain()
    proc = subprocess.run(
        [sys.executable, str(SCRUB), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    after = _porcelain()
    assert after == before, (
        "shipped scrub_em_dashes.py --check mutated the working tree:\n"
        f"before={before!r}\nafter={after!r}"
    )


def test_shipped_check_still_fails_on_em_dash():
    html = (
        "<!DOCTYPE html><html lang='pt-BR'><body>"
        "<p>O desfecho depende de prova — não de narrativa.</p>"
        "</body></html>\n"
    )
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", suffix=".html", delete=False
    ) as fh:
        fh.write(html)
        path = Path(fh.name)
    try:
        proc = subprocess.run(
            [sys.executable, str(SCRUB), "--check", "--path", str(path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 1, proc.stdout + proc.stderr
        combined = proc.stdout + proc.stderr
        assert "FAIL" in combined or "unnormalized" in combined or "residual" in combined
        after = path.read_text(encoding="utf-8")
        assert after == html, "--check must not rewrite the failing input"
    finally:
        path.unlink(missing_ok=True)


def main() -> int:
    failed = 0
    for t in (
        test_shipped_copy_script_is_check_only,
        test_shipped_copy_check_leaves_porcelain_unchanged,
        test_shipped_check_still_fails_on_em_dash,
    ):
        try:
            t()
            print("OK", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
