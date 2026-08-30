#!/usr/bin/env python3
"""Fail-closed host controls for immutable CONFENGE releases on Netcup."""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import http.server
import json
import os
import re
import shutil
import socketserver
import stat
import subprocess
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = "tjsasakifln/web-cfg"
DEFAULT_ROOT = Path("/opt/confenge-web")
SCHEMA_VERSION = "1.0.0"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
HEX_256 = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_TOP_LEVEL = {
    "_site",
    "metadata",
    "ops",
    "nginx",
    "schedules",
    "runtime",
    "netlify",
    "scripts",
    "data",
    "netlify.toml",
    "package.json",
    "package-lock.json",
}
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


class ReleaseError(RuntimeError):
    """The requested release operation failed closed."""


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


class _ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_sha(value: str) -> str:
    if not FULL_SHA.fullmatch(value):
        raise ReleaseError("SHA must be exactly 40 lowercase hexadecimal characters")
    return value


def release_root() -> Path:
    configured = os.environ.get("CONFENGE_RELEASE_ROOT")
    root = Path(configured) if configured else DEFAULT_ROOT
    if not root.is_absolute():
        raise ReleaseError("release root must be absolute")
    if root != DEFAULT_ROOT and os.environ.get("CONFENGE_RELEASE_TEST_MODE") != "1":
        raise ReleaseError(
            "CONFENGE_RELEASE_ROOT override is allowed only in test mode"
        )
    if root.exists() and root.is_symlink():
        raise ReleaseError("release root must not be a symlink")
    return root


def ensure_layout(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for name in ("incoming", "releases", "locks", "evidence", "state", "shared"):
        path = root / name
        path.mkdir(mode=0o750, exist_ok=True)
        if path.is_symlink() or not path.is_dir():
            raise ReleaseError(f"unsafe release layout entry: {path}")


@contextlib.contextmanager
def deploy_lock(root: Path) -> Iterator[None]:
    ensure_layout(root)
    lock_path = root / "locks" / "deploy.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o640)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ReleaseError(
                "deploy lock busy; another host operation is active"
            ) from exc
        os.ftruncate(descriptor, 0)
        os.write(descriptor, f"pid={os.getpid()} at={utc_now()}\n".encode())
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def append_evidence(root: Path, event: str, sha: str, **details: Any) -> None:
    payload = {
        "at": utc_now(),
        "event": event,
        "sha": sha,
        "actor": os.environ.get("SUDO_USER") or os.environ.get("USER") or "unknown",
        **details,
    }
    path = root / "evidence" / "deploy.ndjson"
    descriptor = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o640)
    try:
        os.write(
            descriptor,
            (json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n").encode(
                "utf-8"
            ),
        )
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"invalid JSON at {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReleaseError(f"expected JSON object at {path}")
    return value


def incoming_paths(
    root: Path, sha: str, directory: Path | None = None
) -> tuple[Path, Path, Path]:
    directory = directory or (root / "incoming" / sha)
    package = directory / f"confenge-web-{sha}.tar.gz"
    return (
        package,
        directory / "release-manifest.json",
        directory / f"{package.name}.sha256",
    )


def validate_release_manifest(manifest: dict[str, Any], sha: str) -> None:
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ReleaseError("unsupported release manifest schema_version")
    if manifest.get("manifest_type") != "confenge.netcup-release":
        raise ReleaseError("unexpected release manifest_type")
    if manifest.get("repo") != REPO or manifest.get("commit") != sha:
        raise ReleaseError("release manifest repo/SHA mismatch")
    contracts = manifest.get("contract_versions")
    if not isinstance(contracts, dict):
        raise ReleaseError("release contract_versions are missing")
    for field in ("integrated", "runtime", "storage", "host_architecture", "http_host_manifest"):
        if not isinstance(contracts.get(field), str) or not contracts[field]:
            raise ReleaseError(f"release contract_versions.{field} is missing")
    host_contract = manifest.get("host_contract")
    if not isinstance(host_contract, dict):
        raise ReleaseError("release host_contract identity is missing")
    for field in ("contract_hash", "manifest_hash"):
        if not HEX_256.fullmatch(str(host_contract.get(field) or "")):
            raise ReleaseError(f"release host_contract.{field} is invalid")
    if host_contract.get("host_architecture_version") != contracts["host_architecture"]:
        raise ReleaseError("release host architecture identities conflict")
    artifact = manifest.get("artifact")
    if not isinstance(artifact, dict):
        raise ReleaseError("release manifest artifact is missing")
    expected_filename = f"confenge-web-{sha}.tar.gz"
    if artifact.get("filename") != expected_filename:
        raise ReleaseError("release artifact filename does not match full SHA")
    if artifact.get("checksum_filename") != f"{expected_filename}.sha256":
        raise ReleaseError("release checksum filename does not match full SHA")
    if not HEX_256.fullmatch(str(artifact.get("sha256") or "")):
        raise ReleaseError("release manifest artifact SHA-256 is invalid")
    public = manifest.get("public_artifact")
    if not isinstance(public, dict):
        raise ReleaseError("release manifest public_artifact is missing")
    for field in ("artifact_hash", "manifest_hash"):
        if not HEX_256.fullmatch(str(public.get(field) or "")):
            raise ReleaseError(f"release manifest public_artifact.{field} is invalid")
    if public.get("identity_path") != "/.well-known/build-info.json":
        raise ReleaseError("release manifest public identity path is not canonical")
    if not isinstance(manifest.get("built_at"), str) or not manifest[
        "built_at"
    ].endswith("Z"):
        raise ReleaseError("release manifest built_at is missing or not UTC")
    tools = manifest.get("tools")
    if not isinstance(tools, dict) or not tools.get("node") or not tools.get("python"):
        raise ReleaseError("release manifest Node/Python versions are missing")


def validate_incoming(
    root: Path, sha: str, directory: Path | None = None
) -> tuple[Path, dict[str, Any]]:
    directory = directory or (root / "incoming" / sha)
    if not directory.is_dir() or directory.is_symlink():
        raise ReleaseError(
            f"incoming release directory is missing or unsafe: {directory}"
        )
    package, manifest_path, checksum_path = incoming_paths(root, sha, directory)
    expected_names = {package.name, manifest_path.name, checksum_path.name}
    actual_names = {path.name for path in directory.iterdir()}
    if actual_names != expected_names:
        raise ReleaseError(
            f"incoming release must contain exactly its three envelope files: {sorted(actual_names)}"
        )
    for path in (package, manifest_path, checksum_path):
        if not path.is_file() or path.is_symlink():
            raise ReleaseError(f"incoming release file is missing or unsafe: {path}")
    manifest = load_json(manifest_path)
    validate_release_manifest(manifest, sha)
    actual = sha256_file(package)
    expected = manifest["artifact"]["sha256"]
    if actual != expected:
        raise ReleaseError(
            f"artifact checksum mismatch: expected {expected}, found {actual}"
        )
    checksum_line = checksum_path.read_text(encoding="utf-8").strip()
    if checksum_line != f"{expected}  {package.name}":
        raise ReleaseError("detached checksum file conflicts with release manifest")
    if package.stat().st_size != manifest["artifact"].get("size_bytes"):
        raise ReleaseError("artifact size conflicts with release manifest")
    return package, manifest


def _safe_member_name(name: str) -> str:
    if not name or name.startswith("/") or "\\" in name:
        raise ReleaseError(f"unsafe tar entry: {name!r}")
    path = Path(name.rstrip("/"))
    if not path.parts or any(part in ("", ".", "..") for part in path.parts):
        raise ReleaseError(f"unsafe tar entry: {name!r}")
    if path.parts[0] not in ALLOWED_TOP_LEVEL:
        raise ReleaseError(f"unexpected top-level tar entry: {path.parts[0]}")
    return path.as_posix()


def extract_safely(package: Path, destination: Path) -> None:
    destination.mkdir(mode=0o750)
    try:
        with tarfile.open(package, mode="r:gz") as archive:
            members = archive.getmembers()
            if not members:
                raise ReleaseError("release tarball is empty")
            for member in members:
                _safe_member_name(member.name)
                if not (member.isdir() or member.isfile()):
                    raise ReleaseError(
                        f"tar links and special files are forbidden: {member.name}"
                    )
            archive.extractall(destination, members=members, filter="data")
    except (tarfile.TarError, OSError) as exc:
        raise ReleaseError(f"cannot extract release tarball: {exc}") from exc


def _parse_files_manifest(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ReleaseError(f"missing internal file manifest: {path}") from exc
    expected: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([^\x00]+)", line)
        if not match:
            raise ReleaseError("malformed internal files.sha256")
        digest, rel = match.groups()
        safe_rel = _safe_member_name(rel)
        if safe_rel in expected:
            raise ReleaseError(f"duplicate internal file manifest entry: {safe_rel}")
        expected[safe_rel] = digest
    if not expected:
        raise ReleaseError("internal files.sha256 is empty")
    return expected


def _actual_release_files(release: Path) -> dict[str, Path]:
    actual: dict[str, Path] = {}
    for path in sorted(release.rglob("*")):
        rel = path.relative_to(release).as_posix()
        if path.is_symlink():
            raise ReleaseError(f"release tree contains a symlink: {rel}")
        mode = path.stat().st_mode
        if stat.S_ISDIR(mode):
            continue
        if not stat.S_ISREG(mode):
            raise ReleaseError(f"release tree contains a special file: {rel}")
        if Path(rel).parts[0] not in ALLOWED_TOP_LEVEL:
            raise ReleaseError(
                f"release tree contains unexpected top-level entry: {rel}"
            )
        actual[rel] = path
    return actual


def verify_release_tree_at(release: Path, sha: str) -> dict[str, Any]:
    if not release.is_dir() or release.is_symlink():
        raise ReleaseError(f"release does not exist as a real directory: {sha}")
    required = (
        "_site/index.html",
        "_site/.well-known/build-info.json",
        "_site/.well-known/build-manifest.json",
        "_site/.well-known/pseo-build.json",
        "_site/.well-known/release-result.json",
        "metadata/release-source.json",
        "metadata/files.sha256",
        "metadata/release-manifest.json",
        "runtime/contract.json",
        "runtime/server.mjs",
        "runtime/schedule.mjs",
        "runtime/inventory.mjs",
        "netlify/functions/lead.cjs",
        "netlify/functions/lib/storage-config.cjs",
        "netlify/functions/lib/host-file-store.cjs",
        "data/nurture/tracks.json",
        "data/site/editorial-policy.json",
        "data/bofu-dominance/core/gsc-live-overlay.v1.json",
        "data/offers/flags.json",
        "data/offers/catalog.snapshot.json",
        "data/offers/provider-mapping.json",
        "data/offers/fixtures/asaas-sandbox/allowlist.json",
        "netlify.toml",
        "package.json",
        "package-lock.json",
        "nginx/generated/contract.normalized.json",
        "nginx/generated/manifest.json",
        "nginx/generated/headers.generated.conf",
        "nginx/generated/redirects.generated.conf",
        "nginx/generated/locations.generated.conf",
        "nginx/generated/runtime-upstream.generated.conf",
        "nginx/generated/runtime-locations.generated.conf",
        "nginx/confenge-web-http.conf",
        "nginx/confenge-web-origin.conf",
        "nginx/confenge-web-public.conf",
        "nginx/confenge-web-logrotate",
        "ops/bin/run-runtime",
        "ops/bin/run-schedule",
        "ops/lib/runtime_launcher.py",
        "ops/lib/schedule_gate.py",
        "ops/systemd/confenge-web-runtime.service",
        "scripts/storage/lib.cjs",
        "scripts/storage/retention.mjs",
        "schedules/confenge-web-retention.service",
        "schedules/confenge-web-retention.timer",
        "schedules/confenge-web-retention-alert@.service",
        "schedules/confenge-web-schedule@.service",
        "schedules/confenge-web-search-observation.timer",
        "schedules/schedule-contract.json",
    )
    for rel in required:
        path = release / rel
        if not path.is_file() or path.is_symlink():
            raise ReleaseError(f"release is missing required regular file: {rel}")

    expected = _parse_files_manifest(release / "metadata" / "files.sha256")
    actual = _actual_release_files(release)
    ignored = {"metadata/files.sha256", "metadata/release-manifest.json"}
    actual_hashed = set(actual) - ignored
    if set(expected) != actual_hashed:
        missing = sorted(set(expected) - actual_hashed)
        extra = sorted(actual_hashed - set(expected))
        raise ReleaseError(
            f"release file set mismatch; missing={missing}, extra={extra}"
        )
    for rel, digest in expected.items():
        found = sha256_file(actual[rel])
        if found != digest:
            raise ReleaseError(f"release file checksum mismatch: {rel}")

    source = load_json(release / "metadata" / "release-source.json")
    manifest = load_json(release / "metadata" / "release-manifest.json")
    validate_release_manifest(manifest, sha)
    if source.get("schema_version") != SCHEMA_VERSION:
        raise ReleaseError("internal release-source schema mismatch")
    if source.get("repo") != REPO or source.get("commit") != sha:
        raise ReleaseError("internal release-source repo/SHA mismatch")
    runtime = source.get("runtime") or {}
    contracts = manifest["contract_versions"]
    if (
        runtime.get("contract_version") != contracts["runtime"]
        or runtime.get("storage_contract_version") != contracts["storage"]
        or runtime.get("host_architecture_version") != contracts["host_architecture"]
        or runtime.get("portable_runtime_included") is not True
    ):
        raise ReleaseError("internal runtime contract mismatch")
    integrated = load_json(release / "runtime" / "contract.json")
    if (
        integrated.get("schema") != contracts["integrated"]
        or integrated.get("runtime_contract_version") != contracts["runtime"]
        or integrated.get("storage_contract_version") != contracts["storage"]
        or integrated.get("host_architecture_version") != contracts["host_architecture"]
    ):
        raise ReleaseError("packaged integrated contract mismatch")
    host_contract = load_json(release / "nginx" / "generated" / "contract.normalized.json")
    host_manifest = load_json(release / "nginx" / "generated" / "manifest.json")
    host_identity = manifest["host_contract"]
    if (
        sha256_file(release / "nginx" / "generated" / "contract.normalized.json")
        != host_identity["contract_hash"]
        or sha256_file(release / "nginx" / "generated" / "manifest.json")
        != host_identity["manifest_hash"]
        or host_contract.get("hostArchitectureVersion") != contracts["host_architecture"]
        or host_manifest.get("hostArchitectureVersion") != contracts["host_architecture"]
    ):
        raise ReleaseError("packaged host contract identity mismatch")
    upstream = (host_contract.get("runtime") or {}).get("upstream") or {}
    expected_upstream = integrated.get("netcup_production") or {}
    if any(
        upstream.get(key) != expected_upstream.get(key)
        for key in ("host", "port", "profile")
    ):
        raise ReleaseError("packaged runtime upstream contract mismatch")

    build_info = load_json(release / "_site" / ".well-known" / "build-info.json")
    build_manifest = load_json(
        release / "_site" / ".well-known" / "build-manifest.json"
    )
    pseo = load_json(release / "_site" / ".well-known" / "pseo-build.json")
    release_result = load_json(
        release / "_site" / ".well-known" / "release-result.json"
    )
    commits = {
        str(build_info.get("commit") or ""),
        str(build_manifest.get("commit") or ""),
        str(pseo.get("web_cfg_sha") or ""),
        str(release_result.get("commit") or release_result.get("web_cfg_sha") or ""),
        str(manifest.get("commit") or ""),
    }
    if commits != {sha}:
        raise ReleaseError(f"release public identity SHA mismatch: {sorted(commits)}")
    public = manifest["public_artifact"]
    for field, build_key in (
        ("artifact_hash", "artifact_hash"),
        ("manifest_hash", "manifest_hash"),
    ):
        if (
            build_info.get(build_key) != public[field]
            or build_manifest.get(build_key) != public[field]
        ):
            raise ReleaseError(f"release public identity {field} mismatch")
        if release_result.get(build_key) != public[field]:
            raise ReleaseError(f"release-result public identity {field} mismatch")
    return manifest


def verify_release_tree(root: Path, sha: str) -> dict[str, Any]:
    return verify_release_tree_at(root / "releases" / sha, sha)


def verify_release_envelope_and_tree(root: Path, sha: str) -> dict[str, Any]:
    _, incoming_manifest = validate_incoming(root, sha)
    stored_manifest = verify_release_tree(root, sha)
    if stored_manifest["artifact"]["sha256"] != incoming_manifest["artifact"]["sha256"]:
        raise ReleaseError("stored release and incoming artifact checksums diverge")
    return stored_manifest


def _http_get_json(url: str, host_header: str | None = None) -> dict[str, Any]:
    headers = {"Host": host_header} if host_header else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status != 200:
                raise ReleaseError(f"smoke returned HTTP {response.status}: {url}")
            payload = response.read(1024 * 1024)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ReleaseError(f"smoke request failed for {url}: {exc}") from exc
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"smoke returned invalid JSON: {url}") from exc
    if not isinstance(value, dict):
        raise ReleaseError(f"smoke returned non-object JSON: {url}")
    return value


def _http_get_home(url: str, host_header: str | None = None) -> None:
    headers = {"Host": host_header} if host_header else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read(1024 * 1024)
            if response.status != 200 or b"<html" not in body.lower():
                raise ReleaseError("home smoke did not return public HTML")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        if isinstance(exc, ReleaseError):
            raise
        raise ReleaseError(f"home smoke request failed: {exc}") from exc


def smoke_candidate(release: Path, sha: str) -> None:
    site = release / "_site"
    handler = lambda *args, **kwargs: _QuietHandler(
        *args, directory=str(site), **kwargs
    )
    server = _ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        _http_get_home(base + "/")
        identity = _http_get_json(base + "/.well-known/build-info.json")
        if identity.get("commit") != sha:
            raise ReleaseError("candidate smoke identity does not match expected SHA")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def verify_portable_runtime(release: Path) -> None:
    try:
        version = subprocess.run(
            ["node", "--version"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        if not re.fullmatch(r"v22\.\d+\.\d+", version):
            raise ReleaseError(f"portable runtime requires Node 22, found {version!r}")
        subprocess.run(
            ["node", "runtime/inventory.mjs", "--check", "--compact"],
            cwd=release,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except ReleaseError:
        raise
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"portable runtime verification failed: {exc}") from exc


def _local_origin() -> tuple[str, str]:
    raw = (os.environ.get("CONFENGE_LOCAL_ORIGIN") or "").rstrip("/")
    if not raw:
        raise ReleaseError("CONFENGE_LOCAL_ORIGIN is required for promote/rollback")
    parsed = urllib.parse.urlsplit(raw)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname not in LOOPBACK_HOSTS
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ReleaseError("CONFENGE_LOCAL_ORIGIN must be a loopback HTTP(S) origin")
    host = os.environ.get("CONFENGE_ORIGIN_HOST") or "confenge.com.br"
    if host != "confenge.com.br":
        raise ReleaseError("CONFENGE_ORIGIN_HOST must remain confenge.com.br")
    return raw, host


def smoke_live(sha: str) -> None:
    if (
        os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1"
        and os.environ.get("CONFENGE_TEST_LIVE_FAIL_SHA") == sha
    ):
        raise ReleaseError("test-injected live identity failure")
    base, host = _local_origin()
    _http_get_home(base + "/", host)
    identity = _http_get_json(base + "/.well-known/build-info.json", host)
    if identity.get("commit") != sha:
        raise ReleaseError(
            f"live identity mismatch: expected {sha}, found {identity.get('commit')!r}"
        )


def runtime_restart() -> None:
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        if os.environ.get("CONFENGE_TEST_RUNTIME_RESTART_FAIL") == "1":
            raise ReleaseError("test-injected runtime restart failure")
        return
    try:
        subprocess.run(
            ["sudo", "-n", "systemctl", "restart", "confenge-web-runtime.service"],
            check=True,
            timeout=45,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"portable runtime restart failed: {exc}") from exc


# systemd returns from `restart` as soon as it has spawned a Type=simple unit,
# so the runtime has not bound its socket yet. Asserting identity immediately
# made every promote a race: the first connection was refused, the switch was
# declared failed, and the automatic rollback then failed the same way against
# the same not-yet-listening process. Wait for the socket, then assert.
RUNTIME_READY_TIMEOUT_SECONDS = 30.0
RUNTIME_READY_POLL_SECONDS = 0.25


def _await_runtime_identity(
    host: str,
    port: int,
    timeout: float = RUNTIME_READY_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Return the runtime identity once it answers, or raise after the deadline.

    Only connection-level failures are retried. A runtime that answers with the
    wrong identity, a non-200 or invalid JSON is a real failure and must not be
    masked by waiting longer.
    """
    url = f"http://{host}:{port}/.well-known/runtime-info.json"
    deadline = time.monotonic() + timeout
    last: ReleaseError | None = None
    while True:
        try:
            return _http_get_json(url)
        except ReleaseError as exc:
            cause = exc.__cause__
            # HTTPError is a URLError subclass, but it proves that the runtime
            # accepted the connection and answered. Retrying it would mask a
            # bad runtime status until the readiness deadline (and could even
            # accept a later answer), rather than failing closed on the first
            # invalid response.
            if isinstance(cause, urllib.error.HTTPError) or not isinstance(
                cause, (urllib.error.URLError, TimeoutError, OSError)
            ):
                raise
            last = exc
        if time.monotonic() >= deadline:
            raise ReleaseError(
                f"runtime did not become reachable within {timeout:.0f}s: {last}"
            )
        time.sleep(RUNTIME_READY_POLL_SECONDS)


def smoke_runtime(manifest: dict[str, Any]) -> None:
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        if os.environ.get("CONFENGE_TEST_RUNTIME_SMOKE_FAIL") == "1":
            raise ReleaseError("test-injected runtime identity failure")
        return
    upstream = (manifest.get("host_contract") or {}).get("runtime_upstream") or {}
    host = upstream.get("host")
    port = upstream.get("port")
    if host not in LOOPBACK_HOSTS or not isinstance(port, int):
        raise ReleaseError("runtime upstream identity is not a loopback host/port")
    identity = _await_runtime_identity(host, port)
    expected = {
        "release_sha": manifest.get("commit"),
        "public_artifact_hash": (manifest.get("public_artifact") or {}).get(
            "artifact_hash"
        ),
        "release_bundle_hash": (manifest.get("artifact") or {}).get("sha256"),
        "host_architecture_version": (manifest.get("contract_versions") or {}).get(
            "host_architecture"
        ),
        "storage_backend": "filesystem",
    }
    for field, value in expected.items():
        if identity.get(field) != value:
            raise ReleaseError(
                f"runtime identity mismatch for {field}: expected {value!r}, "
                f"found {identity.get(field)!r}"
            )


def nginx_test() -> None:
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        if os.environ.get("CONFENGE_TEST_NGINX_FAIL") == "1":
            raise ReleaseError("test-injected nginx -t failure")
        return
    try:
        subprocess.run(["sudo", "-n", "nginx", "-t"], check=True, timeout=30)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"nginx -t failed: {exc}") from exc


def nginx_reload() -> None:
    """Apply the generated contract selected by ``current``.

    Nginx resolves ``include`` files while loading its configuration, not for
    each request. A symlink swap changes the static root immediately but cannot
    apply a new headers/redirects/locations contract until reload. Promotion,
    rollback and automatic restoration therefore make this controlled reload
    mandatory instead of relying on an operator-only environment flag.
    """
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        return
    try:
        subprocess.run(
            ["sudo", "-n", "systemctl", "reload", "nginx"], check=True, timeout=30
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError(f"controlled nginx reload failed: {exc}") from exc


def read_release_link(root: Path, name: str) -> str | None:
    link = root / name
    if not os.path.lexists(link):
        return None
    if not link.is_symlink():
        raise ReleaseError(f"{name} must be a symlink")
    raw = os.readlink(link)
    target = (link.parent / raw).resolve(strict=False)
    releases = (root / "releases").resolve()
    try:
        rel = target.relative_to(releases)
    except ValueError as exc:
        raise ReleaseError(f"{name} symlink escapes the allowed release root") from exc
    if len(rel.parts) != 1 or not FULL_SHA.fullmatch(rel.name):
        raise ReleaseError(f"{name} symlink does not target one full-SHA release")
    if not target.is_dir() or target.is_symlink():
        raise ReleaseError(f"{name} symlink target is missing or unsafe")
    return rel.name


def atomic_release_link(root: Path, name: str, sha: str) -> None:
    validate_sha(sha)
    target = root / "releases" / sha
    if not target.is_dir() or target.is_symlink():
        raise ReleaseError(f"cannot link {name} to missing/unsafe release {sha}")
    link = root / name
    temporary = root / f".{name}.{os.getpid()}.{uuid.uuid4().hex}"
    os.symlink(Path("releases") / sha, temporary)
    try:
        os.replace(temporary, link)
        descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if os.path.lexists(temporary):
            temporary.unlink()


def _remove_release_link(root: Path, name: str) -> None:
    link = root / name
    if os.path.lexists(link):
        if not link.is_symlink():
            raise ReleaseError(f"cannot remove non-symlink {name}")
        link.unlink()


def _cleanup_interrupted_stage(root: Path, sha: str) -> None:
    releases = root / "releases"
    for path in sorted(releases.glob(f".stage-{sha}-*")):
        if path.is_symlink() or not path.is_dir():
            raise ReleaseError(f"unsafe interrupted stage path: {path}")
        shutil.rmtree(path)


def _adopt_uploaded_bundle(root: Path, sha: str, upload_dir: Path) -> None:
    incoming_root = root / "incoming"
    expected_name = re.compile(rf"^\.upload-{re.escape(sha)}-[0-9]+-[0-9]+$")
    if (
        upload_dir.parent != incoming_root
        or not expected_name.fullmatch(upload_dir.name)
        or not upload_dir.is_dir()
        or upload_dir.is_symlink()
    ):
        raise ReleaseError(
            "upload directory must be a real, run-scoped directory under incoming/"
        )
    _, uploaded_manifest = validate_incoming(root, sha, upload_dir)
    destination = incoming_root / sha
    if os.path.lexists(destination):
        if destination.is_symlink() or not destination.is_dir():
            raise ReleaseError("pre-existing incoming release path is unsafe")
        _, stored_manifest = validate_incoming(root, sha, destination)
        if (
            stored_manifest["artifact"]["sha256"]
            != uploaded_manifest["artifact"]["sha256"]
        ):
            raise ReleaseError(
                "pre-existing incoming release has divergent artifact identity"
            )
        shutil.rmtree(upload_dir)
        return
    os.replace(upload_dir, destination)


def stage_release(sha: str, upload_dir: Path | None = None) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        if upload_dir is not None:
            _adopt_uploaded_bundle(root, sha, upload_dir)
        package, incoming_manifest = validate_incoming(root, sha)
        target = root / "releases" / sha
        if os.path.lexists(target):
            stored = verify_release_tree(root, sha)
            if stored["artifact"]["sha256"] != incoming_manifest["artifact"]["sha256"]:
                raise ReleaseError(
                    "pre-existing release directory has divergent artifact identity"
                )
            append_evidence(
                root,
                "STAGE_IDEMPOTENT",
                sha,
                artifact_sha256=stored["artifact"]["sha256"],
            )
            return stored

        _cleanup_interrupted_stage(root, sha)
        temporary = root / "releases" / f".stage-{sha}-{uuid.uuid4().hex}"
        try:
            extract_safely(package, temporary)
            manifest_destination = temporary / "metadata" / "release-manifest.json"
            manifest_destination.write_text(
                json.dumps(
                    incoming_manifest, ensure_ascii=False, indent=2, sort_keys=True
                )
                + "\n",
                encoding="utf-8",
            )
            stored = verify_release_tree_at(temporary, sha)
            os.replace(temporary, target)
        except Exception:
            if temporary.exists() and not temporary.is_symlink():
                shutil.rmtree(temporary)
            raise
        append_evidence(
            root,
            "STAGED",
            sha,
            artifact_sha256=stored["artifact"]["sha256"],
            ci_run_url=(stored.get("ci") or {}).get("run_url"),
        )
        return stored


def verify_release(sha: str) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        manifest = verify_release_envelope_and_tree(root, sha)
        smoke_candidate(root / "releases" / sha, sha)
        verify_portable_runtime(root / "releases" / sha)
        append_evidence(
            root, "VERIFIED", sha, artifact_sha256=manifest["artifact"]["sha256"]
        )
        return manifest


def _restore_after_failed_switch(root: Path, previous: str | None) -> None:
    if previous:
        atomic_release_link(root, "current", previous)
    else:
        _remove_release_link(root, "current")
    nginx_test()
    if previous:
        previous_manifest = verify_release_tree(root, previous)
        runtime_restart()
        smoke_runtime(previous_manifest)
    nginx_reload()
    if previous:
        smoke_live(previous)


def _append_evidence_best_effort(
    root: Path, event: str, sha: str, **details: Any
) -> str | None:
    try:
        append_evidence(root, event, sha, **details)
    except OSError as exc:  # Evidence failure must never prevent link restoration.
        return str(exc)
    return None


def _switch_release(root: Path, sha: str, event: str) -> dict[str, Any]:
    manifest = verify_release_envelope_and_tree(root, sha)
    smoke_candidate(root / "releases" / sha, sha)
    previous = read_release_link(root, "current")
    read_release_link(root, "rollback")
    if previous == sha:
        nginx_test()
        runtime_restart()
        smoke_runtime(manifest)
        nginx_reload()
        smoke_live(sha)
        append_evidence(
            root,
            f"{event}_IDEMPOTENT",
            sha,
            previous_sha=previous,
            nginx_reloaded=True,
        )
        return manifest

    atomic_release_link(root, "current", sha)
    try:
        nginx_test()
        runtime_restart()
        smoke_runtime(manifest)
        nginx_reload()
        smoke_live(sha)
        if previous:
            atomic_release_link(root, "rollback", previous)
        append_evidence(
            root,
            event,
            sha,
            previous_sha=previous,
            artifact_sha256=manifest["artifact"]["sha256"],
            nginx_reloaded=True,
            live_identity=sha,
            runtime_identity=sha,
        )
    except Exception as exc:
        evidence_error = _append_evidence_best_effort(
            root,
            f"{event}_FAILED_AFTER_SWAP",
            sha,
            previous_sha=previous,
            error=str(exc),
        )
        try:
            _restore_after_failed_switch(root, previous)
        except Exception as rollback_error:
            _append_evidence_best_effort(
                root,
                "AUTO_ROLLBACK_FAILED",
                sha,
                restored_sha=previous,
                error=str(rollback_error),
                original_error=str(exc),
                evidence_error=evidence_error,
            )
            raise ReleaseError(
                "release switch failed and automatic rollback validation also failed: "
                f"{rollback_error}"
            ) from rollback_error
        _append_evidence_best_effort(
            root,
            "AUTO_ROLLBACK_OK",
            sha,
            restored_sha=previous,
            original_error=str(exc),
            evidence_error=evidence_error,
        )
        raise ReleaseError(
            f"{event.lower()} failed after symlink swap; previous release restored"
        ) from exc
    return manifest


def promote_release(sha: str) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        return _switch_release(root, sha, "PROMOTED")


def rollback_release(sha: str) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        if not (root / "releases" / sha).is_dir():
            raise ReleaseError(f"rollback target does not exist: {sha}")
        return _switch_release(root, sha, "ROLLED_BACK")


def prune_releases(keep: int = 5) -> list[str]:
    if keep < 0 or keep > 100:
        raise ReleaseError("prune keep count must be between 0 and 100")
    root = release_root()
    with deploy_lock(root):
        current = read_release_link(root, "current")
        rollback = read_release_link(root, "rollback")
        protected = {value for value in (current, rollback) if value}
        releases_dir = root / "releases"
        candidates: list[Path] = []
        for path in releases_dir.iterdir():
            if path.name.startswith(".stage-"):
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                    continue
                raise ReleaseError(f"unsafe interrupted stage entry: {path}")
            if not FULL_SHA.fullmatch(path.name):
                raise ReleaseError(f"unexpected release directory entry: {path.name}")
            if path.is_symlink() or not path.is_dir():
                raise ReleaseError(f"unsafe release directory entry: {path.name}")
            if path.name not in protected:
                candidates.append(path)
        candidates.sort(
            key=lambda path: (path.stat().st_mtime_ns, path.name), reverse=True
        )
        removed: list[str] = []
        for path in candidates[keep:]:
            shutil.rmtree(path)
            removed.append(path.name)
        append_evidence(
            root,
            "PRUNED",
            current or ("0" * 40),
            rollback_sha=rollback,
            keep_previous=keep,
            removed=removed,
        )
        return removed


def _command_from_argv0(argv0: str) -> str | None:
    name = Path(argv0).name
    return {
        "stage-release": "stage",
        "verify-release": "verify",
        "promote-release": "promote",
        "rollback": "rollback",
        "prune-releases": "prune",
    }.get(name)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    argv = list(sys.argv[1:] if argv is None else argv)
    implicit = _command_from_argv0(sys.argv[0])
    if implicit:
        argv.insert(0, implicit)
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("stage", "verify", "promote", "rollback"):
        child = subparsers.add_parser(command)
        child.add_argument("sha")
        if command == "stage":
            child.add_argument("--upload-dir", type=Path)
    prune = subparsers.add_parser("prune")
    prune.add_argument("--keep", type=int, default=5)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.command == "stage":
            manifest = stage_release(args.sha, args.upload_dir)
            result = {
                "status": "STAGED",
                "sha": args.sha,
                "artifact_sha256": manifest["artifact"]["sha256"],
            }
        elif args.command == "verify":
            manifest = verify_release(args.sha)
            result = {
                "status": "VERIFIED",
                "sha": args.sha,
                "artifact_sha256": manifest["artifact"]["sha256"],
            }
        elif args.command == "promote":
            promote_release(args.sha)
            result = {
                "status": "PROMOTED",
                "sha": args.sha,
                "current_identity": args.sha,
            }
        elif args.command == "rollback":
            rollback_release(args.sha)
            result = {
                "status": "ROLLED_BACK",
                "sha": args.sha,
                "current_identity": args.sha,
            }
        else:
            removed = prune_releases(args.keep)
            result = {
                "status": "PRUNED",
                "removed": removed,
                "keep_previous": args.keep,
            }
    except ReleaseError as exc:
        print(f"NETCUP_RELEASE_ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
