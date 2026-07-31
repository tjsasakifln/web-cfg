#!/usr/bin/env python3
"""Freeze deploy identity into seo/pseo-operational-result.json from live well-known.

Does NOT invent tip equality. Live https://confenge.com.br/.well-known/pseo-build.json
is the sole deploy identity. After Netlify ignore for evidence-only commits is on,
freezing this JSON no longer advances the live tip.

Usage:
  python3 scripts/pseo/freeze_shas.py
  python3 scripts/pseo/freeze_shas.py --capture-dir /path/to/scratch
  npm run pseo:evidence:freeze-shas
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "seo" / "pseo-operational-result.json"
WELL_KNOWN_URL = "https://confenge.com.br/.well-known/pseo-build.json"


def git_head(repo: Path = ROOT) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip()
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return "unknown"


def curl_well_known(
    url: str = WELL_KNOWN_URL,
    *,
    timeout: float = 20.0,
    retries: int = 12,
    pause_s: float = 5.0,
) -> dict[str, Any]:
    """GET live well-known until HTTP 200 + stable web_cfg_sha (or raise)."""
    last_err: Exception | None = None
    last_body: dict[str, Any] | None = None
    stable_sha: str | None = None
    stable_count = 0
    for attempt in range(max(1, retries)):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "confenge-pseo-freeze-shas/1.0", "Accept": "application/json"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if getattr(resp, "status", None) not in (None, 200) and resp.getcode() != 200:
                    raise RuntimeError(f"HTTP {resp.getcode()}")
                raw = resp.read().decode("utf-8")
            body = json.loads(raw)
            sha = body.get("web_cfg_sha")
            if not sha or not isinstance(sha, str):
                raise RuntimeError("well-known missing web_cfg_sha")
            if sha == stable_sha:
                stable_count += 1
            else:
                stable_sha = sha
                stable_count = 1
            last_body = body
            # require two consecutive identical reads when retries allow
            if stable_count >= 2 or retries == 1:
                return body
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            last_err = exc
        if attempt + 1 < retries:
            time.sleep(pause_s)
    if last_body and last_body.get("web_cfg_sha"):
        return last_body
    raise RuntimeError(f"failed to fetch stable well-known: {last_err}")


def apply_freeze(
    result: dict[str, Any],
    live: dict[str, Any],
    *,
    head: str,
    now: str | None = None,
) -> dict[str, Any]:
    """Rewrite identity fields only. Pure function for unit tests."""
    sha = str(live.get("web_cfg_sha") or "")
    out = dict(result)
    out["web_cfg_sha"] = sha
    out["netlify_deployed_sha"] = sha
    out["public_manifest"] = live
    generated = now or datetime.now(timezone.utc).isoformat()
    all_match = bool(sha) and sha == head
    out["sha_alignment"] = {
        "web_cfg_sha": sha,
        "netlify_deployed_sha": sha,
        "git_head": head,
        "all_match": all_match,
        "report_commit_may_lag": not all_match,
        "source": WELL_KNOWN_URL,
        "generated_at": generated,
        "note": (
            "web_cfg_sha and netlify_deployed_sha are always the live well-known SHA. "
            "all_match is true only when git HEAD equals that live SHA at freeze time. "
            "Evidence-only commits should not redeploy (netlify.toml ignore)."
        ),
    }
    out["generated_at"] = generated
    return out


def freeze(
    *,
    result_path: Path = RESULT_PATH,
    capture_dir: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    head = git_head()
    live = curl_well_known()
    if result_path.exists():
        result = json.loads(result_path.read_text(encoding="utf-8"))
    else:
        result = {}
    updated = apply_freeze(result, live, head=head)
    if not dry_run:
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(
            json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    capture: dict[str, Any] = {
        "live_well_known": live,
        "git_head": head,
        "web_cfg_sha": updated["web_cfg_sha"],
        "netlify_deployed_sha": updated["netlify_deployed_sha"],
        "all_match": updated["sha_alignment"]["all_match"],
        "report_commit_may_lag": updated["sha_alignment"]["report_commit_may_lag"],
        "RESULT_EQ_LIVE": (
            updated["web_cfg_sha"] == live.get("web_cfg_sha")
            and updated["netlify_deployed_sha"] == live.get("web_cfg_sha")
        ),
        "written": not dry_run,
        "result_path": str(result_path),
    }
    if capture_dir:
        capture_dir.mkdir(parents=True, exist_ok=True)
        (capture_dir / "freeze-shas-capture.json").write_text(
            json.dumps(capture, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (capture_dir / "well-known-live.json").write_text(
            json.dumps(live, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return capture


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Freeze deploy SHAs from live well-known")
    ap.add_argument(
        "--capture-dir",
        type=Path,
        default=None,
        help="Write curl capture + equality flags (scratch)",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--result", type=Path, default=RESULT_PATH)
    args = ap.parse_args(argv)
    try:
        capture = freeze(
            result_path=args.result,
            capture_dir=args.capture_dir,
            dry_run=args.dry_run,
        )
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, **capture}, ensure_ascii=False, indent=2))
    return 0 if capture.get("RESULT_EQ_LIVE") else 0  # freeze always succeeds; equality is reported


if __name__ == "__main__":
    raise SystemExit(main())
