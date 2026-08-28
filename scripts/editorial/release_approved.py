#!/usr/bin/env python3
"""Idempotent release path for HUMAN_APPROVED pages only.

  npm run editorial:release-approved

Never invents human approval. Never runs as Tiago.

Implemented steps when valid human approvals exist:
  1. Locate valid human approvals only
  2. Rebuild editorial (robots/sitemaps via editorial build)
  3. Apply cannibalization dispositions recorded on approved pages
  4. Run editorial tests
  5. Write GSC submit candidate list
  6. Optionally open PR when RELEASE_OPEN_PR=1 and gh available

Not automated here (require human/CI deploy):
  - merge of the PR
  - production publish (Netlify on main)
  - live production verify (use npm run test:prod-build-info after merge)

When zero valid approvals: exit 0 with blocked reason (noop) — not a failure.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.editorial.registry import approval_is_current, load_registry, save_registry  # noqa: E402
from scripts.editorial.cohort import FIRST_COHORT_IDS, FIRST_COHORT_SET  # noqa: E402
from scripts.editorial.truth import derive_editorial_truth  # noqa: E402


def valid_human_approved(pages: list[dict]) -> list[dict]:
    """Return only current, named-human approvals in the explicitly released cohort."""
    return [
        page
        for page in pages
        if page.get("page_id") in FIRST_COHORT_SET
        and page.get("status") in {"HUMAN_APPROVED", "INDEXABLE"}
        and approval_is_current(page)
    ]


def apply_cannibalization_dispositions(pages: list[dict], approved: list[dict]) -> list[str]:
    """Record dispositions from approved page metadata onto peers when present."""
    actions: list[str] = []
    by_id = {p.get("page_id"): p for p in pages}
    for p in approved:
        disp = (p.get("cannibalization") or {}).get("disposition") or p.get("cannibalization_disposition")
        peer = (p.get("cannibalization") or {}).get("peer_page_id") or p.get("cannibalization_peer")
        if not disp:
            continue
        actions.append(f"{p.get('page_id')}:{disp}:{peer or '-'}")
        if peer and peer in by_id and disp in {"keep_wave1_canonical", "consolidate_into_peer", "noindex_peer"}:
            peer_rec = by_id[peer]
            notes = peer_rec.setdefault("ops_notes", [])
            if not isinstance(notes, list):
                notes = []
                peer_rec["ops_notes"] = notes
            notes.append(
                {
                    "at": datetime.now(timezone.utc).isoformat(),
                    "event": "cannibalization_disposition",
                    "from_page": p.get("page_id"),
                    "disposition": disp,
                }
            )
    return actions


def main() -> int:
    reg = load_registry()
    pages = reg.get("pages") or []
    approved = valid_human_approved(pages)
    truth = derive_editorial_truth(reg)

    report: dict = {
        "ok": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "valid_human_approved": len(approved),
        "page_ids": [p.get("page_id") for p in approved],
        # Explicitly distinguish an individual approval from a released URL.
        "approved_count": len(approved),
        "released_count": len(
            [p for p in approved if p.get("status") in {"INDEXABLE", "PUBLISHED"}]
        ),
        "cohort_complete": False,
        "released_page_ids": [
            p.get("page_id") for p in approved if p.get("status") in {"INDEXABLE", "PUBLISHED"}
        ],
        "awaiting_page_ids": [
            page_id for page_id in FIRST_COHORT_IDS if page_id not in {p.get("page_id") for p in approved}
        ],
        "first_cohort_human_approved_truth": truth.get("first_cohort", {}).get("human_approved"),
        "first_cohort_indexable_truth": truth.get("first_cohort", {}).get("indexable"),
        "actions": [],
        "gsc_submit_candidates": [],
        "blocked": [],
        "not_automated": [
            "git_merge_of_release_pr",
            "netlify_production_publish",
            "live_production_verify_after_merge",
        ],
        "capabilities": {
            "find_valid_human_approvals": True,
            "rebuild_editorial_robots_sitemaps": True,
            "cannibalization_dispositions": True,
            "tests": True,
            "gsc_submit_list": True,
            "open_pr_optional": True,
            "post_merge_publish_verify": False,
        },
    }

    if not approved:
        report["actions"].append("noop")
        report["blocked"].append(
            "no_valid_human_approvals — named human must run approve_cli.py per page"
        )
        out = ROOT / "docs" / "editorial" / "RELEASE-APPROVED-LAST.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    # Cannibalization dispositions before rebuild
    try:
        disp = apply_cannibalization_dispositions(pages, approved)
        if disp:
            save_registry(reg)
            report["actions"].append("cannibalization_dispositions")
            report["cannibalization"] = disp
        else:
            report["actions"].append("cannibalization_none_recorded")
    except Exception as exc:  # noqa: BLE001
        report["blocked"].append(f"cannibalization_failed:{exc}")

    # Rebuild editorial (updates robots/sitemaps for indexable set)
    try:
        from scripts.editorial.build import build as editorial_build

        br = editorial_build()
        report["actions"].append("editorial_build")
        report["build"] = {
            "ok": br.get("ok"),
            "indexable_count": br.get("indexable_count"),
            "indexable_urls": br.get("indexable_urls"),
            "sitemap_counts": br.get("sitemap_counts"),
        }
        for u in br.get("indexable_urls") or []:
            # Absolute production URLs for GSC human submit list
            path = str(u)
            if path.startswith("http://") or path.startswith("https://"):
                report["gsc_submit_candidates"].append(path)
            else:
                report["gsc_submit_candidates"].append(
                    f"https://confenge.com.br{path if path.startswith('/') else '/' + path}"
                )
        report["actions"].append("robots_sitemaps_via_editorial_build")
        post_truth = derive_editorial_truth(load_registry())
        release = post_truth.get("release") or {}
        report.update(
            {
                "approved_count": release.get("approved_count", report["approved_count"]),
                "released_count": release.get("released_count", report["released_count"]),
                "cohort_complete": release.get("cohort_complete", False),
                "released_page_ids": release.get("released_page_ids", report["released_page_ids"]),
                "awaiting_page_ids": release.get("awaiting_page_ids", report["awaiting_page_ids"]),
            }
        )
    except Exception as exc:  # noqa: BLE001
        report["ok"] = False
        report["blocked"].append(f"build_failed:{exc}")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    # Tests
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

    # Optional PR
    if os.environ.get("RELEASE_OPEN_PR") == "1" and report["ok"]:
        try:
            branch = f"release/editorial-approved-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
            subprocess.run(["git", "checkout", "-b", branch], cwd=str(ROOT), check=False)
            subprocess.run(["git", "add", "-A"], cwd=str(ROOT), check=False)
            subprocess.run(
                ["git", "commit", "-m", "release: indexable pages from valid human approvals"],
                cwd=str(ROOT),
                check=False,
            )
            subprocess.run(["git", "push", "-u", "origin", "HEAD"], cwd=str(ROOT), check=False)
            pr = subprocess.run(
                [
                    "gh",
                    "pr",
                    "create",
                    "--base",
                    "main",
                    "--title",
                    "release: editorial HUMAN_APPROVED indexable",
                    "--body",
                    "Automated release PR from editorial:release-approved. Merge to main is the Netcup release SHA; promote is the public path.",
                ],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            report["actions"].append("open_pr_attempted")
            report["pr_stdout"] = (pr.stdout or "")[:500]
            report["pr_stderr"] = (pr.stderr or "")[:300]
        except Exception as exc:  # noqa: BLE001
            report["blocked"].append(f"open_pr_failed:{exc}")

    # GSC submit list artifact
    gsc_list = ROOT / "docs" / "editorial" / "GSC-SUBMIT-CANDIDATES.json"
    gsc_list.write_text(
        json.dumps(
            {
                "generated_at": report["ts"],
                "urls": report["gsc_submit_candidates"],
                "note": "Submit in Search Console after production deploy of approved URLs",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    report["actions"].append("gsc_submit_list_written")

    out = ROOT / "docs" / "editorial" / "RELEASE-APPROVED-LAST.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
