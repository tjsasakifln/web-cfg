#!/usr/bin/env python3
"""Reconcile the final public HTML artifact with an independent route census.

The publish manifest is generated from source.  This gate walks the assembled
artifact independently, then scans every non-exempt HTML response (including
noindex pages and root ``*.html`` responses).  It therefore catches retained,
generated or dropped routes that the source-side detector cannot discover.

The small mutation contracts below prove known defect classes are rejected.
They are regression examples, not a claim that regex can understand every
commercial sentence; contextual C1-C6 review remains a separate release gate.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_copy_scope import (
    MANIFEST_ROUTE_EXEMPT,
    artifact_html_files,
    artifact_index_routes,
    is_indexable_html,
    relpath,
    route_for,
    visible_text,
)
from scripts.site.test_self_deprecating_copy import findings_for
from scripts.site.test_public_control_vocabulary import (
    classify_scan as classify_control_vocabulary,
    option_label_failures,
    rendered_internal_code_failures,
)

_MATURITY_SHOWCASE = re.compile(
    r"\b(?:\d+\s+)?(?:capacidades?|ofertas?|entregas?)\b[^.!?]{0,60}"
    r"\b(?:em valida[çc][ãa]o|pendentes?|bloqueadas?|maturidade)\b",
    re.I,
)
_SIZE_REFUSAL = re.compile(
    r"\b(?:n[ãa]o atendemos|fora do (?:nosso )?perfil|recusamos)\b[^.!?]{0,70}"
    r"\b(?:pequen[oa]s?|baixo valor|porte)\b"
    r"|\b(?:obra|contrato|cliente)\b[^.!?]{0,40}\b(?:pequen[oa]|baixo valor)\b"
    r"[^.!?]{0,70}\b(?:use|procure|basta|ferramenta gratuita)\b",
    re.I,
)
_DEMO_AS_CLIENT = re.compile(
    r"\b(?:este|o)\s+(?:exemplo|demonstrativo)\b"
    r"(?![^.!?]{0,50}\b(?:n[ãa]o|nunca)\b)[^.!?]{0,50}"
    r"\b(?:é|retrata|documenta|vem de)\s+(?:um\s+)?(?:caso CONFENGE|cliente real)\b"
    r"|\b(?:caso CONFENGE|cliente real)\b"
    r"(?![^.!?]{0,50}\b(?:n[ãa]o|nunca)\b)[^.!?]{0,50}"
    r"\b(?:é|foi)\s+(?:um\s+)?(?:exemplo|demonstrativo)\b",
    re.I,
)
_INTERNAL_ENGLISH = re.compile(
    r"\b(?:proof_state|permission_class|offer_id|DRAFT|WITHHELD|READY|FINAL)\b"
)

_CANONICAL_ORIGIN = "https://confenge.com.br"
_SAFE_INVENTORY_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")
_MAX_HTML_BYTES = 5 * 1024 * 1024
_EVIDENCE_HEADERS = (
    "age",
    "cache-control",
    "cf-cache-status",
    "content-length",
    "content-type",
    "etag",
    "last-modified",
    "x-build-sha",
    "x-confenge-build-sha",
    "x-confenge-release-id",
    "x-release-id",
)


def _url_for_relpath(rel: str) -> str:
    if rel == "index.html":
        path = "/"
    elif rel.endswith("/index.html"):
        path = "/" + rel.removesuffix("index.html")
    else:
        path = "/" + rel
    return _CANONICAL_ORIGIN + path


def _is_private_url(url: str) -> bool:
    path = urllib.parse.urlsplit(url).path
    return path == "/ops" or path.startswith("/ops/")


class _CanonicalRedirects(urllib.request.HTTPRedirectHandler):
    """Follow only redirects that stay on the canonical public origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        parsed = urllib.parse.urlsplit(newurl)
        if (
            parsed.scheme != "https"
            or parsed.hostname != "confenge.com.br"
            or parsed.port is not None
            or _is_private_url(newurl)
        ):
            raise urllib.error.HTTPError(
                newurl, code, "redirect outside canonical public surface", headers, fp
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_one(rel: str, timeout: float) -> tuple[dict[str, object], bytes | None]:
    url = _url_for_relpath(rel)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "User-Agent": "CONFENGE-Public-Surface-Verifier/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(_CanonicalRedirects())
        with opener.open(request, timeout=timeout) as response:
            body = response.read(_MAX_HTML_BYTES + 1)
            final_url = response.geturl()
            status = int(response.status)
            headers = {
                name.lower(): response.headers.get(name)
                for name in _EVIDENCE_HEADERS
                if response.headers.get(name) is not None
            }
            content_type = str(response.headers.get("Content-Type") or "")
            error = None
            if len(body) > _MAX_HTML_BYTES:
                error = f"body_exceeds_{_MAX_HTML_BYTES}_bytes"
                body = None
            elif status != 200:
                error = f"unexpected_http_status:{status}"
                body = None
            elif "text/html" not in content_type.lower():
                error = f"unexpected_content_type:{content_type}"
                body = None
            elif _is_private_url(final_url):
                error = "redirected_to_private_surface"
                body = None
            result = {
                "path": rel,
                "url": url,
                "status": status,
                "final_url": final_url,
                "sha256": hashlib.sha256(body).hexdigest() if body is not None else None,
                "bytes": len(body) if body is not None else None,
                "headers": headers,
                "error": error,
            }
            return result, body
    except urllib.error.HTTPError as exc:
        return (
            {
                "path": rel,
                "url": url,
                "status": exc.code,
                "final_url": exc.geturl(),
                "sha256": None,
                "bytes": None,
                "headers": {
                    name.lower(): exc.headers.get(name)
                    for name in _EVIDENCE_HEADERS
                    if exc.headers and exc.headers.get(name) is not None
                },
                "error": f"http_error:{exc.code}:{exc.reason}",
            },
            None,
        )
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        return (
            {
                "path": rel,
                "url": url,
                "status": None,
                "final_url": None,
                "sha256": None,
                "bytes": None,
                "headers": {},
                "error": f"fetch_error:{type(exc).__name__}:{exc}",
            },
            None,
        )


def fetch_server_mirror(
    inventory: Path,
    mirror: Path,
    report_path: Path,
    *,
    concurrency: int = 8,
    timeout: float = 20.0,
    fetcher=_fetch_one,  # noqa: ANN001
) -> dict[str, object]:
    """Fetch normal public URLs from an inventory into an evidence mirror."""
    if not 1 <= concurrency <= 8:
        raise ValueError("fetch concurrency must be between 1 and 8")
    if not 1 <= timeout <= 60:
        raise ValueError("fetch timeout must be between 1 and 60 seconds")
    rels, inventory_errors = _inventory_relpaths(inventory)
    unsafe = sorted(rel for rel in rels if not _SAFE_INVENTORY_PATH.fullmatch(rel))
    if unsafe:
        inventory_errors.append(f"server_inventory_unsafe_entry:{len(unsafe)}")
    fetchable = sorted(set(rels) - set(unsafe))
    private = sorted(rel for rel in fetchable if _is_private_url(_url_for_relpath(rel)))
    fetchable = sorted(set(fetchable) - set(private))
    mirror = mirror.resolve()
    if mirror.exists() and any(mirror.iterdir()):
        raise ValueError(f"fetch mirror must be absent or empty: {mirror}")
    mirror.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        jobs = {pool.submit(fetcher, rel, timeout): rel for rel in fetchable}
        for future in concurrent.futures.as_completed(jobs):
            entry, body = future.result()
            entries.append(entry)
            if body is not None:
                target = mirror / str(entry["path"])
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
    entries.sort(key=lambda item: str(item["path"]))
    failures = [entry for entry in entries if entry["error"]]
    errors = list(inventory_errors)
    if failures:
        errors.append(f"server_html_fetch_failures:{len(failures)}")
    if len(entries) + len(private) != len(rels) - len(unsafe):
        errors.append("server_inventory_fetch_accounting_mismatch")
    report: dict[str, object] = {
        "schema": "confenge.public-html-mirror/v1",
        "ok": not errors,
        "canonical_origin": _CANONICAL_ORIGIN,
        "inventory": str(inventory.resolve()),
        "inventory_html_total": len(rels),
        "fetched_html": len(entries) - len(failures),
        "failed_html": len(failures),
        "skipped_private": private,
        "mirror": str(mirror),
        "concurrency": concurrency,
        "timeout_seconds": timeout,
        "responses": entries,
        "errors": errors,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


class _Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag.lower() != "a":
            return
        href = dict((str(k).lower(), v) for k, v in attrs).get("href")
        if href:
            self.hrefs.append(str(href))


def semantic_fixture_findings(html: str, route: str) -> list[str]:
    """Narrow regression checks for previously observed commercial defects."""
    main_match = re.search(r"<main\b[^>]*>(.*?)</main>", html, re.I | re.S)
    main_html = main_match.group(1) if main_match else html
    text = visible_text(main_html)
    out: list[str] = []
    if _MATURITY_SHOWCASE.search(text):
        out.append("internal_maturity_showcase")
    if _SIZE_REFUSAL.search(text):
        out.append("size_based_refusal")
    if _INTERNAL_ENGLISH.search(text):
        out.append("internal_english_state")
    if _DEMO_AS_CLIENT.search(text):
        out.append("demonstrative_claimed_as_client")

    links = _Links()
    links.feed(main_html)
    internal_destinations = [
        href
        for href in links.hrefs
        if href.startswith("/") and not href.startswith(("/#", "/triagem-tecnica/"))
    ]
    describes_projects = bool(
        re.search(r"<h[1-3]\b[^>]*>[^<]*projet", main_html, re.I)
        or route.startswith("/servicos/projet")
    )
    if describes_projects and internal_destinations and all(
        href.startswith("/quantitativos-orcamento-obras/")
        for href in internal_destinations
    ):
        out.append("project_routes_only_to_budget")

    main = visible_text(main_html)
    has_action = bool(re.search(r"<(?:a|button|form)\b", main_html, re.I))
    if route.startswith("/servicos/") and (len(main.split()) < 25 or not has_action):
        out.append("commercial_page_without_substance_or_action")
    return out


def _load_manifest(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    if not path.is_file():
        return [], [f"manifest_missing:{path}"]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], [f"manifest_invalid:{exc}"]
    routes = payload.get("html_routes")
    if not isinstance(routes, list) or any(not isinstance(route, str) for route in routes):
        return [], ["manifest_html_routes_invalid"]
    if len(routes) != len(set(routes)):
        errors.append("manifest_html_routes_duplicate")
    declared = payload.get("html_route_count")
    if declared != len(routes):
        errors.append(f"manifest_count_mismatch:declared={declared}:actual={len(routes)}")
    return routes, errors


def _inventory_relpaths(path: Path) -> tuple[set[str], list[str]]:
    errors: list[str] = []
    if not path.is_file():
        return set(), [f"server_inventory_missing:{path}"]
    rels: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        item = line.strip().replace("\\", "/")
        if not item or item.startswith("#"):
            continue
        if "/_site/" in item:
            item = item.split("/_site/", 1)[1]
        item = item.removeprefix("_site/").lstrip("/")
        if not item.endswith(".html") or ".." in Path(item).parts:
            errors.append(f"server_inventory_invalid_entry:{line[:120]}")
            continue
        rels.add(item)
    if not rels:
        errors.append("server_inventory_html_empty")
    return rels, errors


def _runtime_comparison(
    package_files: list[Path], artifact: Path, inventory: Path, mirror: Path | None
) -> dict:
    from deploy.netcup.lib.release_control import (
        is_live_intel_overlay,
        is_live_intel_withdrawal,
    )

    server_rels, errors = _inventory_relpaths(inventory)
    package_rels = {relpath(path, artifact) for path in package_files}
    added = server_rels - package_rels
    removed = package_rels - server_rels
    allowed_added = sorted(
        rel for rel in added if is_live_intel_overlay(f"_site/{rel}")
    )
    unauthorized_added = sorted(set(added) - set(allowed_added))
    allowed_removed = sorted(
        rel for rel in removed if is_live_intel_withdrawal(f"_site/{rel}")
    )
    unexpected_removed = sorted(set(removed) - set(allowed_removed))
    if unauthorized_added:
        errors.append(f"server_unauthorized_html_added:{len(unauthorized_added)}")
    if unexpected_removed:
        errors.append(f"server_unexpected_html_removed:{len(unexpected_removed)}")

    mirror_rels: set[str] = set()
    mirror_copy_findings: dict[str, dict[str, int]] = {}
    mirror_semantic_findings: dict[str, list[str]] = {}
    mirror_control_vocabulary: dict[str, object] | None = None
    mirror_option_defects: list[str] = []
    mirror_rendered_code_defects: list[str] = []
    if mirror is None:
        errors.append("server_inventory_without_body_mirror")
    else:
        mirror = mirror.resolve()
        mirror_files = artifact_html_files(mirror)
        mirror_rels = {relpath(path, mirror) for path in mirror_files}
        missing_bodies = sorted(server_rels - mirror_rels)
        extra_bodies = sorted(mirror_rels - server_rels)
        if missing_bodies:
            errors.append(f"server_html_bodies_unscanned:{len(missing_bodies)}")
        if extra_bodies:
            errors.append(f"server_mirror_not_in_inventory:{len(extra_bodies)}")
        for path in mirror_files:
            rel = relpath(path, mirror)
            route = route_for(rel)
            if route in MANIFEST_ROUTE_EXEMPT:
                continue
            html = path.read_text(encoding="utf-8", errors="replace")
            found = findings_for(html)
            if found:
                mirror_copy_findings[rel] = found
            semantic = semantic_fixture_findings(html, route)
            if semantic:
                mirror_semantic_findings[rel] = semantic
        if mirror_copy_findings:
            errors.append(
                f"server_self_deprecating_or_internal_copy:{len(mirror_copy_findings)}"
            )
        if mirror_semantic_findings:
            errors.append(
                f"server_known_commercial_copy_defects:{len(mirror_semantic_findings)}"
            )
        if not mirror_files:
            errors.append("server_mirror_html_empty")
        else:
            mirror_control_vocabulary = classify_control_vocabulary(
                mirror, require_artifact=True
            )
            mirror_control_defects = mirror_control_vocabulary["defects"]
            mirror_option_defects = option_label_failures(mirror)
            mirror_rendered_code_defects = rendered_internal_code_failures(mirror)
            if mirror_control_defects:
                errors.append(
                    "server_unclassified_control_vocabulary_defects:"
                    f"{len(mirror_control_defects)}"
                )
            if mirror_option_defects:
                errors.append(f"server_internal_option_labels:{len(mirror_option_defects)}")
            if mirror_rendered_code_defects:
                errors.append(
                    f"server_rendered_internal_codes:{len(mirror_rendered_code_defects)}"
                )
    return {
        "server_inventory": str(inventory),
        "server_html_total": len(server_rels),
        "server_overlay_html_added": allowed_added,
        "server_unauthorized_html_added": unauthorized_added,
        "server_overlay_html_removed": allowed_removed,
        "server_unexpected_html_removed": unexpected_removed,
        "server_mirror": str(mirror) if mirror else None,
        "server_html_bodies_scanned": len(mirror_rels),
        "server_copy_findings": mirror_copy_findings,
        "server_semantic_findings": mirror_semantic_findings,
        "server_control_vocabulary": {
            "matched_occurrences": sum(
                sum(counts.values())
                for counts in (mirror_control_vocabulary or {"all": {}})["all"].values()
            ),
            "legitimate_occurrences": sum(
                sum(counts.values())
                for counts in (
                    mirror_control_vocabulary or {"legitimate": {}}
                )["legitimate"].values()
            ),
            "defect_occurrences": sum(
                sum(counts.values())
                for counts in (
                    mirror_control_vocabulary or {"defects": {}}
                )["defects"].values()
            ),
            "legitimate_reasons": (
                mirror_control_vocabulary or {"legitimate_reasons": {}}
            )["legitimate_reasons"],
            "classifications": (
                mirror_control_vocabulary or {"classifications": []}
            )["classifications"],
            "defect_examples": (
                mirror_control_vocabulary or {"defect_examples": []}
            )["defect_examples"],
            "option_label_defects": mirror_option_defects,
            "rendered_internal_code_defects": mirror_rendered_code_defects,
        },
        "errors": errors,
    }


def coverage_report(
    artifact: Path,
    manifest: Path,
    *,
    server_inventory: Path | None = None,
    server_mirror: Path | None = None,
) -> dict:
    artifact = artifact.resolve()
    files = artifact_html_files(artifact)
    manifest_routes, errors = _load_manifest(manifest)
    if not artifact.is_dir():
        errors.append(f"artifact_missing:{artifact}")
    if not files:
        errors.append("artifact_html_empty")

    index_routes = artifact_index_routes(artifact)
    if len(index_routes) != len(set(index_routes)):
        errors.append("artifact_index_routes_duplicate")
    artifact_set = set(index_routes)
    manifest_set = set(manifest_routes)
    unlisted = sorted(artifact_set - manifest_set)
    missing = sorted(manifest_set - artifact_set)
    if unlisted:
        errors.append(f"artifact_routes_unlisted:{len(unlisted)}")
    if missing:
        errors.append(f"manifest_routes_missing_from_artifact:{len(missing)}")

    scanned: list[str] = []
    exempt: list[str] = []
    copy_findings: dict[str, dict[str, int]] = {}
    semantic_findings: dict[str, list[str]] = {}
    noindex = 0
    for path in files:
        rel = relpath(path, artifact)
        route = route_for(rel)
        if route in MANIFEST_ROUTE_EXEMPT:
            exempt.append(route)
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        scanned.append(route)
        if not is_indexable_html(html):
            noindex += 1
        found = findings_for(html)
        if found:
            copy_findings[rel] = found
        semantic = semantic_fixture_findings(html, route)
        if semantic:
            semantic_findings[rel] = semantic
    if len(scanned) + len(exempt) != len(files):
        errors.append("artifact_html_not_accounted_for")
    if copy_findings:
        errors.append(f"self_deprecating_or_internal_copy:{len(copy_findings)}")
    if semantic_findings:
        errors.append(f"known_commercial_copy_defects:{len(semantic_findings)}")

    control_vocabulary = classify_control_vocabulary(
        artifact, require_artifact=True
    )
    control_defects = control_vocabulary["defects"]
    option_defects = option_label_failures(artifact)
    rendered_code_defects = rendered_internal_code_failures(artifact)
    if control_defects:
        errors.append(f"unclassified_control_vocabulary_defects:{len(control_defects)}")
    if option_defects:
        errors.append(f"internal_option_labels:{len(option_defects)}")
    if rendered_code_defects:
        errors.append(f"rendered_internal_codes:{len(rendered_code_defects)}")

    report = {
        "schema": "confenge.public-surface-coverage/v1",
        "ok": not errors,
        "artifact": str(artifact),
        "manifest": str(manifest),
        "artifact_html_total": len(files),
        "artifact_index_routes": len(index_routes),
        "manifest_routes": len(manifest_routes),
        "copy_scanned_html": len(scanned),
        "copy_scanned_noindex_html": noindex,
        "copy_exempt_routes": sorted(set(exempt)),
        "artifact_routes_unlisted": unlisted,
        "manifest_routes_missing_from_artifact": missing,
        "copy_findings": copy_findings,
        "semantic_findings": semantic_findings,
        "control_vocabulary": {
            "matched_routes": len(control_vocabulary["all"]),
            "matched_occurrences": sum(
                sum(counts.values())
                for counts in control_vocabulary["all"].values()
            ),
            "legitimate_routes": len(control_vocabulary["legitimate"]),
            "legitimate_occurrences": sum(
                sum(counts.values())
                for counts in control_vocabulary["legitimate"].values()
            ),
            "legitimate_reasons": control_vocabulary["legitimate_reasons"],
            "classifications": control_vocabulary["classifications"],
            "defect_routes": len(control_defects),
            "defect_occurrences": sum(
                sum(counts.values()) for counts in control_defects.values()
            ),
            "defect_examples": control_vocabulary["defect_examples"],
            "option_label_defects": option_defects,
            "rendered_internal_code_defects": rendered_code_defects,
        },
        "errors": errors,
    }
    if server_inventory is not None:
        runtime = _runtime_comparison(files, artifact, server_inventory, server_mirror)
        report["runtime"] = runtime
        errors.extend(runtime["errors"])
        report["ok"] = not errors
    return report


def run_mutation_contracts() -> list[str]:
    """Seed known defects in isolation and prove the pertinent controls reject."""
    passed: list[str] = []

    semantic_bad = {
        "internal_english": '<main><h1>Serviço</h1><p>proof_state: DRAFT</p></main>',
        "size_refusal": '<main><h1>Serviço</h1><p>Não atendemos clientes de pequeno porte.</p></main>',
        "maturity_showcase": '<main><h1>Entregas</h1><p>44 capacidades em validação.</p></main>',
        "demo_as_client": (
            '<main><h1>Exemplo</h1><p>Este demonstrativo retrata um cliente real.</p></main>'
        ),
        "project_only_budget": (
            '<main><h1>Projetos estruturais</h1><p>Detalhamento do projeto.</p>'
            '<a href="/quantitativos-orcamento-obras/">Ver orçamento</a></main>'
        ),
        "empty_commercial": '<main><h1>Projetos</h1><p>Soluções personalizadas.</p></main>',
    }
    complete = (
        "<p>Reconhecemos a necessidade e conferimos os documentos de entrada. "
        "Executamos levantamento, cálculo e revisão técnica. A entrega contém memória "
        "de cálculo, premissas, fontes e recomendações para apoiar a decisão da obra.</p>"
        '<a href="/triagem-tecnica/">Conversar sobre o serviço</a>'
    )
    for name, mutation in semantic_bad.items():
        route = "/servicos/projetos/" if name in {"project_only_budget", "empty_commercial"} else "/fixture/"
        html = mutation if name in {"project_only_budget", "empty_commercial"} else mutation.replace("</main>", complete + "</main>")
        with tempfile.TemporaryDirectory() as tmp:
            fixture_root = Path(tmp)
            artifact = fixture_root / "_site"
            target = artifact / route.strip("/") / "index.html"
            target.parent.mkdir(parents=True)
            target.write_text(html, encoding="utf-8")
            manifest = fixture_root / "manifest.json"
            manifest.write_text(
                json.dumps({"html_route_count": 1, "html_routes": [route]}), encoding="utf-8"
            )
            result = coverage_report(artifact, manifest)
            if result["ok"] or not result["semantic_findings"]:
                raise AssertionError(f"mutation_not_rejected_by_full_gate:{name}")
        passed.append(name)

    surface_bad = {
        "noindex_metadata": (
            '<meta name="robots" content="noindex"><meta name="description" '
            'content="Credenciais sem comprovação"><main><h1>Rascunho</h1></main>'
        ),
        "aria_hidden_visible": '<main><p aria-hidden="true">as_of 2026-09-09</p></main>',
        "inert_visible": '<main><p inert>Classe de permissão: WITHHELD</p></main>',
        "dynamic_js": '<main><p id="s"></p></main><script>s.textContent = "as_of 2026-09-09"</script>',
    }
    for name, mutation in surface_bad.items():
        html = mutation.replace("</main>", complete + "</main>")
        with tempfile.TemporaryDirectory() as tmp:
            fixture_root = Path(tmp)
            artifact = fixture_root / "_site"
            artifact.mkdir(parents=True)
            (artifact / "index.html").write_text(html, encoding="utf-8")
            manifest = fixture_root / "manifest.json"
            manifest.write_text(
                json.dumps({"html_route_count": 1, "html_routes": ["/"]}), encoding="utf-8"
            )
            result = coverage_report(artifact, manifest)
            if result["ok"] or not result["copy_findings"]:
                raise AssertionError(f"surface_mutation_not_rejected_by_full_gate:{name}")
        passed.append(name)

    legitimate = (
        '<main><h1>Acervo técnico exigido no edital</h1><p>A CAT deve ser compatível '
        'com a parcela relevante.</p><a href="/triagem-tecnica/">Conversar</a></main>'
    )
    if findings_for(legitimate) or semantic_fixture_findings(legitimate, "/conteudos/acervo/"):
        raise AssertionError("legitimate_technical_condition_rejected")
    passed.append("legitimate_technical_condition")

    legitimate_demo = (
        '<main><h1>Entregas e casos</h1><p>Este demonstrativo não é cliente real.</p>'
        '<p>Um caso CONFENGE só é publicado com autorização do contratante.</p>'
        '<a href="/triagem-tecnica/">Conversar</a></main>'
    )
    if semantic_fixture_findings(legitimate_demo, "/confianca/"):
        raise AssertionError("legitimate_demonstrative_separation_rejected")
    passed.append("legitimate_demonstrative_separation")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        artifact = root / "_site"
        (artifact / "nova-rota").mkdir(parents=True)
        (artifact / "index.html").write_text("<main><h1>Home</h1></main>", encoding="utf-8")
        (artifact / "nova-rota" / "index.html").write_text(
            "<main><h1>Nova</h1></main>", encoding="utf-8"
        )
        manifest = root / "manifest.json"
        manifest.write_text(
            json.dumps({"html_route_count": 1, "html_routes": ["/"]}), encoding="utf-8"
        )
        report = coverage_report(artifact, manifest)
        if report["ok"] or report["artifact_routes_unlisted"] != ["/nova-rota/"]:
            raise AssertionError("unlisted_artifact_route_not_rejected")
    passed.append("unlisted_artifact_route")

    # The canonical stage overlay replaces packaged opportunity fixtures with
    # official records.  Compare two independent file sets while requiring all
    # served bodies to be mirrored and scanned.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        artifact = root / "_site"
        mirror = root / "served"
        for base in (artifact, mirror):
            base.mkdir()
            (base / "index.html").write_text(
                "<main><h1>CONFENGE</h1><p>Engenharia para obras.</p></main>",
                encoding="utf-8",
            )
        packaged = artifact / "oportunidades" / "fixture" / "index.html"
        packaged.parent.mkdir(parents=True)
        packaged.write_text("<main><h1>Oportunidade de exemplo</h1></main>", encoding="utf-8")
        served = mirror / "oportunidades" / "registro-oficial" / "index.html"
        served.parent.mkdir(parents=True)
        served.write_text("<main><h1>Oportunidade oficial</h1></main>", encoding="utf-8")
        manifest = root / "manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "html_route_count": 2,
                    "html_routes": ["/", "/oportunidades/fixture/"],
                }
            ),
            encoding="utf-8",
        )
        inventory = root / "server-inventory.txt"
        inventory.write_text(
            "index.html\noportunidades/registro-oficial/index.html\n",
            encoding="utf-8",
        )
        report = coverage_report(
            artifact,
            manifest,
            server_inventory=inventory,
            server_mirror=mirror,
        )
        if not report["ok"]:
            raise AssertionError(f"authorized_server_overlay_rejected:{report['errors']}")
        passed.append("authorized_server_overlay")

        inventory.write_text("index.html\nsurpresa/index.html\n", encoding="utf-8")
        surprise = mirror / "surpresa" / "index.html"
        surprise.parent.mkdir(parents=True)
        surprise.write_text("<main><h1>Surpresa</h1></main>", encoding="utf-8")
        served.unlink()
        report = coverage_report(
            artifact,
            manifest,
            server_inventory=inventory,
            server_mirror=mirror,
        )
        if report["ok"] or not report["runtime"]["server_unauthorized_html_added"]:
            raise AssertionError("unauthorized_server_route_not_rejected")
        passed.append("unauthorized_server_route")

        report = coverage_report(
            artifact,
            manifest,
            server_inventory=inventory,
        )
        if report["ok"] or "server_inventory_without_body_mirror" not in report["errors"]:
            raise AssertionError("unscanned_server_bodies_not_rejected")
        passed.append("unscanned_server_bodies")

    def fake_fetch(rel: str, _timeout: float):
        body = b"<main><h1>Pagina publica</h1></main>"
        return (
            {
                "path": rel,
                "url": _url_for_relpath(rel),
                "status": 200,
                "final_url": _url_for_relpath(rel),
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "headers": {"content-type": "text/html"},
                "error": None,
            },
            body,
        )

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        inventory = root / "inventory.txt"
        inventory.write_text("index.html\nops/index.html\n", encoding="utf-8")
        mirror_report = fetch_server_mirror(
            inventory,
            root / "mirror",
            root / "report.json",
            fetcher=fake_fetch,
        )
        if (
            not mirror_report["ok"]
            or mirror_report["fetched_html"] != 1
            or mirror_report["skipped_private"] != ["ops/index.html"]
            or not (root / "mirror" / "index.html").is_file()
        ):
            raise AssertionError("public_mirror_fetch_contract_failed")
    passed.append("public_mirror_fetch_and_private_skip")

    def fake_failure(rel: str, _timeout: float):
        return (
            {
                "path": rel,
                "url": _url_for_relpath(rel),
                "status": 503,
                "final_url": _url_for_relpath(rel),
                "sha256": None,
                "bytes": None,
                "headers": {},
                "error": "unexpected_http_status:503",
            },
            None,
        )

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        inventory = root / "inventory.txt"
        inventory.write_text("index.html\n", encoding="utf-8")
        mirror_report = fetch_server_mirror(
            inventory,
            root / "mirror",
            root / "report.json",
            fetcher=fake_failure,
        )
        if mirror_report["ok"] or mirror_report["failed_html"] != 1:
            raise AssertionError("failed_public_fetch_not_rejected")
    passed.append("failed_public_fetch")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        inventory = root / "inventory.txt"
        inventory.write_text("# no HTML\n", encoding="utf-8")
        mirror_report = fetch_server_mirror(
            inventory,
            root / "mirror",
            root / "report.json",
            fetcher=fake_fetch,
        )
        if mirror_report["ok"] or "server_inventory_html_empty" not in mirror_report["errors"]:
            raise AssertionError("empty_server_inventory_not_rejected")
    passed.append("empty_server_inventory")
    return passed


def _fixture_report(kind: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        artifact = root / "_site"
        (artifact / "rota").mkdir(parents=True)
        (artifact / "index.html").write_text("<main><h1>Home</h1></main>", encoding="utf-8")
        (artifact / "rota" / "index.html").write_text(
            "<meta name='robots' content='noindex'><main><h1>Rota</h1></main>",
            encoding="utf-8",
        )
        routes = ["/", "/rota/"]
        if kind == "unlisted-artifact":
            routes.remove("/rota/")
        elif kind == "missing-artifact":
            routes.append("/ausente/")
        manifest = root / "manifest.json"
        manifest.write_text(
            json.dumps({"html_route_count": len(routes), "html_routes": routes}),
            encoding="utf-8",
        )
        return coverage_report(artifact, manifest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, default=ROOT / "_site")
    parser.add_argument(
        "--manifest", type=Path, default=ROOT / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    )
    parser.add_argument("--report", type=Path)
    parser.add_argument("--server-inventory", type=Path)
    parser.add_argument("--server-mirror", type=Path)
    parser.add_argument(
        "--fetch-server",
        type=Path,
        metavar="INVENTORY",
        help="fetch canonical production HTML listed in INVENTORY, then exit",
    )
    parser.add_argument("--fetch-mirror", type=Path)
    parser.add_argument("--fetch-report", type=Path)
    parser.add_argument("--fetch-concurrency", type=int, default=8)
    parser.add_argument("--fetch-timeout", type=float, default=20.0)
    parser.add_argument("--fixture", choices=("matching", "unlisted-artifact", "missing-artifact"))
    args = parser.parse_args()

    if args.fetch_server is not None:
        if args.fetch_mirror is None or args.fetch_report is None:
            parser.error("--fetch-server requires --fetch-mirror and --fetch-report")
        try:
            fetched = fetch_server_mirror(
                args.fetch_server,
                args.fetch_mirror,
                args.fetch_report,
                concurrency=args.fetch_concurrency,
                timeout=args.fetch_timeout,
            )
        except ValueError as exc:
            print(f"PUBLIC_HTML_MIRROR_FAIL {exc}")
            return 1
        print(
            json.dumps(
                {
                    "ok": fetched["ok"],
                    "canonical_origin": fetched["canonical_origin"],
                    "inventory_html_total": fetched["inventory_html_total"],
                    "fetched_html": fetched["fetched_html"],
                    "failed_html": fetched["failed_html"],
                    "skipped_private": len(fetched["skipped_private"]),
                    "errors": fetched["errors"],
                    "mirror": fetched["mirror"],
                    "report": str(args.fetch_report),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0 if fetched["ok"] else 1

    try:
        mutations = run_mutation_contracts()
        report = (
            _fixture_report(args.fixture)
            if args.fixture
            else coverage_report(
                args.artifact,
                args.manifest,
                server_inventory=args.server_inventory,
                server_mirror=args.server_mirror,
            )
        )
    except (AssertionError, ValueError) as exc:
        print(f"PUBLIC_SURFACE_COVERAGE_FAIL {exc}")
        return 1
    report["mutation_contracts_passed"] = mutations
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    summary = {
        "ok": report["ok"],
        "artifact_html_total": report["artifact_html_total"],
        "artifact_index_routes": report["artifact_index_routes"],
        "manifest_routes": report["manifest_routes"],
        "copy_scanned_html": report["copy_scanned_html"],
        "copy_scanned_noindex_html": report["copy_scanned_noindex_html"],
        "copy_findings_routes": len(report["copy_findings"]),
        "semantic_findings_routes": len(report["semantic_findings"]),
        "control_vocabulary_matched_occurrences": report["control_vocabulary"][
            "matched_occurrences"
        ],
        "control_vocabulary_legitimate_occurrences": report["control_vocabulary"][
            "legitimate_occurrences"
        ],
        "control_vocabulary_defect_occurrences": report["control_vocabulary"][
            "defect_occurrences"
        ],
        "artifact_routes_unlisted": len(report["artifact_routes_unlisted"]),
        "manifest_routes_missing_from_artifact": len(
            report["manifest_routes_missing_from_artifact"]
        ),
        "mutation_contracts_passed": len(mutations),
        "errors": report["errors"],
        "report": str(args.report) if args.report else None,
    }
    if report.get("runtime"):
        runtime = report["runtime"]
        summary.update(
            {
                "server_html_total": runtime["server_html_total"],
                "server_html_bodies_scanned": runtime["server_html_bodies_scanned"],
                "server_unauthorized_html_added": len(
                    runtime["server_unauthorized_html_added"]
                ),
                "server_unexpected_html_removed": len(
                    runtime["server_unexpected_html_removed"]
                ),
            }
        )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
