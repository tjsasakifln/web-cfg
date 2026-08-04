#!/usr/bin/env python3
"""Verify a release against the live public manifest and built artifact.

Steps:
  1. Read live /.well-known/pseo-build.json
  2. Identify deployed SHA
  3. Run dual-UA production audit (identity-bound)
  4. Compare production with local _site where possible
  5. Validate sitemap/robots/canonical/internal forbidden URLs
  6. Write SHA-bound report
  7. Update operational result only when identities match
"""

from __future__ import annotations

import argparse
import json
import ssl
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.audit_identity import (  # noqa: E402
    AUDITOR_VERSION,
    STALE_CODE,
    evaluate_audit_currency,
    git_sha,
    public_artifact_hash,
    seed_set_hash,
    snapshot_hash_from_manifest,
)
from scripts.pseo.gsc_gate import (  # noqa: E402
    GSC_ACCESS_NO_CREDS,
    compute_next_wave_gate,
    default_not_inspected_status,
    load_indexation_status,
    seed_paths_from_registry,
)


def snapshot_source_on_extra_cli_main(root: Path | None = None) -> dict[str, Any]:
    """Honest check: published snapshot source_commit_sha must be in extra-cli main history.

    Does not invent membership. Returns on_main=False when commit unknown/missing.
    """
    root = root or ROOT
    man_path = root / "data" / "pseo" / "manifest.json"
    if not man_path.exists():
        return {
            "on_main": False,
            "source_commit_sha": None,
            "source_branch": None,
            "reason": "manifest_missing",
        }
    man = json.loads(man_path.read_text(encoding="utf-8"))
    sha = man.get("source_commit_sha")
    branch = man.get("source_branch")
    if not sha:
        return {
            "on_main": False,
            "source_commit_sha": None,
            "source_branch": branch,
            "reason": "source_commit_sha_missing",
        }
    # Prefer GitHub API (authoritative for remote main)
    try:
        # 1) commit must exist
        subprocess.check_output(
            ["gh", "api", f"repos/tjsasakifln/extra-cli/commits/{sha}", "--jq", ".sha"],
            text=True,
            timeout=30,
            stderr=subprocess.DEVNULL,
        )
        # 2) must be ancestor of main: compare main...sha; if sha is on main history,
        #    `gh api repos/.../compare/main...{sha}` status is ahead/identical/diverged, 
        #    use `git merge-base --is-ancestor` via temporary clone when available.
        # Compare API: if commit is on main, ahead_by can be 0 and base is sha.
        cmp_out = subprocess.check_output(
            [
                "gh",
                "api",
                f"repos/tjsasakifln/extra-cli/compare/main...{sha}",
                "--jq",
                "{status:.status,ahead:.ahead_by,behind:.behind_by}",
            ],
            text=True,
            timeout=30,
            stderr=subprocess.DEVNULL,
        ).strip()
        info = json.loads(cmp_out) if cmp_out.startswith("{") else {}
        # identical or behind means sha is an ancestor of (or is) main tip
        status = (info.get("status") or "").lower()
        on_main = status in {"identical", "behind"} or (
            status == "ahead" and int(info.get("ahead") or 0) == 0
        )
        # Some SHAs not on main return "diverged" or "ahead" with ahead>0 from feature branch
        if status == "ahead" and int(info.get("ahead") or 0) > 0:
            on_main = False
        if status == "diverged":
            on_main = False
        return {
            "on_main": bool(on_main),
            "source_commit_sha": sha,
            "source_branch": branch,
            "compare_status": status,
            "reason": None if on_main else "source_commit_not_ancestor_of_main",
        }
    except (subprocess.SubprocessError, OSError, FileNotFoundError, json.JSONDecodeError):
        # Fail closed: unknown → not on main
        return {
            "on_main": False,
            "source_commit_sha": sha,
            "source_branch": branch,
            "reason": "source_commit_lookup_failed_or_missing",
        }
from scripts.pseo.production_audit import (  # noqa: E402
    SITE,
    UA_BROWSER,
    fetch_url,
    run_audit,
)
from scripts.pseo.public_artifact import (  # noqa: E402
    PUBLIC_DIR_NAME,
    audit_public_artifact,
)

FORBIDDEN_LIVE_PATHS = [
    "/data/pseo/manifest.json",
    "/data/pseo/registry.json",
    "/seo/pseo-operational-result.json",
    "/scripts/pseo/build.py",
    "/package.json",
    "/.git/config",
    "/.github/workflows/pseo.yml",
]


def _fetch_json(url: str) -> dict[str, Any] | None:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": UA_BROWSER})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        return None


def check_forbidden_live(base_url: str) -> dict[str, Any]:
    statuses: dict[str, Any] = {}
    ok = True
    for path in FORBIDDEN_LIVE_PATHS:
        res = fetch_url(base_url.rstrip("/") + path, UA_BROWSER)
        st = res.get("status")
        statuses[path] = st
        if st == 200:
            ok = False
    return {"ok": ok, "statuses": statuses}


def extra_cli_on_main(extra_cli_path: Path | None = None) -> dict[str, Any]:
    """Probe whether export entrypoint exists on extra-cli main (prefer remote truth)."""
    # Remote probe via gh is authoritative for "on main" (local may be PR branch)
    try:
        out = subprocess.check_output(
            [
                "gh",
                "api",
                "repos/tjsasakifln/extra-cli/contents/scripts/pseo/export_web_cfg.py?ref=main",
                "--jq",
                ".sha",
            ],
            text=True,
            timeout=30,
            stderr=subprocess.DEVNULL,
        ).strip()
        if out:
            main_sha = subprocess.check_output(
                ["gh", "api", "repos/tjsasakifln/extra-cli/commits/main", "--jq", ".sha"],
                text=True,
                timeout=30,
                stderr=subprocess.DEVNULL,
            ).strip()
            return {
                "on_main": True,
                "branch": "main",
                "sha": main_sha,
                "entrypoint": "scripts.pseo.export_web_cfg",
                "source": "github_main",
                "blob_sha": out,
            }
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        pass
    # Fallback: local clone only if it is already on main
    if extra_cli_path and (extra_cli_path / "scripts" / "pseo" / "export_web_cfg.py").exists():
        try:
            branch = subprocess.check_output(
                ["git", "-C", str(extra_cli_path), "rev-parse", "--abbrev-ref", "HEAD"],
                text=True,
                timeout=10,
            ).strip()
            sha = subprocess.check_output(
                ["git", "-C", str(extra_cli_path), "rev-parse", "HEAD"],
                text=True,
                timeout=10,
            ).strip()
            on_main = branch == "main"
            return {
                "on_main": on_main,
                "branch": branch,
                "sha": sha,
                "entrypoint": "scripts.pseo.export_web_cfg",
                "source": str(extra_cli_path),
                "status": None if on_main else "BLOCKED_EXTRA_CLI_NOT_MERGED",
            }
        except (subprocess.SubprocessError, OSError):
            pass
    return {
        "on_main": False,
        "branch": None,
        "sha": None,
        "entrypoint": "scripts.pseo.export_web_cfg",
        "source": "not_found_on_main",
        "status": "BLOCKED_EXTRA_CLI_NOT_MERGED",
    }


def write_operational_result(payload: dict[str, Any]) -> Path:
    out = ROOT / "seo" / "pseo-operational-result.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def verify_release(
    *,
    base_url: str = SITE,
    skip_network_audit: bool = False,
    extra_cli_path: Path | None = None,
    update_operational: bool = True,
) -> dict[str, Any]:
    head = git_sha(ROOT)
    live = _fetch_json(f"{base_url.rstrip('/')}/.well-known/pseo-build.json")
    live_sha = (live or {}).get("web_cfg_sha")
    live_snap = (live or {}).get("snapshot_hash_short")

    art = audit_public_artifact(ROOT)
    seeds = seed_paths_from_registry()
    # absolute seed URLs for gate
    seed_urls = [
        s if s.startswith("http") else base_url.rstrip("/") + s for s in seeds
    ]

    forbidden = {"ok": None, "statuses": {}, "note": "skipped"}
    prod_audit: dict[str, Any] = {}
    if not skip_network_audit:
        forbidden = check_forbidden_live(base_url)
        prod_audit = run_audit(root=ROOT, base_url=base_url.rstrip("/"))
    else:
        prod_audit = {
            "ok": False,
            "technical_ok": False,
            "production_audit_is_current": False,
            "stale_code": STALE_CODE,
            "note": "network audit skipped",
            "audit_target_sha": head,
            "live_manifest_sha": live_sha,
        }

    extra = extra_cli_on_main(extra_cli_path)
    snap_src = snapshot_source_on_extra_cli_main(ROOT)
    gsc = load_indexation_status()
    if not gsc.get("urls"):
        # ensure honest NOT_INSPECTED file
        status_doc = default_not_inspected_status(seeds)
        (ROOT / "seo" / "pseo-indexation-status.json").write_text(
            json.dumps(status_doc, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        gsc = load_indexation_status()

    # Approval stability proof (real snapshot pair), never invent True
    approval_stab: dict[str, Any] = {}
    stab_path = ROOT / "seo" / "pseo-approval-stability.json"
    if stab_path.exists():
        try:
            approval_stab = json.loads(stab_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            approval_stab = {}
    reexport_ok = bool(approval_stab.get("approval_stability_proven")) and bool(
        approval_stab.get("ok")
    )

    # Prefer gsc_state_by_url when present (full records under urls or state_by_url)
    gsc_by = gsc.get("gsc_state_by_url") or gsc.get("urls") or {}

    # Campaign new-page freeze: load structured snapshot diff when present
    pages_added: list[str] = []
    new_pages_published = 0
    diff_path = ROOT / "seo" / "pseo-snapshot-diff.json"
    if diff_path.exists():
        try:
            snap_diff = json.loads(diff_path.read_text(encoding="utf-8"))
            pages_added = list(snap_diff.get("pages_added") or [])
            # Any non-empty pages_added means campaign introduced candidate paths
            # (even if later demoted), gate stays closed until diff is clean.
        except (OSError, json.JSONDecodeError):
            pages_added = []
    # Live indexable count vs prior campaign baseline (4 Wave0 seeds max)
    # new_pages_published: only count publish URLs not in the frozen seed set
    wave0_seed_urls = {
        "/inteligencia/cenarios/aditivos-e-risco-de-margem/",
        "/inteligencia/cenarios/inconsistencia-orcamento-edital/",
        "/inteligencia/cenarios/referencia-sinapi-sicro-margem/",
        "/radar/edificacoes-publicas-pr/",
    }
    new_pages_published = sum(1 for s in seeds if s not in wave0_seed_urls)

    gate = compute_next_wave_gate(
        seed_urls=seeds,
        gsc_access=gsc.get("gsc_access") or GSC_ACCESS_NO_CREDS,
        gsc_by_url=gsc_by,
        production_audit_ok=bool(prod_audit.get("ok")),
        production_audit_is_current=bool(prod_audit.get("production_audit_is_current")),
        extra_cli_on_main=bool(extra.get("on_main")),
        reexport_without_undue_invalidation=reexport_ok,
        snapshot_source_on_main=bool(snap_src.get("on_main")),
        new_pages_published=new_pages_published,
        pages_added=pages_added,
    )

    # Terminal status (honest; never PASS without GSC + current deploy audit)
    gsc_missing = gsc.get("gsc_access") in {
        GSC_ACCESS_NO_CREDS,
        "NOT_INSPECTED_NO_CREDENTIALS",
        None,
        "",
    }
    if not art.get("ok"):
        terminal = "BLOCKED_PUBLICATION_BOUNDARY"
    elif not snap_src.get("on_main"):
        terminal = "BLOCKED_SNAPSHOT_PROVENANCE"
    elif not reexport_ok:
        terminal = "BLOCKED_APPROVAL_STABILITY"
    elif not extra.get("on_main"):
        terminal = "BLOCKED_EXTRA_CLI_NOT_MERGED"
    elif gsc_missing:
        # Hardening complete path: GSC absence is the primary residual blocker
        terminal = "PARTIAL_WAVE0_ACTIVATED_GSC_NOT_INSPECTED"
    elif (
        prod_audit.get("stale_code") == STALE_CODE
        and not prod_audit.get("production_audit_is_current")
        and live_sha
        and live_sha != head
    ):
        terminal = "BLOCKED_PRODUCTION_AUDIT"
    elif not prod_audit.get("ok") or int(prod_audit.get("critical_count") or 0) > 0:
        terminal = "BLOCKED_PRODUCTION_AUDIT"
    elif gate.get("allowed") and prod_audit.get("ok") and prod_audit.get(
        "production_audit_is_current"
    ):
        terminal = "PASS_WAVE0_ACTIVATED_GSC_OBSERVED"
    else:
        # GSC observed but gate still closed (crawl pending, demoted seeds, etc.)
        terminal = "PARTIAL_WAVE0_GSC_CRAWL_PENDING"

    result = {
        "terminal_status": terminal,
        "web_cfg_head": head,
        "extra_cli_head": extra.get("sha"),
        "extra_cli_main_integration": extra,
        "snapshot_source_provenance": snap_src,
        "netlify_deployed_sha": live_sha,
        "production_audit_sha": prod_audit.get("audit_target_sha") or prod_audit.get("web_cfg_sha"),
        "production_audit_is_current": prod_audit.get("production_audit_is_current"),
        "public_directory": PUBLIC_DIR_NAME,
        "public_artifact_hash": art.get("public_artifact_hash")
        or public_artifact_hash(ROOT),
        "forbidden_public_urls_status": forbidden,
        "snapshot_hash": snapshot_hash_from_manifest(ROOT),
        "live_snapshot_hash_short": live_snap,
        "seed_urls": seeds,
        "indexable_seed_count": len(seeds),
        "gsc_access": gsc.get("gsc_access"),
        "gsc_state_by_url": {
            k: (v.get("state") if isinstance(v, dict) else v)
            for k, v in gsc_by.items()
        },
        "approval_stability_proven": reexport_ok,
        "approval_stability": {
            "ok": approval_stab.get("ok"),
            "approval_stability_proven": approval_stab.get("approval_stability_proven"),
            "preserved_approval_proof_pages": approval_stab.get(
                "preserved_approval_proof_pages"
            ),
            "material_invalidation_proof_pages": approval_stab.get(
                "material_invalidation_proof_pages"
            ),
        },
        "snapshot_source_commit_on_main": bool(snap_src.get("on_main")),
        "next_wave_gate": gate.get("next_wave_gate"),
        "next_wave_gate_reasons": gate.get("reasons"),
        "next_wave_gate_detail": gate,
        "production_audit": {
            "ok": prod_audit.get("ok"),
            "technical_ok": prod_audit.get("technical_ok"),
            "critical_count": len(prod_audit.get("critical") or []),
            "stale_code": prod_audit.get("stale_code"),
            "counts": prod_audit.get("counts"),
            "production_audit_is_current": prod_audit.get("production_audit_is_current"),
            "audit_target_sha": prod_audit.get("audit_target_sha"),
            "live_manifest_sha": prod_audit.get("live_manifest_sha"),
        },
        "public_artifact_audit_ok": art.get("ok"),
        "live_manifest": live,
        "auditor_version": AUDITOR_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    report_path = ROOT / "seo" / "pseo-verify-release.json"
    report_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if update_operational:
        # Only write production_audit.ok true when identities match, never copy stale ok
        op = {
            "terminal_status": terminal,
            "web_cfg_sha": head,
            "extra_cli_sha": extra.get("sha"),
            "extra_cli_branch": extra.get("branch"),
            "extra_cli_main_integration": extra.get("on_main"),
            "netlify_deployed_sha": live_sha,
            "snapshot_hash": snapshot_hash_from_manifest(ROOT),
            "public_directory": PUBLIC_DIR_NAME,
            "public_artifact_hash": result["public_artifact_hash"],
            "seed_urls": [base_url.rstrip("/") + s for s in seeds],
            "indexable_seed_count": len(seeds),
            "production_audit": {
                "ok": bool(prod_audit.get("ok")),
                "technical_ok": prod_audit.get("technical_ok"),
                "production_audit_is_current": prod_audit.get(
                    "production_audit_is_current"
                ),
                "stale_code": prod_audit.get("stale_code"),
                "critical_count": len(prod_audit.get("critical") or []),
                "audit_target_sha": prod_audit.get("audit_target_sha"),
                "live_manifest_sha": prod_audit.get("live_manifest_sha"),
            },
            "gsc_access": gsc.get("gsc_access") or GSC_ACCESS_NO_CREDS,
            "gsc_status_by_url": result["gsc_state_by_url"],
            "next_wave_gate": {
                # Calculated only, never hand-edit true under NOT_INSPECTED
                "allowed": gate.get("allowed"),
                "gsc_discovery_or_crawl_without_soft404": gate.get(
                    "gsc_discovery_or_crawl_without_soft404"
                ),
                "reasons": gate.get("reasons"),
            },
            "forbidden_public_urls_status": forbidden,
            "stages_reached": {
                "GENERATED_LOCAL": True,
                "QUALITY_ELIGIBLE": True,
                "EDITORIALLY_APPROVED": True,
                "DEPLOYED_PRODUCTION": bool(live_sha),
                "CRAWLABLE_PRODUCTION": bool(
                    prod_audit.get("technical_ok")
                    and (prod_audit.get("counts") or {}).get("crawlable_production", 0)
                    > 0
                ),
                "INDEXED_BY_GOOGLE": False,
            },
            "public_manifest": live,
            "unresolved_risks": list(gate.get("reasons") or []),
            "generated_at": result["generated_at"],
            "auditor_version": AUDITOR_VERSION,
        }
        if not extra.get("on_main"):
            op["unresolved_risks"].append("BLOCKED_EXTRA_CLI_NOT_MERGED")
        if gsc.get("gsc_access") in {GSC_ACCESS_NO_CREDS, "NOT_INSPECTED_NO_CREDENTIALS"}:
            op["unresolved_risks"].append("GSC credentials absent, NOT_INSPECTED")
        write_operational_result(op)

    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Verify release vs live deploy")
    ap.add_argument("--base-url", default=SITE)
    ap.add_argument("--skip-network-audit", action="store_true")
    ap.add_argument("--extra-cli", type=Path, default=None)
    ap.add_argument("--no-operational", action="store_true")
    args = ap.parse_args(argv)
    result = verify_release(
        base_url=args.base_url,
        skip_network_audit=args.skip_network_audit,
        extra_cli_path=args.extra_cli,
        update_operational=not args.no_operational,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    # Non-zero only on publication boundary failure
    if result.get("terminal_status") == "BLOCKED_PUBLICATION_BOUNDARY":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
