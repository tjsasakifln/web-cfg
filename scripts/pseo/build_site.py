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
import shutil
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
from scripts.site.responsive_text import mark_opaque_tokens_in_html_text  # noqa: E402


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


# --- prototype isolation (#507, pre-condition P4 of #494) -------------------
# Versioned design prototypes are working material, not a public surface. They
# live here and nowhere else, so "is this a prototype?" is a path question with
# one answer instead of a judgement call per file.
PROTOTYPE_SOURCE_DIR = "docs/design-audit/prototypes"
# The two path segments that identify a prototype inside the built artifact.
# Matching on the segment pair catches both a straight `docs/` copy and a
# prototype promoted one level up during assembly.
PROTOTYPE_PATH_SEGMENTS = ("design-audit", "prototypes")


def prototype_source_root(root: Path | None = None) -> Path:
    """The single directory that may hold design prototypes."""
    return (root or ROOT) / PROTOTYPE_SOURCE_DIR


def is_prototype_public_path(relative_path: str) -> bool:
    """True when a path inside the public artifact belongs to a prototype."""
    parts = relative_path.replace("\\", "/").strip("/").split("/")
    head, tail = PROTOTYPE_PATH_SEGMENTS
    return any(
        parts[index] == head and parts[index + 1] == tail
        for index in range(len(parts) - 1)
    )


def iter_prototype_leaks(public_root: Path) -> list[str]:
    """Relative paths under the public artifact that belong to a prototype."""
    if not public_root.is_dir():
        return []
    leaks: list[str] = []
    for path in public_root.rglob("*"):
        relative = path.relative_to(public_root).as_posix()
        if is_prototype_public_path(relative):
            leaks.append(relative)
    return sorted(leaks)


def enforce_prototype_isolation(public_root: Path) -> dict:
    """Keep every prototype path out of the built `_site`, fail-closed.

    A leak is removed so the artifact that ships is safe, and reported so the
    build still fails: a prototype reaching the artifact means the source
    allowlist regressed, and an unregistered route is a conversion-gate failure
    that would otherwise be found late and as the wrong error.
    """
    leaks = iter_prototype_leaks(public_root)
    removed: list[str] = []
    for relative in leaks:
        target = public_root / relative
        if not target.exists() and not target.is_symlink():
            continue
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink()
        removed.append(relative)
    remaining = iter_prototype_leaks(public_root)
    if remaining:
        raise RuntimeError(
            "prototype_isolation_failed: "
            + ",".join(remaining[:5])
        )
    return {
        "source": PROTOTYPE_SOURCE_DIR,
        "public_directory": public_root.name,
        "leaked": bool(removed),
        "removed": removed,
    }


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


TURNSTILE_SLOT = (
    '<div class="field turnstile-slot" id="turnstile-slot" hidden '
    'data-turnstile-sitekey="">'
    '<div class="cf-turnstile" data-theme="light" data-size="compact"></div>'
    "</div>"
)
_CAPTURE_FORM_RE = re.compile(
    r'(?is)<form\b(?=[^>]*\b(?:'
    r'action\s*=\s*["\'](?:/\.netlify/functions/lead|/api/web/lead)["\']'
    r'|id\s*=\s*["\']formulario-contato["\']'
    r'|data-turnstile-required\s*=\s*["\']true["\']'
    r'))[^>]*>'
)
_CLOSE_FORM_RE = re.compile(r"(?is)</form>")
_TURNSTILE_MARKER_RE = re.compile(
    r"(?i)\bdata-turnstile-sitekey\s*=\s*(?P<quote>[\"'])\s*(?P=quote)"
)
_TURNSTILE_SLOT_ID_RE = re.compile(
    r"(?i)\bid\s*=\s*[\"']turnstile-slot[\"']"
)
_TURNSTILE_WIDGET_RE = re.compile(
    r"(?i)\bclass\s*=\s*[\"'][^\"']*\bcf-turnstile\b[^\"']*[\"']"
)
_CURRENCY_BREAKABLE_GAP_RE = re.compile(r"R\$[\t\r\n ]+(?=\d)")
_NO_JS_BOOTSTRAP = "<script>document.documentElement.classList.replace('no-js','js');</script>"


def _html_tag_end(html: str, start: int) -> int:
    """Return the byte-preserving end of one HTML tag, respecting quotes."""
    quote = ""
    cursor = start + 1
    while cursor < len(html):
        char = html[cursor]
        if quote:
            if char == quote:
                quote = ""
        elif char in ("'", '"'):
            quote = char
        elif char == ">":
            return cursor + 1
        cursor += 1
    return len(html)


def _map_visible_html_text(html: str, transform, *, skip_opaque: bool = False) -> str:
    """Transform text nodes while preserving tags and raw script/style bytes."""
    output: list[str] = []
    lower = html.lower()
    cursor = 0
    element_stack: list[tuple[str, bool]] = []
    opaque_depth = 0
    void_elements = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }

    def mapped(text: str) -> str:
        return text if skip_opaque and opaque_depth else transform(text)

    while cursor < len(html):
        tag_start = html.find("<", cursor)
        if tag_start < 0:
            output.append(mapped(html[cursor:]))
            break
        output.append(mapped(html[cursor:tag_start]))
        if lower.startswith("<!--", tag_start):
            comment_end = html.find("-->", tag_start + 4)
            tag_end = len(html) if comment_end < 0 else comment_end + 3
            output.append(html[tag_start:tag_end])
            cursor = tag_end
            continue
        tag_end = _html_tag_end(html, tag_start)
        tag = html[tag_start:tag_end]
        raw_match = re.match(r"(?is)<\s*(script|style)\b", tag)
        if raw_match:
            raw_name = raw_match.group(1).lower()
            close_start = lower.find(f"</{raw_name}", tag_end)
            if close_start < 0:
                output.append(html[tag_start:])
                break
            close_end = _html_tag_end(html, close_start)
            output.append(html[tag_start:close_end])
            cursor = close_end
            continue
        output.append(tag)
        if skip_opaque:
            closing = re.match(r"(?is)<\s*/\s*([a-z][\w:-]*)", tag)
            opening = re.match(r"(?is)<\s*([a-z][\w:-]*)", tag)
            if closing:
                closing_name = closing.group(1).lower()
                while element_stack:
                    name, was_opaque = element_stack.pop()
                    if was_opaque:
                        opaque_depth -= 1
                    if name == closing_name:
                        break
            elif opening:
                opening_name = opening.group(1).lower()
                is_void = opening_name in void_elements or bool(re.search(r"/\s*>$", tag))
                if not is_void:
                    is_opaque = (
                        opening_name in {"code", "pre", "kbd", "samp"}
                        or bool(re.search(r"(?is)\bdata-opaque-token(?:\s*=|\s|>)", tag))
                        or bool(re.search(r"(?is)\bclass\s*=\s*([\"'])[^\"']*\bopaque-token\b", tag))
                    )
                    element_stack.append((opening_name, is_opaque))
                    if is_opaque:
                        opaque_depth += 1
        cursor = tag_end
    return "".join(output)


def atomize_visible_currency(html: str) -> str:
    """Bind `R$` to its number in visible copy without changing source data."""
    return _map_visible_html_text(
        html,
        lambda text: _CURRENCY_BREAKABLE_GAP_RE.sub("R$&nbsp;", text),
    )


def mark_visible_opaque_tokens(html: str) -> str:
    """Opt machine-like visible tokens into safe mid-token wrapping."""
    return _map_visible_html_text(
        html,
        mark_opaque_tokens_in_html_text,
        skip_opaque=True,
    )


def ensure_progressive_enhancement_marker(html: str) -> str:
    """Give every shell a deterministic JS-on and useful JS-off state."""
    html_match = re.search(r"(?is)<html\b[^>]*>", html)
    if html_match is None:
        raise RuntimeError("responsive_html_missing_html_element")
    html_tag = html_match.group(0)
    class_match = re.search(r"(?is)\bclass\s*=\s*([\"'])(.*?)\1", html_tag)
    if class_match:
        classes = class_match.group(2).split()
        if "no-js" not in classes:
            classes.append("no-js")
            replacement = (
                html_tag[:class_match.start(2)]
                + " ".join(classes)
                + html_tag[class_match.end(2):]
            )
            html = html[:html_match.start()] + replacement + html[html_match.end():]
    else:
        replacement = html_tag[:-1] + ' class="no-js">'
        html = html[:html_match.start()] + replacement + html[html_match.end():]
    if _NO_JS_BOOTSTRAP not in html:
        head_match = re.search(r"(?is)<head\b[^>]*>", html)
        if head_match is None:
            raise RuntimeError("responsive_html_missing_head_element")
        html = html[:head_match.end()] + "\n" + _NO_JS_BOOTSTRAP + html[head_match.end():]
    return html


def normalize_responsive_public_html(public_root: Path) -> dict[str, int]:
    """Apply reversible, text-only responsive invariants before artifact hash."""
    files = 0
    currency_files = 0
    opaque_token_files = 0
    marker_files = 0
    for path in sorted(public_root.rglob("*.html")):
        raw = path.read_text(encoding="utf-8")
        with_currency = atomize_visible_currency(raw)
        with_opaque_tokens = mark_visible_opaque_tokens(with_currency)
        normalized = ensure_progressive_enhancement_marker(with_opaque_tokens)
        files += 1
        if with_currency != raw:
            currency_files += 1
        if with_opaque_tokens != with_currency:
            opaque_token_files += 1
        if normalized != with_opaque_tokens:
            marker_files += 1
        if normalized != raw:
            path.write_text(normalized, encoding="utf-8")
    return {
        "files": files,
        "currency_files": currency_files,
        "opaque_token_files": opaque_token_files,
        "marker_files": marker_files,
    }


def is_lead_capture_html(html: str) -> bool:
    """True for a public lead form or an explicitly protected intake action."""
    return bool(_CAPTURE_FORM_RE.search(html))


def _capture_form_bounds(html: str) -> tuple[int, int, int]:
    openings = list(_CAPTURE_FORM_RE.finditer(html))
    if not openings:
        raise RuntimeError("turnstile_slot_insert_failed: capture form not found")
    if len(openings) != 1:
        raise RuntimeError("turnstile_slot_insert_failed: multiple capture forms")
    opening = openings[0]
    closing = _CLOSE_FORM_RE.search(html, opening.end())
    if closing is None:
        raise RuntimeError("turnstile_slot_insert_failed: missing </form>")
    return opening.end(), closing.start(), closing.end()


def _ensure_turnstile_slot(html: str) -> str:
    form_start, form_end, _ = _capture_form_bounds(html)
    marker_matches = list(_TURNSTILE_MARKER_RE.finditer(html))
    slot_matches = list(_TURNSTILE_SLOT_ID_RE.finditer(html))
    widget_matches = list(_TURNSTILE_WIDGET_RE.finditer(html))

    def inside_form(match: re.Match[str]) -> bool:
        return form_start <= match.start() < form_end

    marker_inside = [match for match in marker_matches if inside_form(match)]
    slot_inside = [match for match in slot_matches if inside_form(match)]
    widget_inside = [match for match in widget_matches if inside_form(match)]

    if marker_matches and len(marker_inside) != len(marker_matches):
        raise RuntimeError("turnstile_slot_outside_capture_form")
    if slot_matches and len(slot_inside) != len(slot_matches):
        raise RuntimeError("turnstile_slot_outside_capture_form")
    if widget_matches and len(widget_inside) != len(widget_matches):
        raise RuntimeError("turnstile_slot_outside_capture_form")

    counts = (len(marker_inside), len(slot_inside), len(widget_inside))
    if counts == (0, 0, 0):
        return html[:form_end] + TURNSTILE_SLOT + html[form_end:]
    if counts != (1, 1, 1):
        raise RuntimeError(
            "turnstile_slot_insert_failed: expected exactly one marker, slot and widget "
            "inside the capture form"
        )
    return html


def _inject_turnstile_site_key(html: str, site_key: str) -> str:
    matches = list(_TURNSTILE_MARKER_RE.finditer(html))
    if len(matches) != 1:
        raise RuntimeError("Turnstile site-key marker must occur exactly once")
    escaped = escape(site_key, quote=True)

    def keyed_marker(match: re.Match[str]) -> str:
        quote = match.group("quote")
        return f"data-turnstile-sitekey={quote}{escaped}{quote}"

    return _TURNSTILE_MARKER_RE.sub(keyed_marker, html, count=1)


def configure_turnstile_site_key(public_root: Path, env: dict[str, str] | None = None) -> dict:
    """Ensure every capture form in the publish artifact has a Turnstile widget.

    Source HTML may omit the slot. The assembled tree receives one shared slot
    per capture document, then the public site key. Production fails closed
    without that key so a form cannot ship without a widget the backend requires.
    """
    resolved_env = os.environ if env is None else env
    context = (resolved_env.get("CONTEXT") or resolved_env.get("NETLIFY_CONTEXT") or "").strip().lower()
    site_key = (resolved_env.get("TURNSTILE_SITE_KEY") or "").strip()
    if not site_key:
        if context == "production":
            raise RuntimeError("TURNSTILE_SITE_KEY is required for the production publish artifact")
    elif (
        len(site_key) < 16
        or len(site_key) > 200
        or re.search(r"[\x00-\x1f\x7f]", site_key)
        or re.search(r"fixture|placeholder|replace|example", site_key, re.IGNORECASE)
    ):
        raise RuntimeError("TURNSTILE_SITE_KEY is malformed")

    capture_files = 0
    injected_files = 0
    html_files = sorted(path for path in public_root.rglob("*.html") if path.is_file())

    for path in html_files:
        raw = path.read_text(encoding="utf-8")
        html = raw
        capture = is_lead_capture_html(html)
        if capture:
            capture_files += 1
            html = _ensure_turnstile_slot(html)
        elif (
            _TURNSTILE_MARKER_RE.search(html)
            or _TURNSTILE_SLOT_ID_RE.search(html)
            or _TURNSTILE_WIDGET_RE.search(html)
        ):
            raise RuntimeError("turnstile_slot_without_capture_form")
        if site_key and capture:
            html = _inject_turnstile_site_key(html, site_key)
            injected_files += 1
        if html != raw:
            path.write_text(html, encoding="utf-8")

    if site_key and capture_files == 0:
        raise RuntimeError("turnstile_capture_form_missing: production artifact has no lead form")
    if site_key and injected_files != capture_files:
        raise RuntimeError("turnstile_injection_incomplete")
    configured = bool(site_key) and capture_files > 0 and injected_files == capture_files
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

    live_intel_publish: dict = {}
    try:
        from scripts.live_intelligence.publish import publish as publish_live_intelligence

        live_intel_publish = publish_live_intelligence(ROOT)
        if live_intel_publish.get("ok") is False:
            errors.append(
                "live_intelligence_official_rejected:"
                + str(live_intel_publish.get("reason") or "unknown")
            )
        else:
            print(
                "live-intelligence publish: "
                + json.dumps(
                    {
                        k: live_intel_publish.get(k)
                        for k in ("skipped", "reason", "pages", "indexable", "index_ready_url")
                    },
                    ensure_ascii=False,
                )
            )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"live_intelligence_publish_failed:{exc}")

    # Assemble _site BEFORE validate/editorial so audits see the public artifact
    artifact = assemble_public_artifact(ROOT)
    if not artifact.get("ok"):
        errors.extend(artifact.get("errors") or ["assemble_public_artifact failed"])

    # Prototypes must not reach the artifact. Checked right after assembly so a
    # leak cannot be hashed, normalized or published downstream.
    prototype_isolation: dict = {}
    try:
        prototype_isolation = enforce_prototype_isolation(ROOT / PUBLIC_DIR_NAME)
        if prototype_isolation.get("leaked"):
            errors.append(
                "prototype_leak:" + ",".join(prototype_isolation.get("removed") or [])
            )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"prototype_isolation_failed:{exc}")

    responsive_html: dict[str, int] = {}
    try:
        responsive_html = normalize_responsive_public_html(ROOT / PUBLIC_DIR_NAME)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"responsive_public_html_failed:{exc}")

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
        "prototype_isolation": prototype_isolation,
        "turnstile": turnstile_config,
        "responsive_html": responsive_html,
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
