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
import os
import re
import subprocess
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.pseo.build import build  # noqa: E402
from scripts.pseo.public_artifact import (  # noqa: E402
    PUBLIC_DIR_NAME,
    assemble_public_artifact,
    audit_public_artifact,
)
from scripts.pseo.reproducible import (  # noqa: E402
    VERSIONED_TIMESTAMP_FIELDS,
    allowlist_public_build_info,
    build_timestamp,
    collect_input_shas,
    collect_tool_versions,
    present_env_names,
    stamp_publish_identity,
    wipe_generated_identity,
)
from scripts.pseo.schema import SnapshotError, validate_snapshot  # noqa: E402
from scripts.pseo.validate import validate_all  # noqa: E402


def _deploy_commit() -> str:
    """Commit identity from deploy/CI env first; git HEAD only as local fallback.

    Prefer Netlify COMMIT_REF / CACHED_COMMIT_REF, then GITHUB_SHA, then git.
    Never mutates the working tree or requires git clean/smudge filters.
    """
    for key in ("COMMIT_REF", "CACHED_COMMIT_REF", "GITHUB_SHA", "CF_PAGES_COMMIT_SHA"):
        val = (os.environ.get(key) or "").strip()
        if val and re.fullmatch(r"[0-9a-fA-F]{7,40}", val):
            return val.lower()
    try:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).strip()
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return "unknown"


# Back-compat alias used by older call sites / tests
def _git_sha() -> str:
    return _deploy_commit()


def write_public_manifest(summary: dict, snap: dict) -> Path:
    """Safe public manifest — no DSN, scores, commercial notes, or PII."""
    manifest = snap.get("manifest") or {}
    dataset_hash = (manifest.get("dataset_hash") or summary.get("dataset_hash") or "")
    pubs = summary.get("publishable") or []
    commit = _deploy_commit()
    generated_at = build_timestamp()
    env_name = (
        os.environ.get("CONTEXT")
        or os.environ.get("NETLIFY_CONTEXT")
        or os.environ.get("NODE_ENV")
        or "local"
    )
    payload = {
        "schema_version": manifest.get("schema_version"),
        "export_version": manifest.get("export_version") or manifest.get("exporter_version"),
        "web_cfg_sha": commit,
        "snapshot_hash_short": dataset_hash[:16] if dataset_hash else None,
        "source_run_id": manifest.get("source_run_id"),
        "generated_at": generated_at,
        "data_as_of": manifest.get("data_as_of"),
        "published_page_count": len(pubs),
        "public_directory": PUBLIC_DIR_NAME,
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
    well_known = ROOT / ".well-known"
    well_known.mkdir(parents=True, exist_ok=True)
    out = well_known / "pseo-build.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Simple public build identity — no git filters, no working-tree SHA chase
    write_build_info(commit, generated_at, env_name, payload.get("schema_version"))
    return out


def write_build_info(
    commit: str,
    generated_at: str,
    environment: str,
    schema_version: str | None,
    *,
    deploy_id: str | None = None,
    artifact_hash: str | None = None,
    manifest_hash: str | None = None,
    root: Path | None = None,
) -> Path:
    """Emit /.well-known/build-info.json from deploy env / git HEAD only.

    Public identity binds a deploy to commit + artifact/manifest hash.
    Secrets and local filesystem paths are rejected.
    """
    dest_root = root or ROOT
    # DEPLOY_URL is intentionally not used: it is a host URL, not a deploy id,
    # and must not become a public identity field.
    deploy_id = deploy_id or (
        os.environ.get("DEPLOY_ID") or os.environ.get("NETLIFY_DEPLOY_ID") or None
    )
    payload = allowlist_public_build_info(
        {
            "schema_version": "1.2.0",
            "commit": commit,
            "build_time": generated_at,
            "environment": environment,
            "site_schema_version": schema_version,
            "deploy_id": deploy_id,
            "artifact_hash": artifact_hash,
            "manifest_hash": manifest_hash,
            "source": "build_site.write_build_info",
            "versioned_timestamp_fields": sorted(VERSIONED_TIMESTAMP_FIELDS),
        }
    )
    path = dest_root / ".well-known" / "build-info.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    release = dest_root / ".well-known" / "release-result.json"
    release.write_text(
        json.dumps(
            {
                "commit": commit,
                "web_cfg_sha": commit,
                "build_time": generated_at,
                "deploy_id": deploy_id,
                "artifact_hash": artifact_hash,
                "manifest_hash": manifest_hash,
                "status": "BUILT",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


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


TURNSTILE_MARKER = 'data-turnstile-sitekey=""'
TURNSTILE_SLOT = (
    '<div class="field turnstile-slot" id="turnstile-slot" hidden '
    'data-turnstile-sitekey="">'
    '<div class="cf-turnstile" data-theme="light" data-size="normal"></div>'
    "</div>"
)
_CAPTURE_FORM_RE = re.compile(
    r'(?is)<form\b(?=[^>]*\b(?:'
    r'action\s*=\s*["\'](?:/\.netlify/functions/lead|/api/web/lead)["\']'
    r'|id\s*=\s*["\']formulario-contato["\']'
    r'))[^>]*>'
)
_CLOSE_FORM_RE = re.compile(r"(?is)</form>")


def is_lead_capture_html(html: str) -> bool:
    """True when the document posts a public lead (home id or lead endpoint)."""
    return bool(_CAPTURE_FORM_RE.search(html))


def _insert_turnstile_slot(html: str) -> str:
    if TURNSTILE_MARKER in html or 'id="turnstile-slot"' in html:
        return html
    opening = _CAPTURE_FORM_RE.search(html)
    if opening is None:
        raise RuntimeError("turnstile_slot_insert_failed: capture form not found")
    closing = _CLOSE_FORM_RE.search(html, opening.end())
    if closing is None:
        raise RuntimeError("turnstile_slot_insert_failed: missing </form>")
    return html[: closing.start()] + TURNSTILE_SLOT + html[closing.start() :]


def configure_turnstile_site_key(public_root: Path, env: dict[str, str] | None = None) -> dict:
    """Ensure every capture form in the publish artifact has a Turnstile widget.

    Source HTML may omit the slot. The assembled tree receives one shared slot
    per capture document, then the public site key. Production fails closed
    without that key so a form cannot ship without a widget the backend requires.
    """
    resolved_env = os.environ if env is None else env
    context = (resolved_env.get("CONTEXT") or resolved_env.get("NETLIFY_CONTEXT") or "").strip().lower()
    site_key = (resolved_env.get("TURNSTILE_SITE_KEY") or "").strip()
    marker = TURNSTILE_MARKER

    if not site_key:
        if context == "production":
            raise RuntimeError("TURNSTILE_SITE_KEY is required for the production publish artifact")
    elif len(site_key) < 10 or len(site_key) > 200 or re.search(r"[\x00-\x1f\x7f]", site_key):
        raise RuntimeError("TURNSTILE_SITE_KEY is malformed")

    keyed = (
        f'data-turnstile-sitekey="{escape(site_key, quote=True)}"' if site_key else ""
    )
    capture_files = 0
    injected_files = 0
    html_files = sorted(path for path in public_root.rglob("*.html") if path.is_file())

    for path in html_files:
        raw = path.read_text(encoding="utf-8")
        html = raw
        capture = is_lead_capture_html(html)
        if capture:
            capture_files += 1
            html = _insert_turnstile_slot(html)
        marker_count = html.count(marker)
        if marker_count > 1:
            raise RuntimeError("Turnstile site-key marker must occur exactly once")
        if capture and marker_count != 1:
            raise RuntimeError("turnstile_slot_insert_failed: marker missing after insert")
        if site_key and marker_count == 1:
            html = html.replace(marker, keyed, 1)
            injected_files += 1
        if html != raw:
            path.write_text(html, encoding="utf-8")

    configured = bool(site_key) and injected_files > 0
    return {
        "configured": configured,
        "context": context or "local",
        "target": "index.html",
        "capture_files": capture_files,
        "injected_files": injected_files,
    }


def main(argv: list[str] | None = None) -> int:
    data_dir = ROOT / "data" / "pseo"
    errors: list[str] = []
    # Drop leftover generated identity so assemble cannot copy a prior run.
    wipe_generated_identity(ROOT)
    # Inputs that affect the public artifact — captured before generators write.
    input_shas = collect_input_shas(ROOT)
    tool_versions = collect_tool_versions()
    env_names = present_env_names()

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

    # Wave 1+ editorial engine - automated max status EDITORIAL_REVIEWED (no auto HUMAN_APPROVED)
    editorial_report: dict = {}
    try:
        from scripts.editorial.build import build as editorial_build

        editorial_report = editorial_build()
        if editorial_report.get("sitemap_issues"):
            errors.append(
                "editorial_sitemap_issues:" + ",".join(editorial_report["sitemap_issues"][:5])
            )
        # Material package must match the registry after editorial_build recalculates
        # hashes. This prevents a changed page from carrying an old human decision.
        from scripts.editorial.truth import assert_truth_consistent

        truth_failures = assert_truth_consistent()
        if truth_failures:
            errors.extend(f"editorial_truth:{failure}" for failure in truth_failures)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL-CLOSED editorial build: {exc}", file=sys.stderr)
        return 2

    # Public copy: strip AI-tell em-dashes from visitor HTML after generators run.
    # Official source titles (Planalto/TCU/Lei…) may keep —.
    try:
        from scripts.site.scrub_em_dashes import iter_public_html, scrub_html

        scrubbed = 0
        for path in iter_public_html(ROOT):
            raw = path.read_text(encoding="utf-8")
            cleaned = scrub_html(raw)
            if cleaned != raw:
                path.write_text(cleaned, encoding="utf-8")
                scrubbed += 1
        print(f"public copy scrub: rewrote {scrubbed} html file(s)")
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL-CLOSED public copy scrub: {exc}", file=sys.stderr)
        return 2

    man_path = write_public_manifest(summary, snap)

    # Assemble _site BEFORE validate/editorial so audits see the public artifact
    artifact = assemble_public_artifact(ROOT)
    if not artifact.get("ok"):
        errors.extend(artifact.get("errors") or ["assemble_public_artifact failed"])

    turnstile_config: dict = {}
    try:
        turnstile_config = configure_turnstile_site_key(ROOT / PUBLIC_DIR_NAME)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"turnstile_publish_config_failed:{exc}")

    # Write identity, then hash the final publish tree, then stamp those hashes.
    repro_manifest: dict = {}
    try:
        man = json.loads(man_path.read_text(encoding="utf-8"))
        env_name = (
            os.environ.get("CONTEXT")
            or os.environ.get("NETLIFY_CONTEXT")
            or os.environ.get("NODE_ENV")
            or "local"
        )
        stamped = stamp_publish_identity(
            ROOT,
            commit=_deploy_commit(),
            inputs=input_shas,
            tools=tool_versions,
            env_names=env_names,
            generated_at=man.get("generated_at") or build_timestamp(),
            environment=env_name,
            schema_version=man.get("schema_version"),
            deploy_id=os.environ.get("DEPLOY_ID") or os.environ.get("NETLIFY_DEPLOY_ID"),
            public_dir_name=PUBLIC_DIR_NAME,
        )
        repro_manifest = stamped.get("manifest") or {}
        artifact["public_artifact_hash"] = stamped.get("artifact_hash")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"build_info_enrich_failed:{exc}")

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
        # node scripts may use paths relative to cwd
        gate = run_node_gate(script)
        if not gate["ok"]:
            errors.append(f"gate failed: {script} rc={gate['returncode']}")

    audit = audit_public_artifact(ROOT)
    if not audit.get("ok"):
        errors.extend(audit.get("errors") or ["audit_public_artifact failed"])

    # Visible parity on the final `_site` artifact (not templates).
    parity_summary: dict = {}
    try:
        from scripts.site.visible_parity import dump_report, scan_site_artifact

        site_dir = ROOT / PUBLIC_DIR_NAME
        parity = scan_site_artifact(site_dir, only_index_intent=True)
        dump_report(
            parity,
            ROOT / "seo" / "visible-parity.json",
            ROOT / "seo" / "visible-parity.md",
        )
        parity_summary = {
            "ok": parity.get("ok"),
            "page_count": parity.get("page_count"),
            "defect_count": parity.get("defect_count"),
        }
        if not parity.get("ok"):
            for page in parity.get("pages") or []:
                if page.get("ok"):
                    continue
                codes = ",".join(d.get("code") or "" for d in (page.get("defects") or []))
                errors.append(f"visible_parity:{page.get('url')}:{codes}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"visible_parity_scan_failed:{exc}")

    report = {
        "ok": len(errors) == 0,
        "web_cfg_sha": _git_sha(),
        "manifest_public": str(man_path.relative_to(ROOT)),
        "public_directory": PUBLIC_DIR_NAME,
        "public_artifact_hash": artifact.get("public_artifact_hash") or audit.get("public_artifact_hash"),
        "manifest_hash": repro_manifest.get("manifest_hash"),
        "reproducible_manifest": ".well-known/build-manifest.json",
        "build_summary": {
            "dataset_hash": summary.get("dataset_hash"),
            "counts": summary.get("counts"),
            "publishable": summary.get("publishable"),
            "pages_written": summary.get("pages_written"),
        },
        "editorial_wave": {
            "ok": editorial_report.get("ok"),
            "indexable_count": editorial_report.get("indexable_count"),
            "indexable_urls": editorial_report.get("indexable_urls"),
            "sitemap_counts": editorial_report.get("sitemap_counts"),
        },
        "validate": {"ok": v.get("ok"), "error_count": len(v.get("errors") or [])},
        "visible_parity": parity_summary,
        "turnstile": turnstile_config,
        "public_artifact": {
            "assembled": True,
            "audit_ok": audit.get("ok"),
            "file_count": audit.get("file_count"),
            "finding_count": len(audit.get("findings") or []),
        },
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
