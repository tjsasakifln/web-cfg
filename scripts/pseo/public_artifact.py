#!/usr/bin/env python3
"""Assemble and audit the isolated public site artifact (_site).

The nginx/Netcup production release consumes this immutable artifact. Only
allowlisted public paths are copied; internal trees (data/, seo/, scripts/,
.git/, …) never enter the artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
PUBLIC_DIR_NAME = "_site"

# Top-level directories that may appear under the public artifact when present
# at the repo root (static commercial pages + generated pSEO + assets).
PUBLIC_TOP_DIRS = frozenset(
    {
        "assets",
        "conteudos",
        "especialista",
        "inteligencia",
        "radar",
        "privacidade",
        "termos-de-uso",
        "politica-editorial",
        "uso-de-ia",
        "conflitos",
        "confianca",
        "servicos",
        "quantitativos-orcamento-obras",
        "compatibilizacao-projetos-engenharia",
        "revisao-tecnica-projetos-engenharia",
        "projetos-complementares-engenharia",
        "parcerias-engenharia",
        "inspecao-diagnostico-edificacoes",
        "assistencia-tecnica-pericial-engenharia",
        "seguranca-trabalho-apoio-tecnico",
        "triagem-tecnica",
        "acompanhamento-contratos-obras",
        "aditivos-obras-publicas",
        "atrasos-prorrogacao-obras-publicas",
        "auditoria-orcamento-licitacao",
        "defesa-tecnica-contratos-publicos",
        "diagnostico-pre-licitacao",
        "medicoes-glosas-obras-publicas",
        "reequilibrio-obras-publicas",
        # Value communication 2040 commercial offers
        "diagnostico-b2g-360",
        "diagnostico-b2g-expansao",
        "comercial",
        "diretoria-b2g",
        "bid-room-licitacoes-obras",
        "defesa-margem-contratos-publicos",
        "metodologia-inteligencia",
        # Task-first navigation hubs (#183): destinations behind the header labels
        "servicos-obras-publicas",
        "problemas-que-resolvemos",
        # Editorial Wave 1 hubs + archetype pages
        "lei-14133-obras",
        "jurisprudencia-contratos-obras",
        "guias-contratos-obras",
        # Public operator login shell; it contains no lead data. The backing APIs
        # require a bearer token and fail closed. Exact editorial files are excluded.
        "ops",
        # High-intent tools (conversion moat)
        "ferramentas",
        "entregas",
        "nurture",
        "casos",
        "imprensa",
        # Contract-analysis family (#83). Fixture/noindex until INDEX approval.
        "analises-contratos-publicos",
        # Unapproved market-panorama drafts stay as internal generator output.
        # Re-adding this family requires an individual approval and an artifact
        # test for the exact approved route; noindex is not publication authority.
        # Live Intelligence W1 (CNPJ analysis + opportunity pages). Fixture-backed,
        # noindex until the real CONFENGE_LIVE_INTELLIGENCE contract ships.
        "analise-cnpj",
        # Opportunity fixture HTML is never packaged. The Netcup stage overlay
        # may add only official-live pages through release_control.py.
        ".well-known",
    }
)

PUBLIC_ROOT_FILES = frozenset(
    {
        "index.html",
        "404.html",
        "obrigado.html",
        "obrigado-contrato.html",
        "obrigado-edital.html",
        "obrigado-operacao.html",
        "styles.css",
        "styles-tokens.css",
        "styles-tools.css",
        "styles-offers.css",
        "styles-hubs.css",
        "script.js",
        "robots.txt",
        "_redirects",
        "_headers",
        "manifest.webmanifest",
        "feed.xml",
        "llms.txt",
        "sitemap.xml",
        "sitemap-index.xml",
        "sitemap-inteligencia.xml",
        "sitemap-editorial.xml",
        "sitemap-jurisprudencia.xml",
        "sitemap-analises-contratos.xml",
        "sitemap.txt",
        "content-index.json",
        "01ce18c7219b7c7dcb2ab06e226c2681.txt",
    }
)

# Exact internal files inside otherwise public trees. Keep this list narrow:
# /ops/ is a public login shell, but editorial material and private operator
# instructions are not visitor assets and therefore must not be copied.
PUBLIC_EXCLUDED_RELPATHS = frozenset(
    {"ops/wave1-review.html", "ops/README-data.txt"}
)

# Never copy these top-level names even if someone expands the allowlist by mistake.
FORBIDDEN_TOP = frozenset(
    {
        ".git",
        ".github",
        ".pytest_cache",
        ".benchmarks",
        ".playwright-mcp",
        ".netlify",
        ".cache",
        "data",
        "seo",
        "scripts",
        "docs",
        "node_modules",
        "tests",
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "netlify.toml",
        "DEPLOY-CHECKLIST.txt",
        "README.md",
        "AGENTS.md",
        ".env",
        ".gitignore",
    }
)

FORBIDDEN_DIR_NAMES = frozenset(
    {
        ".git",
        ".github",
        "data",
        "seo",
        "scripts",
        "docs",
        "node_modules",
        "__pycache__",
        "tests",
        ".pytest_cache",
    }
)

FORBIDDEN_EXTENSIONS = frozenset(
    {
        ".py",
        ".sql",
        ".log",
        ".env",
        ".md",
        ".pyc",
        ".pyo",
        ".sh",
        ".toml",
        ".yml",
        ".yaml",
        ".ini",
        ".cfg",
    }
)

FORBIDDEN_BASENAMES = frozenset(
    {
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "netlify.toml",
        "pytest.ini",
        "conftest.py",
        ".env",
        "registry.json",
        "manifest.json",  # private snapshot only; public uses .well-known/pseo-build.json
    }
)

# Paths under _site that must never exist (pipeline / internal surfaces)
FORBIDDEN_PUBLIC_PATH_PREFIXES = (
    "data/",
    "seo/",
    "scripts/",
    ".git/",
    ".github/",
    "docs/",
    "node_modules/",
    "tests/",
)

SECRET_PATTERNS = [
    re.compile(r"(?i)postgres(ql)?://[^\s\"']+"),
    re.compile(r"(?i)mysql://[^\s\"']+"),
    re.compile(r"(?i)mongodb(\+srv)?://[^\s\"']+"),
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['\"][^'\"]{8,}"),
    re.compile(r"(?i)-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)Bearer\s+[A-Za-z0-9\-_]{20,}"),
    re.compile(r"/home/[a-z0-9_]+/"),
    re.compile(r"/mnt/[a-z0-9_]+/"),
    re.compile(r"[A-Za-z]:\\\\Users\\\\"),
    re.compile(r"(?i)pncp_supplier_contracts"),
    re.compile(r"(?i)site-confenge-guides"),
]

TEXT_SCAN_SUFFIXES = frozenset(
    {".html", ".js", ".css", ".json", ".xml", ".txt", ".webmanifest", ".map"}
)

def public_dir(root: Path | None = None) -> Path:
    return (root or ROOT) / PUBLIC_DIR_NAME


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_tree(base: Path) -> str:
    """Deterministic hash of relative paths + normalized content hashes."""
    from scripts.pseo.reproducible import content_tree_hash

    if not base.exists():
        return hashlib.sha256(b"").hexdigest()
    return content_tree_hash(base)


def finalize_public_artifact(
    dest: Path,
    *,
    commercial_media_source_root: Path | None = None,
    require_commercial_media_assets: bool = False,
) -> dict[str, Any]:
    """Apply the complete deterministic HTML/CSS transform used at publish time.

    This is deliberately shared with approval hashing: an INDEX approval is
    bound to the bytes after copy normalization, navigation promotion and CSS
    fingerprinting, not to an earlier source-page snapshot.
    """
    from scripts.site.scrub_em_dashes import scrub_html
    from scripts.site.structured_identity import sanitize_tree

    scrubbed = 0
    for html_path in sorted(Path(dest).rglob("*.html")):
        raw = html_path.read_text(encoding="utf-8")
        cleaned = scrub_html(raw)
        if cleaned != raw:
            html_path.write_text(cleaned, encoding="utf-8")
            scrubbed += 1

    structured_identity = sanitize_tree(Path(dest))

    from scripts.site.public_navigation import (
        audit_public_navigation_tree,
        promote_public_navigation_tree,
    )

    promoted_navigation_files = promote_public_navigation_tree(dest)
    navigation_audit = audit_public_navigation_tree(dest)
    from scripts.site.fingerprint_css import fingerprint_published_css

    css_assets = fingerprint_published_css(dest)
    from scripts.site.version_commercial_media import (
        SOURCE_MANIFEST as COMMERCIAL_MEDIA_SOURCE_MANIFEST,
        version_commercial_media_references,
    )

    media_source_root = (commercial_media_source_root or ROOT).resolve()
    media_contract_present = (media_source_root / COMMERCIAL_MEDIA_SOURCE_MANIFEST).is_file()
    if not media_contract_present and media_source_root == ROOT.resolve():
        raise FileNotFoundError(
            f"commercial media source manifest is absent: {COMMERCIAL_MEDIA_SOURCE_MANIFEST}"
        )
    commercial_media = (
        version_commercial_media_references(
            Path(dest),
            source_root=media_source_root,
            require_published_assets=require_commercial_media_assets,
            write_public_manifest=require_commercial_media_assets,
        )
        if media_contract_present
        else {"applicable": False, "reason": "isolated_fixture_without_media_contract"}
    )
    headers_path = Path(dest) / "_headers"
    if headers_path.is_file() and (Path(dest) / "index.html").is_file():
        from scripts.site.csp_contract import apply_artifact_csp_hashes

        headers_path.write_text(
            apply_artifact_csp_hashes(headers_path.read_text(encoding="utf-8"), Path(dest)),
            encoding="utf-8",
        )
    return {
        "scrubbed_html_files": scrubbed,
        "structured_identity": structured_identity,
        "promoted_navigation_files": promoted_navigation_files,
        "navigation_audit": navigation_audit,
        "css_assets": css_assets,
        "commercial_media": commercial_media,
    }


def inventory_public_routes(root: Path | None = None) -> dict[str, Any]:
    """Explicit inventory of routes/files that must land in the public artifact."""
    root = root or ROOT
    dirs: list[str] = []
    files: list[str] = []
    for name in sorted(PUBLIC_TOP_DIRS):
        p = root / name
        if p.is_dir():
            dirs.append(name + "/")
    for name in sorted(PUBLIC_ROOT_FILES):
        p = root / name
        if p.is_file():
            files.append(name)
    html_routes: list[str] = []
    for dname in sorted(PUBLIC_TOP_DIRS):
        d = root / dname
        if not d.is_dir():
            continue
        for hp in sorted(d.rglob("index.html")):
            rel = hp.relative_to(root).as_posix()
            if rel in PUBLIC_EXCLUDED_RELPATHS:
                continue
            route = "/" + rel[: -len("index.html")]
            if not route.endswith("/"):
                route += "/"
            html_routes.append(route)
    if (root / "index.html").is_file():
        html_routes.insert(0, "/")
    return {
        "public_directory": PUBLIC_DIR_NAME,
        "top_dirs": dirs,
        "root_files": files,
        "html_route_count": len(html_routes),
        "html_routes": html_routes,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def omit_production_review_packet(dest: Path, context: str) -> list[str]:
    """Keep the legacy preview-review protocol off the production visitor host.

    The source packet and preview verifier remain intact. Build/runtime identity
    endpoints are public diagnostics and are not part of this exact exclusion.
    """
    relative = ".well-known/editorial-review-packet.json"
    packet = dest / relative
    if context == "production" and packet.is_file():
        packet.unlink()
        return [relative]
    return []


def assemble_public_artifact(
    root: Path | None = None,
    *,
    dest_name: str = PUBLIC_DIR_NAME,
    manifest_path: Path | None = None,
) -> dict[str, Any]:
    """Wipe and rebuild the public artifact from allowlisted sources only."""
    root = root or ROOT
    dest = root / dest_name
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    copied_dirs: list[str] = []
    copied_files: list[str] = []
    errors: list[str] = []

    for name in sorted(PUBLIC_TOP_DIRS):
        if name in FORBIDDEN_TOP:
            continue
        src = root / name
        if not src.is_dir():
            continue
        # Safety: never follow into forbidden nested names during copy via ignore.
        # ops/data is NOT public — strategic GSC insights are served only via
        # authenticated ops?action=gsc_insights (robots Disallow is not security).
        def _ignore(directory: str, names: list[str]) -> set[str]:
            skip = set()
            try:
                rel_dir = Path(directory).resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                rel_dir = ""
            for n in names:
                if n in FORBIDDEN_DIR_NAMES:
                    skip.add(n)
                elif n.startswith(".env"):
                    skip.add(n)
                elif Path(n).suffix.lower() in FORBIDDEN_EXTENSIONS:
                    skip.add(n)
                elif n in FORBIDDEN_BASENAMES and n != "manifest.webmanifest":
                    # allow only known public basenames; skip private-looking ones
                    if n in {"package.json", "registry.json", "manifest.json"}:
                        skip.add(n)
                # Explicit: never publish ops strategic JSON under any name
                if name == "ops" and n in {"data", "gsc-insights.json"}:
                    skip.add(n)
                if rel_dir.startswith("ops") and n.endswith("gsc-insights.json"):
                    skip.add(n)
                if f"{rel_dir}/{n}".lstrip("/") in PUBLIC_EXCLUDED_RELPATHS:
                    skip.add(n)
            return skip

        shutil.copytree(src, dest / name, ignore=_ignore, dirs_exist_ok=True)
        copied_dirs.append(name + "/")

    for name in sorted(PUBLIC_ROOT_FILES):
        if name in FORBIDDEN_TOP:
            continue
        src = root / name
        if src.is_file():
            shutil.copy2(src, dest / name)
            copied_files.append(name)

    # Ensure .well-known exists after pSEO build
    wk = root / ".well-known"
    if wk.is_dir() and not (dest / ".well-known").exists():
        shutil.copytree(wk, dest / ".well-known")
        if ".well-known/" not in copied_dirs:
            copied_dirs.append(".well-known/")

    omitted_review_metadata = omit_production_review_packet(
        dest, os.environ.get("CONTEXT") or os.environ.get("NETLIFY_CONTEXT") or "local"
    )
    finalized = finalize_public_artifact(
        dest,
        commercial_media_source_root=root,
        require_commercial_media_assets=True,
    )
    promoted_navigation_files = finalized["promoted_navigation_files"]
    navigation_audit = finalized["navigation_audit"]
    css_assets = finalized["css_assets"]
    commercial_media = finalized["commercial_media"]

    artifact_hash = _sha256_tree(dest)
    inv = inventory_public_routes(root)
    report = {
        "ok": len(errors) == 0,
        "public_directory": dest_name,
        "public_artifact_hash": artifact_hash,
        "copied_dirs": copied_dirs,
        "copied_files": copied_files,
        "html_route_count": inv["html_route_count"],
        "errors": errors,
        "omitted_production_review_metadata": omitted_review_metadata,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "css_assets": css_assets,
        "commercial_media": commercial_media,
        "promoted_navigation_files": promoted_navigation_files,
        "navigation_audit": navigation_audit,
        "scrubbed_html_files": finalized["scrubbed_html_files"],
        "structured_identity": finalized["structured_identity"],
    }

    # Private inventory (not published)
    man_path = manifest_path if manifest_path is not None else root / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    man_path.parent.mkdir(parents=True, exist_ok=True)
    man_payload = {
        **inv,
        "public_artifact_hash": artifact_hash,
        "copied_dirs": copied_dirs,
        "copied_files": copied_files,
        "promoted_navigation_files": promoted_navigation_files,
        "navigation_audit": navigation_audit,
        "structured_identity": finalized["structured_identity"],
    }
    man_path.write_text(
        json.dumps(man_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report["manifest_path"] = str(man_path.relative_to(root)) if man_path.is_relative_to(root) else str(man_path)
    return report


def audit_public_artifact(
    root: Path | None = None,
    *,
    dest_name: str = PUBLIC_DIR_NAME,
) -> dict[str, Any]:
    """Fail-closed walk of the public artifact."""
    root = root or ROOT
    dest = root / dest_name
    findings: list[dict[str, str]] = []
    file_count = 0

    if not dest.is_dir():
        return {
            "ok": False,
            "errors": [f"public artifact missing: {dest_name}"],
            "findings": [{"code": "missing_artifact", "path": dest_name, "detail": "not found"}],
            "file_count": 0,
        }

    from scripts.site.public_navigation import audit_public_navigation_tree

    navigation_audit: dict[str, int] | None = None
    try:
        navigation_audit = audit_public_navigation_tree(dest)
    except ValueError as exc:
        findings.append(
            {
                "code": "public_navigation_contract",
                "path": dest_name,
                "detail": str(exc),
            }
        )

    # Legacy netlify.toml preview alignment is checked by caller / CI.
    for p in sorted(dest.rglob("*")):
        rel = p.relative_to(dest).as_posix()
        if p.is_dir():
            # No nested data/ dirs in the public artifact (strategic JSON is auth-only)
            if p.name in FORBIDDEN_DIR_NAMES:
                findings.append(
                    {
                        "code": "forbidden_dir",
                        "path": rel,
                        "detail": f"directory name {p.name}",
                    }
                )
            continue

        file_count += 1
        name = p.name
        suf = p.suffix.lower()

        if name == "gsc-insights.json" or rel.endswith("gsc-insights.json"):
            findings.append(
                {
                    "code": "strategic_gsc_public",
                    "path": rel,
                    "detail": "GSC insights must be auth-only via ops function, not static public",
                }
            )

        for pref in FORBIDDEN_PUBLIC_PATH_PREFIXES:
            if rel == pref.rstrip("/") or rel.startswith(pref):
                findings.append(
                    {
                        "code": "forbidden_path_prefix",
                        "path": rel,
                        "detail": pref,
                    }
                )

        if suf in FORBIDDEN_EXTENSIONS:
            findings.append(
                {"code": "forbidden_extension", "path": rel, "detail": suf}
            )
        if name in FORBIDDEN_BASENAMES and name != "manifest.webmanifest":
            # content-index.json and pseo-build.json are allowed; others not
            if name in {"package.json", "registry.json", "manifest.json", ".env"}:
                findings.append(
                    {"code": "forbidden_basename", "path": rel, "detail": name}
                )
        if name.startswith(".env"):
            findings.append(
                {"code": "env_file", "path": rel, "detail": name}
            )
        if name.endswith(("_test.py", ".test.js", "test_.py")):
            findings.append(
                {"code": "test_file", "path": rel, "detail": name}
            )

        # Top-level of artifact must not be a forbidden top name
        top = rel.split("/", 1)[0]
        if top in FORBIDDEN_TOP and top not in {".well-known"}:
            findings.append(
                {"code": "forbidden_top", "path": rel, "detail": top}
            )

        if suf in TEXT_SCAN_SUFFIXES or name in {"_redirects", "_headers", "robots.txt"}:
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                findings.append(
                    {"code": "read_error", "path": rel, "detail": str(exc)}
                )
                continue
            for pat in SECRET_PATTERNS:
                m = pat.search(text)
                if m:
                    findings.append(
                        {
                            "code": "secret_or_internal_leak",
                            "path": rel,
                            "detail": pat.pattern[:80],
                        }
                    )
                    break

    # Allowlist: every top-level entry must be known public
    for child in dest.iterdir():
        n = child.name
        if child.is_dir():
            if n not in PUBLIC_TOP_DIRS and n not in {".well-known"}:
                findings.append(
                    {
                        "code": "not_allowlisted_dir",
                        "path": n,
                        "detail": "top-level dir not in PUBLIC_TOP_DIRS",
                    }
                )
        else:
            if n not in PUBLIC_ROOT_FILES:
                findings.append(
                    {
                        "code": "not_allowlisted_file",
                        "path": n,
                        "detail": "top-level file not in PUBLIC_ROOT_FILES",
                    }
                )

    # Required public markers
    required = [
        "index.html",
        "robots.txt",
        "_redirects",
        "styles.css",
        "script.js",
        ".well-known/pseo-build.json",
        ".well-known/css-assets.json",
    ]
    from scripts.site.version_commercial_media import SOURCE_MANIFEST as COMMERCIAL_MEDIA_SOURCE_MANIFEST

    media_contract_present = (root.resolve() / COMMERCIAL_MEDIA_SOURCE_MANIFEST).is_file()
    if media_contract_present:
        required.append(".well-known/commercial-media-assets.json")
    for req in required:
        if not (dest / req).exists():
            findings.append(
                {
                    "code": "missing_required",
                    "path": req,
                    "detail": "required public file missing",
                }
            )

    from scripts.site.fingerprint_css import (
        duplicate_stylesheet_hrefs,
        html_uses_unversioned_styles,
        is_fingerprinted_stylesheet_href,
        stylesheet_hrefs,
        validate_css_asset_manifest,
    )
    from scripts.site.structured_identity import audit_html as audit_structured_identity_html
    from scripts.site.version_commercial_media import validate_commercial_media_versioning

    if media_contract_present:
        try:
            validate_commercial_media_versioning(dest, source_root=root)
        except (FileNotFoundError, ValueError) as exc:
            findings.append(
                {
                    "code": "invalid_commercial_media_versioning",
                    "path": ".well-known/commercial-media-assets.json",
                    "detail": str(exc),
                }
            )

    manifest_hrefs: set[str] = set()
    manifest_valid = False
    try:
        css_manifest = validate_css_asset_manifest(dest)
    except (FileNotFoundError, ValueError) as exc:
        findings.append(
            {
                "code": "invalid_css_asset_manifest",
                "path": ".well-known/css-assets.json",
                "detail": str(exc),
            }
        )
    else:
        manifest_hrefs = {
            info["href"]
            for info in css_manifest["files"].values()
        }
        manifest_valid = True

    for html_path in sorted(dest.rglob("*.html")):
        rel = html_path.relative_to(dest).as_posix()
        try:
            html = html_path.read_text(encoding="utf-8")
        except OSError as exc:
            findings.append({"code": "read_error", "path": rel, "detail": str(exc)})
            continue
        for detail in audit_structured_identity_html(html):
            findings.append(
                {
                    "code": "unsupported_structured_identity",
                    "path": rel,
                    "detail": detail,
                }
            )
        try:
            hrefs = stylesheet_hrefs(html)
        except ValueError as exc:
            findings.append(
                {
                    "code": "invalid_stylesheet_link",
                    "path": rel,
                    "detail": str(exc),
                }
            )
            continue
        if not hrefs:
            continue
        try:
            has_unversioned_styles = html_uses_unversioned_styles(html)
            duplicates = duplicate_stylesheet_hrefs(html)
        except ValueError as exc:
            findings.append(
                {
                    "code": "invalid_stylesheet_link",
                    "path": rel,
                    "detail": str(exc),
                }
            )
            continue
        if has_unversioned_styles:
            findings.append(
                {
                    "code": "unversioned_stylesheet",
                    "path": rel,
                    "detail": "HTML of this build still points at a mutable local stylesheet; a browser may serve CSS N-1",
                }
            )
        if duplicates:
            findings.append(
                {
                    "code": "duplicate_stylesheet",
                    "path": rel,
                    "detail": f"duplicate stylesheet hrefs: {duplicates}",
                }
            )
        if manifest_valid:
            for href in hrefs:
                try:
                    fingerprinted = is_fingerprinted_stylesheet_href(href)
                except ValueError as exc:
                    findings.append(
                        {
                            "code": "invalid_stylesheet_link",
                            "path": rel,
                            "detail": str(exc),
                        }
                    )
                    continue
                if fingerprinted and urlsplit(href.strip()).path not in manifest_hrefs:
                    findings.append(
                        {
                            "code": "unmanifested_stylesheet",
                            "path": rel,
                            "detail": f"fingerprinted stylesheet is absent from css-assets.json: {href}",
                        }
                    )

    ok = len(findings) == 0
    return {
        "ok": ok,
        "public_directory": dest_name,
        "public_artifact_hash": _sha256_tree(dest),
        "file_count": file_count,
        "navigation_audit": navigation_audit,
        "findings": findings,
        "errors": [f"{f['code']}:{f['path']}" for f in findings],
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Assemble or audit public _site artifact")
    ap.add_argument(
        "action",
        choices=["assemble", "audit", "inventory"],
        help="assemble = wipe+copy; audit = fail-closed scan; inventory = list routes",
    )
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--dir", default=PUBLIC_DIR_NAME, dest="dest_name")
    args = ap.parse_args(argv)
    root = Path(args.root)

    if args.action == "inventory":
        rep = inventory_public_routes(root)
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        return 0
    if args.action == "assemble":
        rep = assemble_public_artifact(root, dest_name=args.dest_name)
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        return 0 if rep.get("ok") else 1
    rep = audit_public_artifact(root, dest_name=args.dest_name)
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    if not rep.get("ok"):
        for e in rep.get("errors") or []:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
