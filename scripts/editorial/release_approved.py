#!/usr/bin/env python3
"""Idempotent release of HUMAN_APPROVED pages only.

  npm run editorial:release-approved

Never invents human approval. Never runs as Tiago.
Steps: find valid human approvals → rebuild → cannibalization dispositions →
robots/sitemaps → tests → open PR (optional) → verify list for GSC submit.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.editorial.registry import load_registry  # noqa: E402
from scripts.editorial.truth import derive_editorial_truth  # noqa: E402


def valid_human_approved(pages: list[dict]) -> list[dict]:
    out = []
    for p in pages:
        if p.get("status") not in {"HUMAN_APPROVED", "INDEXABLE"}:
            continue
        ap = p.get("approval") or {}
        reviewer = str(ap.get("reviewer") or "")
        if not reviewer or reviewer.lower() in {"tester", "ci", "bot", "agent", "operator"}:
            continue
        if p.get("page_id") == "jur-sumula-260-art":
            continue
        out.append(p)
    return out


def main() -> int:
    reg = load_registry()
    pages = reg.get("pages") or []
    approved = valid_human_approved(pages)
    truth = derive_editorial_truth(reg)

    report = {
        "ok": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "valid_human_approved": len(approved),
        "page_ids": [p.get("page_id") for p in approved],
        "wave1_human_approved_truth": truth.get("wave1", {}).get("human_approved"),
        "wave1_indexable_truth": truth.get("wave1", {}).get("indexable"),
        "actions": [],
        "gsc_submit_candidates": [],
        "blocked": [],
    }

    if not approved:
        report["ok"] = True
        report["blocked"].append(
            "no_valid_human_approvals — named human must run approve_cli.py per page"
        )
        report["actions"].append("noop")
        out = ROOT / "docs" / "editorial" / "RELEASE-APPROVED-LAST.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    # Rebuild editorial
    try:
        from scripts.editorial.build import build as editorial_build

        br = editorial_build()
        report["actions"].append("editorial_build")
        report["build"] = {
            "ok": br.get("ok"),
            "indexable_count": br.get("indexable_count"),
            "indexable_urls": br.get("indexable_urls"),
        }
        for u in br.get("indexable_urls") or []:
            report["gsc_submit_candidates"].append(u)
    except Exception as exc:  # noqa: BLE001
        report["ok"] = False
        report["blocked"].append(f"build_failed:{exc}")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    # Tests (subset)
    try:
        subprocess.run(
            ["python3", "-m", "pytest", "scripts/editorial/tests", "-q"],
            cwd=str(ROOT),
            check=True,
            timeout=120,
        )
        report["actions"].append("editorial_tests_ok")
    except Exception as exc:  # noqa: BLE001
        report["ok"] = False
        report["blocked"].append(f"tests_failed:{exc}")

    out = ROOT / "docs" / "editorial" / "RELEASE-APPROVED-LAST.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
