#!/usr/bin/env python3
"""Single site build entry for Netlify / CI.

Order (fail-closed on critical):
  1. validate snapshot schema + checksums + provenance
  2. generate pages + hubs
  3. generate pSEO sitemap + sitemap index
  4. write public build manifest (/.well-known/pseo-build.json)
  5. validate canonical/robots/links
  6. similarity already inside build; editorial + attribution gates
  7. abort on critical failure
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build import build  # noqa: E402
from scripts.pseo.schema import SnapshotError, validate_snapshot  # noqa: E402
from scripts.pseo.validate import validate_all  # noqa: E402


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip()
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return "unknown"


def write_public_manifest(summary: dict, snap: dict) -> Path:
    """Safe public manifest — no DSN, scores, commercial notes, or PII."""
    manifest = snap.get("manifest") or {}
    dataset_hash = (manifest.get("dataset_hash") or summary.get("dataset_hash") or "")
    pubs = summary.get("publishable") or []
    payload = {
        "schema_version": manifest.get("schema_version"),
        "export_version": manifest.get("export_version") or manifest.get("exporter_version"),
        "web_cfg_sha": _git_sha(),
        "snapshot_hash_short": dataset_hash[:16] if dataset_hash else None,
        "source_run_id": manifest.get("source_run_id"),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_as_of": manifest.get("data_as_of"),
        "published_page_count": len(pubs),
        "sitemap_urls": [
            "https://confenge.com.br/sitemap-index.xml",
            "https://confenge.com.br/sitemap.xml",
            "https://confenge.com.br/sitemap-inteligencia.xml",
        ],
        "note": (
            "Public build marker only. Does not imply Google indexation. "
            "Stages: GENERATED_LOCAL→…→CRAWLABLE_PRODUCTION require separate proof."
        ),
    }
    out = ROOT / ".well-known" / "pseo-build.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def run_node_gate(script: str) -> dict:
    r = subprocess.run(
        ["node", script],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return {
        "script": script,
        "returncode": r.returncode,
        "stdout": (r.stdout or "")[-2000:],
        "stderr": (r.stderr or "")[-2000:],
        "ok": r.returncode == 0,
    }


def main(argv: list[str] | None = None) -> int:
    data_dir = ROOT / "data" / "pseo"
    errors: list[str] = []

    try:
        snap = validate_snapshot(data_dir)
    except SnapshotError as exc:
        print(f"FAIL-CLOSED snapshot: {exc}", file=sys.stderr)
        return 2

    try:
        summary = build(data_dir, dry_run=False)
    except SystemExit as exc:
        code = int(exc.code) if isinstance(exc.code, int) else 2
        print("FAIL-CLOSED build", file=sys.stderr)
        return code
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL-CLOSED build exception: {exc}", file=sys.stderr)
        return 2

    man_path = write_public_manifest(summary, snap)

    v = validate_all()
    if not v.get("ok"):
        errors.extend(v.get("errors") or ["validate_all failed"])

    # attribution / analytics no-PII
    for script in (
        "seo/scripts/test_analytics_pii.mjs",
        "seo/scripts/test_pseo_attribution.mjs",
    ):
        sp = ROOT / script
        if not sp.exists():
            continue
        gate = run_node_gate(str(sp.relative_to(ROOT)) if False else str(sp))
        # node scripts may use paths relative to cwd
        gate = run_node_gate(script)
        if not gate["ok"]:
            errors.append(f"gate failed: {script} rc={gate['returncode']}")

    report = {
        "ok": len(errors) == 0,
        "web_cfg_sha": _git_sha(),
        "manifest_public": str(man_path.relative_to(ROOT)),
        "build_summary": {
            "dataset_hash": summary.get("dataset_hash"),
            "counts": summary.get("counts"),
            "publishable": summary.get("publishable"),
            "pages_written": summary.get("pages_written"),
        },
        "validate": {"ok": v.get("ok"), "error_count": len(v.get("errors") or [])},
        "errors": errors,
    }
    out = ROOT / "seo" / "pseo-site-build-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
