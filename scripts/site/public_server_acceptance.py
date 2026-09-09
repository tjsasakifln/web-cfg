#!/usr/bin/env python3
"""Read-only acceptance of the exact artifact served by the canonical host."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import http.client
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.site.public_surface_coverage import (  # noqa: E402
    _CanonicalRedirects,
    _fetch_one,
    coverage_report,
    fetch_server_mirror,
    run_mutation_contracts,
)

CANONICAL_BASE = "https://confenge.com.br"
INVENTORY_SCHEMA = "confenge.served-html-inventory/v1"
REPORT_SCHEMA = "confenge.public-server-acceptance/v1"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
HEX256 = re.compile(r"^[0-9a-f]{64}$")
SAFE_HTML = re.compile(r"^[A-Za-z0-9._/-]+\.html$")
IDENTITY_LIMIT = 1024 * 1024
CACHE_PROPAGATION_SECONDS = 310.0
CACHE_RETRY_MAX_SLEEP = 15.0
CACHE_TRANSIENT_STATES = {"HIT", "STALE", "UPDATING"}
_EVIDENCE_HEADERS = (
    "Age",
    "Cache-Control",
    "CF-Cache-Status",
    "Content-Length",
    "Content-Type",
    "ETag",
    "Last-Modified",
    "Location",
    "Server",
    "X-Build-Sha",
    "X-Confenge-Host-Architecture-Version",
    "X-Confenge-Build-Sha",
    "X-Confenge-Release-Id",
    "X-Release-Id",
)
EXPECTED_SERVER_HEADER = "cloudflare"
EXPECTED_HOST_ARCHITECTURE_VERSION = "confenge-nginx-node/v2"
EXPECTED_STORAGE_BACKEND = "filesystem"


class _Title(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs) -> None:  # noqa: ANN001
        if tag.lower() == "title":
            self.inside = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.inside = False

    def handle_data(self, data: str) -> None:
        if self.inside:
            self.parts.append(data)


def _title(path: Path) -> str:
    parser = _Title()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return " ".join(" ".join(parser.parts).split())


def _normalized_html_path(raw: str) -> str | None:
    item = raw.strip().replace("\\", "/")
    item = item.removeprefix("/_site/").removeprefix("_site/").lstrip("/")
    if (
        not item
        or ".." in Path(item).parts
        or not SAFE_HTML.fullmatch(item)
    ):
        return None
    return item


def _request_path_for_html(rel: str) -> str:
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel.removesuffix("index.html")
    return "/" + rel


def load_served_inventory(path: Path) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {}, [f"served_inventory_invalid:{exc}"]
    if not isinstance(payload, dict) or payload.get("schema") != INVENTORY_SCHEMA:
        return {}, ["served_inventory_schema_invalid"]
    release_sha = str(payload.get("release_sha") or "")
    if not FULL_SHA.fullmatch(release_sha):
        errors.append("served_inventory_release_sha_invalid")
    raw_hashes = payload.get("html_sha256")
    if not isinstance(raw_hashes, dict) or not raw_hashes:
        errors.append("served_inventory_html_sha256_empty")
        return {"payload": payload, "release_sha": release_sha, "html_sha256": {}}, errors
    normalized: dict[str, str] = {}
    for raw, digest in raw_hashes.items():
        rel = _normalized_html_path(str(raw))
        if rel is None or not HEX256.fullmatch(str(digest)):
            errors.append(f"served_inventory_html_entry_invalid:{str(raw)[:100]}")
            continue
        if rel in normalized:
            errors.append(f"served_inventory_html_entry_duplicate:{rel}")
            continue
        normalized[rel] = str(digest)
    if len(normalized) != len(raw_hashes):
        errors.append("served_inventory_html_accounting_mismatch")
    if not isinstance(payload.get("overlay"), dict):
        errors.append("served_inventory_overlay_invalid")
    if not isinstance(payload.get("build_info"), dict):
        errors.append("served_inventory_build_info_invalid")
    if not isinstance(payload.get("runtime_info"), dict):
        errors.append("served_inventory_runtime_info_invalid")
    raw_dispositions = payload.get("http_dispositions")
    dispositions: dict[str, dict[str, Any]] = {}
    if not isinstance(raw_dispositions, dict):
        errors.append("served_inventory_http_dispositions_invalid")
    else:
        for raw, disposition in raw_dispositions.items():
            rel = _normalized_html_path(str(raw))
            if rel is None or not isinstance(disposition, dict):
                errors.append(f"served_inventory_http_disposition_invalid:{str(raw)[:100]}")
                continue
            required = {
                "request_path", "status", "location", "final_status",
                "effective_html_path", "sha256",
            }
            effective = _normalized_html_path(str(disposition.get("effective_html_path") or ""))
            status = disposition.get("status")
            final_status = disposition.get("final_status")
            location = disposition.get("location")
            valid = (
                set(disposition) == required
                and disposition.get("request_path") == _request_path_for_html(rel)
                and status in {200, 301, 302, 410}
                and final_status in {200, 410}
                and effective is not None
                and HEX256.fullmatch(str(disposition.get("sha256") or ""))
                and effective in normalized
                and disposition.get("sha256") == normalized.get(effective)
            )
            if status == 200:
                valid = valid and location is None and final_status == 200
            elif status in {301, 302}:
                valid = (
                    valid
                    and isinstance(location, str)
                    and location.startswith("/")
                    and not location.startswith("//")
                    and final_status == 200
                )
            else:
                valid = (
                    valid
                    and location is None
                    and final_status == 410
                    and effective == "404.html"
                )
            if not valid:
                errors.append(f"served_inventory_http_disposition_invalid:{rel}")
                continue
            dispositions[rel] = {**disposition, "effective_html_path": effective}
        if set(dispositions) != set(normalized):
            errors.append("served_inventory_http_dispositions_accounting_mismatch")
    raw_probes = payload.get("contract_probes")
    contract_probes: dict[str, dict[str, Any]] = {}
    if not isinstance(raw_probes, dict):
        errors.append("served_inventory_contract_probes_invalid")
    else:
        error_digest = normalized.get("404.html")
        required_probe = {
            "request_path",
            "status",
            "location",
            "final_status",
            "effective_html_path",
            "sha256",
            "rule_order",
            "match",
        }
        for raw_path, probe in raw_probes.items():
            request_path = str(raw_path)
            safe_path = urllib.parse.urlsplit(request_path)
            valid = (
                isinstance(probe, dict)
                and set(probe) == required_probe
                and probe.get("request_path") == request_path
                and safe_path.scheme == ""
                and safe_path.netloc == ""
                and safe_path.query == ""
                and safe_path.fragment == ""
                and request_path.startswith("/")
                and not request_path.startswith("//")
                and "\\" not in request_path
                and ".." not in Path(urllib.parse.unquote(request_path)).parts
                and probe.get("status") == 410
                and probe.get("location") is None
                and probe.get("final_status") == 410
                and probe.get("effective_html_path") == "404.html"
                and probe.get("sha256") == error_digest
                and isinstance(probe.get("rule_order"), int)
                and probe.get("rule_order") >= 0
                and probe.get("match") in {"exact", "prefix"}
            )
            if not valid:
                errors.append(
                    f"served_inventory_contract_probe_invalid:{request_path[:100]}"
                )
                continue
            contract_probes[request_path] = dict(probe)
    return {
        "payload": payload,
        "release_sha": release_sha,
        "html_sha256": normalized,
        "http_dispositions": dispositions,
        "contract_probes": contract_probes,
        "overlay": payload.get("overlay"),
        "build_info": payload.get("build_info"),
        "runtime_info": payload.get("runtime_info"),
    }, errors


def _fetch_public_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "CONFENGE-Public-Server-Acceptance/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(_CanonicalRedirects())
        with opener.open(request, timeout=timeout) as response:
            body = response.read(IDENTITY_LIMIT + 1)
            final_url = response.geturl()
            status = int(response.status)
            content_type = str(response.headers.get("Content-Type") or "")
            if len(body) > IDENTITY_LIMIT:
                raise ValueError("identity_body_too_large")
            parsed = urllib.parse.urlsplit(final_url)
            if parsed.scheme != "https" or parsed.netloc != "confenge.com.br":
                raise ValueError("identity_redirect_outside_canonical_origin")
            if status != 200 or "json" not in content_type.lower():
                raise ValueError(f"identity_response_invalid:{status}:{content_type}")
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError("identity_payload_not_object")
            headers = {
                name.lower(): response.headers.get(name)
                for name in _EVIDENCE_HEADERS
                if response.headers.get(name) is not None
            }
            return {
                "ok": True,
                "url": url,
                "final_url": final_url,
                "status": status,
                "content_type": content_type,
                "sha256": hashlib.sha256(body).hexdigest(),
                "payload": payload,
                "headers": headers,
                "error": None,
            }
    except (OSError, TimeoutError, urllib.error.URLError, json.JSONDecodeError, ValueError) as exc:
        return {
            "ok": False,
            "url": url,
            "final_url": None,
            "status": None,
            "content_type": None,
            "sha256": None,
            "payload": {},
            "headers": {},
            "error": f"{type(exc).__name__}:{exc}",
        }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _read_first_hop_body(response: Any, status: int) -> tuple[bytes, str | None]:
    """Keep transport failures explicit; never accept an empty/truncated error page."""
    limit = 5 * 1024 * 1024
    try:
        body = response.read(limit + 1)
    except http.client.IncompleteRead as exc:
        return exc.partial, f"first_hop_read_failed:IncompleteRead:{exc}"
    except OSError as exc:
        return b"", f"first_hop_read_failed:{type(exc).__name__}:{exc}"
    if len(body) > limit:
        return body, "first_hop_body_too_large"
    declared = response.headers.get("Content-Length") if response.headers else None
    if declared is not None:
        try:
            expected_length = int(declared)
        except ValueError:
            return body, "first_hop_invalid_content_length"
        if expected_length < 0 or expected_length != len(body):
            return body, f"first_hop_content_length_mismatch:{expected_length}:{len(body)}"
    if status == 410 and not body:
        return body, "first_hop_empty_410_body"
    return body, None


def _probe_first_hop(url: str, timeout: float) -> tuple[dict[str, Any], bytes | None]:
    """GET one normal URL without following its first HTTP disposition."""
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "Cache-Control": "no-cache",
            "User-Agent": "CONFENGE-Public-Server-Acceptance/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(_NoRedirect())
        with opener.open(request, timeout=timeout) as response:
            body, error = _read_first_hop_body(response, int(response.status))
            headers = {
                name.lower(): response.headers.get(name)
                for name in _EVIDENCE_HEADERS
                if response.headers.get(name) is not None
            }
            return {
                "url": url,
                "status": int(response.status),
                "location": response.headers.get("Location"),
                "content_type": response.headers.get("Content-Type"),
                "headers": headers,
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes_received": len(body),
                "error": error,
            }, None if error else body
    except urllib.error.HTTPError as exc:
        try:
            body, error = _read_first_hop_body(exc, int(exc.code))
        finally:
            exc.close()
        headers = {
            name.lower(): exc.headers.get(name)
            for name in _EVIDENCE_HEADERS
            if exc.headers and exc.headers.get(name) is not None
        }
        return {
            "url": url,
            "status": int(exc.code),
            "location": exc.headers.get("Location") if exc.headers else None,
            "content_type": exc.headers.get("Content-Type") if exc.headers else None,
            "headers": headers,
            "sha256": hashlib.sha256(body).hexdigest() if body else None,
            "bytes_received": len(body),
            "error": error,
        }, None if error else body or None
    except (OSError, TimeoutError, urllib.error.URLError, ValueError) as exc:
        return {
            "url": url,
            "status": None,
            "location": None,
            "content_type": None,
            "headers": {},
            "sha256": None,
            "error": f"{type(exc).__name__}:{exc}",
        }, None


def _identity_snapshot(
    base: str,
    expected_sha: str,
    artifact_build: dict[str, Any],
    inventory_runtime: dict[str, Any],
    fetcher: Callable[[str, float], dict[str, Any]],
    timeout: float,
) -> tuple[dict[str, Any], list[str]]:
    build = fetcher(f"{base}/.well-known/build-info.json", timeout)
    runtime = fetcher(f"{base}/.well-known/runtime-info.json", timeout)
    errors: list[str] = []
    if not build.get("ok"):
        errors.append("public_build_identity_fetch_failed")
    if not runtime.get("ok"):
        errors.append("public_runtime_identity_fetch_failed")
    build_payload = build.get("payload") if isinstance(build.get("payload"), dict) else {}
    runtime_payload = runtime.get("payload") if isinstance(runtime.get("payload"), dict) else {}
    if build_payload.get("commit") != expected_sha:
        errors.append("public_build_sha_mismatch")
    if runtime_payload.get("release_sha") != expected_sha:
        errors.append("public_runtime_sha_mismatch")
    if build_payload.get("environment") != "production":
        errors.append("public_build_environment_mismatch")
    if runtime_payload.get("environment") != "production":
        errors.append("public_runtime_environment_mismatch")

    for field in ("artifact_hash", "manifest_hash"):
        expected = artifact_build.get(field)
        if not HEX256.fullmatch(str(expected or "")):
            errors.append(f"artifact_build_{field}_invalid")
        if build_payload.get(field) != expected:
            errors.append(f"public_build_{field}_mismatch")

    runtime_fields = (
        "public_artifact_hash",
        "release_bundle_hash",
        "host_architecture_version",
        "storage_backend",
    )
    for field in runtime_fields:
        if runtime_payload.get(field) != inventory_runtime.get(field):
            errors.append(f"public_runtime_{field}_mismatch")
    for field in ("public_artifact_hash", "release_bundle_hash"):
        if not HEX256.fullmatch(str(inventory_runtime.get(field) or "")):
            errors.append(f"served_inventory_runtime_{field}_invalid")
    if inventory_runtime.get("public_artifact_hash") != artifact_build.get("artifact_hash"):
        errors.append("served_inventory_runtime_public_artifact_hash_mismatch")
    if (
        inventory_runtime.get("host_architecture_version")
        != EXPECTED_HOST_ARCHITECTURE_VERSION
    ):
        errors.append("served_inventory_runtime_host_architecture_version_mismatch")
    if inventory_runtime.get("storage_backend") != EXPECTED_STORAGE_BACKEND:
        errors.append("served_inventory_runtime_storage_backend_mismatch")

    for name, response in (("build", build), ("runtime", runtime)):
        headers = response.get("headers") if isinstance(response.get("headers"), dict) else {}
        if str(headers.get("server") or "").lower() != EXPECTED_SERVER_HEADER:
            errors.append(f"public_{name}_server_header_mismatch")
        if (
            headers.get("x-confenge-host-architecture-version")
            != EXPECTED_HOST_ARCHITECTURE_VERSION
        ):
            errors.append(f"public_{name}_host_architecture_header_mismatch")
    return {"build": build, "runtime": runtime}, errors


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class CachePropagationFetcher:
    """Retry only a byte mismatch explicitly attributable to edge HTML cache."""

    def __init__(
        self,
        expected: dict[str, str],
        *,
        fetcher=_fetch_one,  # noqa: ANN001
        deadline_seconds: float = CACHE_PROPAGATION_SECONDS,
        started_at: float | None = None,
        deadline_at: float | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.expected = expected
        self.fetcher = fetcher
        self.clock = clock
        self.sleeper = sleeper
        self.started = clock() if started_at is None else started_at
        self.deadline = (
            self.started + deadline_seconds if deadline_at is None else deadline_at
        )
        self.attempts: dict[str, list[dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def _record(self, rel: str, entry: dict[str, Any], decision: str) -> None:
        headers = entry.get("headers") if isinstance(entry.get("headers"), dict) else {}
        row = {
            "attempt": 0,
            "at_offset_seconds": round(max(0.0, self.clock() - self.started), 3),
            "status": entry.get("status"),
            "sha256": entry.get("sha256"),
            "cf_cache_status": str(headers.get("cf-cache-status") or "").upper() or None,
            "age": headers.get("age"),
            "error": entry.get("error"),
            "decision": decision,
        }
        with self._lock:
            history = self.attempts.setdefault(rel, [])
            row["attempt"] = len(history) + 1
            history.append(row)

    def __call__(self, rel: str, timeout: float):
        expected = self.expected.get(rel)
        if expected is None:
            entry = {
                "path": rel,
                "url": None,
                "status": None,
                "final_url": None,
                "sha256": None,
                "bytes": None,
                "headers": {},
                "error": "host_inventory_digest_absent",
            }
            self._record(rel, entry, "inventory_digest_absent")
            return entry, None
        while True:
            entry, body = self.fetcher(rel, timeout)
            entry = dict(entry)
            if entry.get("error") or entry.get("status") != 200 or body is None:
                self._record(rel, entry, "fetch_failure_no_retry")
                return entry, body
            if entry.get("sha256") == expected:
                self._record(rel, entry, "host_digest_matched")
                return entry, body
            headers = entry.get("headers") if isinstance(entry.get("headers"), dict) else {}
            cache_state = str(headers.get("cf-cache-status") or "").upper()
            if cache_state not in CACHE_TRANSIENT_STATES:
                entry["error"] = f"host_digest_mismatch_nontransient_cache:{cache_state or 'ABSENT'}"
                self._record(rel, entry, "digest_mismatch_no_retry")
                return entry, None
            remaining = self.deadline - self.clock()
            if remaining <= 0:
                entry["error"] = "host_digest_mismatch_cache_deadline_exhausted"
                self._record(rel, entry, "cache_deadline_exhausted")
                return entry, None
            self._record(rel, entry, "retry_cache_propagation")
            self.sleeper(min(CACHE_RETRY_MAX_SLEEP, remaining))


def verify_contract_probes(
    probes: dict[str, dict[str, Any]],
    *,
    base: str,
    fetcher: Callable[[str, float], tuple[dict[str, Any], bytes | None]],
    concurrency: int,
    timeout: float,
    started_at: float,
    deadline_at: float,
    clock: Callable[[], float],
    sleeper: Callable[[float], None],
) -> dict[str, Any]:
    """Prove withdrawn contract paths return the exact 410 error response."""
    history: dict[str, list[dict[str, Any]]] = {}
    history_lock = threading.Lock()

    def verify_one(item: tuple[str, dict[str, Any]]) -> dict[str, Any]:
        request_path, expected = item
        url = base + request_path
        attempts: list[dict[str, Any]] = []
        while True:
            entry, body = fetcher(url, timeout)
            entry = dict(entry)
            headers = entry.get("headers") if isinstance(entry.get("headers"), dict) else {}
            cache_state = str(headers.get("cf-cache-status") or "").upper()
            exact = (
                entry.get("error") is None
                and entry.get("status") == expected["status"]
                and entry.get("location") == expected["location"]
                and body is not None
                and entry.get("sha256") == expected["sha256"]
                and "text/html" in str(entry.get("content_type") or "").lower()
            )
            attempt = {
                "attempt": len(attempts) + 1,
                "at_offset_seconds": round(max(0.0, clock() - started_at), 3),
                "status": entry.get("status"),
                "location": entry.get("location"),
                "sha256": entry.get("sha256"),
                "cf_cache_status": cache_state or None,
                "age": headers.get("age"),
                "headers": headers,
                "bytes_received": entry.get("bytes_received"),
                "error": entry.get("error"),
                "decision": None,
            }
            if exact:
                attempt["decision"] = "exact_410_contract_matched"
                attempts.append(attempt)
                outcome = {
                    "request_path": request_path,
                    "url": url,
                    "expected": expected,
                    "actual_status": entry.get("status"),
                    "actual_location": entry.get("location"),
                    "actual_sha256": entry.get("sha256"),
                    "error_page_digest_matched": True,
                    "withdrawn_source_body_absent": True,
                    "ok": True,
                    "error": None,
                }
                break
            remaining = deadline_at - clock()
            retryable_old_html = (
                entry.get("error") is None
                and entry.get("status") == 200
                and cache_state in CACHE_TRANSIENT_STATES
                and remaining > 0
            )
            if retryable_old_html:
                attempt["decision"] = "retry_cached_pre_release_200"
                attempts.append(attempt)
                sleeper(min(CACHE_RETRY_MAX_SLEEP, remaining))
                continue
            if (
                entry.get("status") == 200
                and cache_state in CACHE_TRANSIENT_STATES
                and remaining <= 0
            ):
                failure = "contract_probe_cache_deadline_exhausted"
                attempt["decision"] = "cache_deadline_exhausted"
            else:
                failure = "contract_probe_response_mismatch"
                attempt["decision"] = "response_mismatch_no_retry"
            attempts.append(attempt)
            outcome = {
                "request_path": request_path,
                "url": url,
                "expected": expected,
                "actual_status": entry.get("status"),
                "actual_location": entry.get("location"),
                "actual_sha256": entry.get("sha256"),
                "error_page_digest_matched": False,
                "withdrawn_source_body_absent": False,
                "ok": False,
                "error": failure,
            }
            break
        with history_lock:
            history[request_path] = attempts
        return outcome

    rows: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        jobs = [pool.submit(verify_one, item) for item in sorted(probes.items())]
        for job in concurrent.futures.as_completed(jobs):
            rows.append(job.result())
    rows.sort(key=lambda row: row["request_path"])
    failures = [row for row in rows if not row["ok"]]
    return {
        "schema": "confenge.withdrawn-contract-probes/v1",
        "planned": len(probes),
        "executed": len(rows),
        "passed": len(rows) - len(failures),
        "failures": failures,
        "results": rows,
        "attempts": history,
        "ok": not failures and len(rows) == len(probes),
    }


def run_acceptance(
    *,
    site: Path,
    expected_sha: str,
    base: str,
    server_inventory: Path,
    server_overlay_manifest: Path | None,
    report_dir: Path,
    concurrency: int = 8,
    timeout: float = 20.0,
    identity_fetcher: Callable[[str, float], dict[str, Any]] = _fetch_public_json,
    html_fetcher=None,  # noqa: ANN001
    disposition_fetcher: Callable[
        [str, float], tuple[dict[str, Any], bytes | None]
    ] = _probe_first_hop,
    run_mutations: bool = True,
    cache_deadline_seconds: float = CACHE_PROPAGATION_SECONDS,
    clock: Callable[[], float] = time.monotonic,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    errors: list[str] = []
    site = site.resolve()
    report_dir = report_dir.resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    if base.rstrip("/") != CANONICAL_BASE:
        errors.append("base_must_be_canonical_confenge_https")
    base = CANONICAL_BASE
    if not FULL_SHA.fullmatch(expected_sha):
        errors.append("expected_sha_invalid")
    if not site.is_dir() or site.name != "_site":
        errors.append("site_must_be_exact_artifact_directory")

    inventory, inventory_errors = load_served_inventory(server_inventory)
    errors.extend(inventory_errors)
    if inventory.get("release_sha") != expected_sha:
        errors.append("served_inventory_release_sha_mismatch")
    if (inventory.get("build_info") or {}).get("commit") != expected_sha:
        errors.append("served_inventory_build_sha_mismatch")
    inline_overlay = inventory.get("overlay") or {}
    overlay_payload = inline_overlay
    if server_overlay_manifest is not None:
        try:
            supplied_overlay = json.loads(
                server_overlay_manifest.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            supplied_overlay = {}
            errors.append(f"server_overlay_manifest_invalid:{exc}")
        if supplied_overlay != inline_overlay:
            errors.append("served_inventory_overlay_mismatch")
        else:
            overlay_payload = supplied_overlay
    effective_overlay_manifest = report_dir / "server-overlay-manifest.json"
    _write_json(effective_overlay_manifest, overlay_payload)
    if overlay_payload.get("release_sha") != expected_sha:
        errors.append("server_overlay_release_sha_mismatch")

    try:
        artifact_build = json.loads(
            (site / ".well-known" / "build-info.json").read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError) as exc:
        artifact_build = {}
        errors.append(f"artifact_build_info_invalid:{exc}")
    if artifact_build.get("commit") != expected_sha:
        errors.append("artifact_build_sha_mismatch")
    inventory_build = inventory.get("build_info") or {}
    for field in ("artifact_hash", "manifest_hash"):
        if inventory_build.get(field) != artifact_build.get(field):
            errors.append(f"served_inventory_build_{field}_mismatch")
    inventory_runtime = inventory.get("runtime_info") or {}
    if inventory_runtime.get("release_sha") != expected_sha:
        errors.append("served_inventory_runtime_sha_mismatch")
    if inventory_runtime.get("environment") != "production":
        errors.append("served_inventory_runtime_environment_mismatch")

    before, before_errors = _identity_snapshot(
        base,
        expected_sha,
        artifact_build,
        inventory_runtime,
        identity_fetcher,
        timeout,
    )
    errors.extend(f"before:{item}" for item in before_errors)
    _write_json(report_dir / "identity-before.json", before)

    derived_inventory = report_dir / "server-inventory-derived.txt"
    fetch_inventory = report_dir / "server-inventory-fetch.txt"
    hashes = inventory.get("html_sha256") or {}
    dispositions = inventory.get("http_dispositions") or {}
    derived_inventory.write_text(
        "".join(f"{rel}\n" for rel in sorted(hashes)), encoding="utf-8"
    )
    fetch_rels = sorted(
        rel
        for rel, disposition in dispositions.items()
        if disposition.get("status") != 410
    )
    fetch_inventory.write_text(
        "".join(f"{rel}\n" for rel in fetch_rels), encoding="utf-8"
    )
    mirror = report_dir / "server-html-mirror"
    mirror_report_path = report_dir / "server-html-fetch.json"
    cache_started_at = clock()
    cache_deadline_at = cache_started_at + cache_deadline_seconds
    propagation_fetcher = CachePropagationFetcher(
        {rel: str(dispositions[rel]["sha256"]) for rel in fetch_rels},
        fetcher=html_fetcher or _fetch_one,
        deadline_seconds=cache_deadline_seconds,
        started_at=cache_started_at,
        deadline_at=cache_deadline_at,
        clock=clock,
        sleeper=sleeper,
    )
    try:
        kwargs: dict[str, Any] = {
            "concurrency": concurrency,
            "timeout": timeout,
            "fetcher": propagation_fetcher,
        }
        mirror_report = fetch_server_mirror(
            fetch_inventory, mirror, mirror_report_path, **kwargs
        )
    except ValueError as exc:
        mirror_report = {"ok": False, "responses": [], "errors": [str(exc)]}
        errors.append(f"server_html_fetch_setup_failed:{exc}")
        _write_json(mirror_report_path, mirror_report)
    if not mirror_report.get("ok"):
        errors.append("server_html_fetch_incomplete")
    propagation_path = report_dir / "cache-propagation-attempts.json"
    _write_json(
        propagation_path,
        {
            "schema": "confenge.public-html-cache-propagation/v1",
            "global_deadline_seconds": cache_deadline_seconds,
            "retryable_cf_cache_status": sorted(CACHE_TRANSIENT_STATES),
            "attempts": propagation_fetcher.attempts,
        },
    )

    http_rows: list[dict[str, Any]] = []
    responses = {
        str(row.get("path")): row
        for row in mirror_report.get("responses", [])
        if isinstance(row, dict)
    }
    for rel, physical_digest in sorted(hashes.items()):
        disposition = dispositions.get(rel) or {}
        expected_status = disposition.get("status")
        expected_location = disposition.get("location")
        expected_digest = disposition.get("sha256")
        effective_rel = str(disposition.get("effective_html_path") or "")
        request_url = base + str(disposition.get("request_path") or "")
        first_hop: dict[str, Any] | None = None
        row = responses.get(rel) or {}

        if expected_status in {301, 302, 410}:
            first_hop, first_body = disposition_fetcher(request_url, timeout)
            if first_hop.get("status") != expected_status:
                errors.append(f"http_first_hop_status_mismatch:{rel}")
            if first_hop.get("location") != expected_location:
                errors.append(f"http_first_hop_location_mismatch:{rel}")
            if first_hop.get("error"):
                errors.append(f"http_first_hop_fetch_failed:{rel}")
        else:
            first_body = None

        if expected_status == 410:
            actual_digest = first_hop.get("sha256") if first_hop else None
            target = mirror / rel
            digest_matches = (
                first_body is not None
                and actual_digest == expected_digest
                and "text/html"
                in str((first_hop or {}).get("content_type") or "").lower()
            )
            if first_body is not None:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(first_body)
            final_url = request_url
            actual_status = (first_hop or {}).get("status")
            content_type = (first_hop or {}).get("content_type")
            byte_count = len(first_body) if first_body is not None else None
            row_error = (first_hop or {}).get("error")
        else:
            actual_digest = row.get("sha256")
            target = mirror / rel
            expected_final_url = base + _request_path_for_html(effective_rel)
            final_url = row.get("final_url")
            actual_status = row.get("status")
            content_type = (row.get("headers") or {}).get("content-type")
            byte_count = row.get("bytes")
            row_error = row.get("error")
            digest_matches = (
                actual_status == disposition.get("final_status")
                and final_url == expected_final_url
                and actual_digest == expected_digest
                and target.is_file()
            )
            if actual_status != disposition.get("final_status"):
                errors.append(f"http_final_status_mismatch:{rel}")
            if final_url != expected_final_url:
                errors.append(f"http_final_url_mismatch:{rel}")

        if not digest_matches:
            errors.append(f"http_host_html_digest_mismatch:{rel}")
        http_rows.append(
            {
                "path": rel,
                "url": request_url,
                "status": actual_status,
                "final_url": final_url,
                "title": _title(target) if target.is_file() else None,
                "content_type": content_type,
                "bytes": byte_count,
                "physical_sha256": physical_digest,
                "expected_first_hop_status": expected_status,
                "expected_first_hop_location": expected_location,
                "expected_final_status": disposition.get("final_status"),
                "expected_effective_html_path": effective_rel,
                "host_sha256": expected_digest,
                "http_sha256": actual_digest,
                "digest_matches": digest_matches,
                "first_hop": first_hop,
                "error": row_error,
            }
        )

    contract_probes = verify_contract_probes(
        inventory.get("contract_probes") or {},
        base=base,
        fetcher=disposition_fetcher,
        concurrency=concurrency,
        timeout=timeout,
        started_at=cache_started_at,
        deadline_at=cache_deadline_at,
        clock=clock,
        sleeper=sleeper,
    )
    contract_probes_path = report_dir / "contract-probes.json"
    _write_json(contract_probes_path, contract_probes)
    if not contract_probes["ok"]:
        errors.append("withdrawn_contract_probes_failed")

    manifest = site.parent / "seo" / "PUBLIC-ARTIFACT-MANIFEST.json"
    try:
        mutations = run_mutation_contracts() if run_mutations else []
        surface = coverage_report(
            site,
            manifest,
            server_inventory=derived_inventory,
            server_mirror=mirror,
            server_overlay_manifest=effective_overlay_manifest,
        )
    except (AssertionError, ValueError) as exc:
        mutations = []
        surface = {"ok": False, "errors": [f"coverage_execution_failed:{exc}"]}
    _write_json(report_dir / "public-surface-coverage.json", surface)
    if not surface.get("ok"):
        errors.append("public_surface_coverage_failed")

    after, after_errors = _identity_snapshot(
        base,
        expected_sha,
        artifact_build,
        inventory_runtime,
        identity_fetcher,
        timeout,
    )
    errors.extend(f"after:{item}" for item in after_errors)
    _write_json(report_dir / "identity-after.json", after)
    before_build = ((before.get("build") or {}).get("payload") or {}).get("commit")
    after_build = ((after.get("build") or {}).get("payload") or {}).get("commit")
    before_runtime = ((before.get("runtime") or {}).get("payload") or {}).get("release_sha")
    after_runtime = ((after.get("runtime") or {}).get("payload") or {}).get("release_sha")
    if (before_build, before_runtime) != (after_build, after_runtime):
        errors.append("public_identity_changed_during_acceptance")

    report = {
        "schema": REPORT_SCHEMA,
        "ok": not errors,
        "expected_sha": expected_sha,
        "base": base,
        "site": str(site),
        "server_inventory": str(server_inventory.resolve()),
        "server_overlay_manifest": str(effective_overlay_manifest),
        "server_overlay_manifest_input": (
            str(server_overlay_manifest.resolve()) if server_overlay_manifest else None
        ),
        "artifact_manifest": str(manifest),
        "server_html_expected": len(hashes),
        "server_html_fetched": sum(
            1
            for row in http_rows
            if row["digest_matches"]
            and (
                row["status"] == row["expected_first_hop_status"]
                or (
                    row["expected_first_hop_status"] in {301, 302}
                    and row["status"] == row["expected_final_status"]
                    and (row["first_hop"] or {}).get("status")
                    == row["expected_first_hop_status"]
                )
            )
        ),
        "server_html_digest_matched": sum(1 for row in http_rows if row["digest_matches"]),
        "http_responses": http_rows,
        "contract_probes": {
            "planned": contract_probes["planned"],
            "executed": contract_probes["executed"],
            "passed": contract_probes["passed"],
            "failures": len(contract_probes["failures"]),
            "ok": contract_probes["ok"],
        },
        "cache_propagation_attempts": propagation_fetcher.attempts,
        "identity_before": before,
        "identity_after": after,
        "mutation_contracts_passed": mutations,
        "coverage": surface,
        "errors": errors,
        "evidence_files": {
            "identity_before": str(report_dir / "identity-before.json"),
            "identity_after": str(report_dir / "identity-after.json"),
            "derived_inventory": str(derived_inventory),
            "fetch_inventory": str(fetch_inventory),
            "overlay_manifest": str(effective_overlay_manifest),
            "fetch": str(mirror_report_path),
            "cache_propagation": str(propagation_path),
            "contract_probes": str(contract_probes_path),
            "mirror": str(mirror),
            "coverage": str(report_dir / "public-surface-coverage.json"),
        },
    }
    _write_json(report_dir / "acceptance.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--server-inventory", type=Path, required=True)
    parser.add_argument("--server-overlay-manifest", type=Path)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()
    report = run_acceptance(
        site=args.site,
        expected_sha=args.expected_sha,
        base=args.base,
        server_inventory=args.server_inventory,
        server_overlay_manifest=args.server_overlay_manifest,
        report_dir=args.report_dir,
        concurrency=args.concurrency,
        timeout=args.timeout,
    )
    print(
        json.dumps(
            {
                "ok": report["ok"],
                "expected_sha": report["expected_sha"],
                "server_html_expected": report["server_html_expected"],
                "server_html_fetched": report["server_html_fetched"],
                "server_html_digest_matched": report["server_html_digest_matched"],
                "errors": report["errors"],
                "report": str(args.report_dir / "acceptance.json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
