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
# Host-owned official snapshot is SELECT-only input. Stage may only persist the
# two accepted projection files and public files derived from the exact accepted
# opportunity ids. Prefix membership is deliberately not publication authority.
LIVE_INTEL_ACCEPTED_FILES = frozenset(
    {
        "data/live_intelligence/accepted/opportunities.json",
        "data/live_intelligence/accepted/companies.json",
        "data/live_intelligence/accepted.last/opportunities.json",
        "data/live_intelligence/accepted.last/companies.json",
    }
)
LIVE_INTEL_OVERLAY_MANIFEST = "metadata/live-intelligence-overlay.json"
LIVE_INTEL_PUBLIC_MANIFEST = "_site/.well-known/live-intelligence-overlay.json"
LIVE_INTEL_OVERLAY_SCHEMA = "confenge.live-intelligence-stage-overlay/v1"
LIVE_INTEL_LEGACY_STATE_SCHEMA = "confenge.live-intelligence-legacy-overlay-state/v1"
LIVE_INTEL_PUBLIC_SCHEMA = "confenge.live-intelligence-overlay/v1"
LIVE_INTEL_OVERLAY_FILES = frozenset(
    {
        "_site/sitemap-oportunidades.xml",
        LIVE_INTEL_OVERLAY_MANIFEST,
        LIVE_INTEL_PUBLIC_MANIFEST,
        *LIVE_INTEL_ACCEPTED_FILES,
    }
)
# sitemap-index is hashed in the package. Stage overlay may add the
# oportunidades child after official consume; checksum may then differ.
LIVE_INTEL_OVERLAY_REWRITES = frozenset(
    {
        "_site/sitemap-index.xml",
        "_site/ferramentas/index.html",
        # New artifacts exclude the opportunity fixtures and receive this hub
        # only from official host data. Keep the existing exact allowance for
        # rollback to older releases that packaged the hub before stage rendered
        # it. No new file or prefix is authorized to change its packaged digest.
        "_site/oportunidades/index.html",
    }
)
HOST_OFFICIAL_DIR = Path("/var/lib/confenge-web/live_intelligence/official")


def is_live_intel_overlay(rel: str) -> bool:
    """Return only statically named overlay files.

    Opportunity child pages require a release-local overlay manifest and are
    intentionally not authorized by this path-only helper.
    """
    return rel in LIVE_INTEL_OVERLAY_FILES or rel in LIVE_INTEL_OVERLAY_REWRITES


def is_live_intel_withdrawal(rel: str) -> bool:
    """Only an exact staged manifest can authorize a packaged-file withdrawal."""
    return rel == "_site/sitemap-oportunidades.xml"


def is_release_ephemeral(rel: str) -> bool:
    """Interpreter residue from overlay import; never part of the hashed payload."""
    return "__pycache__" in Path(rel).parts or rel.endswith(".pyc")


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


def release_controller_evidence_hash() -> str | None:
    controller_hash = os.environ.get("CONFENGE_RELEASE_CONTROL_SHA256")
    if controller_hash is not None and not HEX_256.fullmatch(controller_hash):
        raise ReleaseError("release controller SHA-256 evidence is invalid")
    return controller_hash


def append_evidence(root: Path, event: str, sha: str, **details: Any) -> None:
    controller_hash = release_controller_evidence_hash()
    payload = {
        "at": utc_now(),
        "event": event,
        "sha": sha,
        "actor": os.environ.get("SUDO_USER") or os.environ.get("USER") or "unknown",
        "release_control_sha256": controller_hash,
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
    expected_release = os.environ.get("CONFENGE_EXPECTED_RELEASE_SHA")
    expected_artifact = os.environ.get("CONFENGE_EXPECTED_RELEASE_ARTIFACT_SHA256")
    if (expected_release is None) != (expected_artifact is None):
        raise ReleaseError("expected release SHA and artifact SHA-256 must be paired")
    if expected_release is not None:
        validate_sha(expected_release)
        if not HEX_256.fullmatch(str(expected_artifact)):
            raise ReleaseError("expected release artifact SHA-256 is invalid")
        if sha == expected_release and actual != expected_artifact:
            raise ReleaseError(
                "incoming artifact differs from the locally verified release artifact"
            )
    return package, manifest


def _files_manifest_bytes_from_package(package: Path) -> bytes:
    target = "metadata/files.sha256"
    try:
        with tarfile.open(package, mode="r:gz") as archive:
            matches = [
                member
                for member in archive.getmembers()
                if member.name.rstrip("/") == target
            ]
            if len(matches) != 1 or not matches[0].isfile():
                raise ReleaseError(
                    "release package must contain one regular metadata/files.sha256"
                )
            extracted = archive.extractfile(matches[0])
            if extracted is None:
                raise ReleaseError("cannot read packaged metadata/files.sha256")
            return extracted.read()
    except ReleaseError:
        raise
    except (OSError, tarfile.TarError) as exc:
        raise ReleaseError(f"cannot inspect packaged metadata/files.sha256: {exc}") from exc


def _verify_files_manifest_matches_incoming(root: Path, sha: str) -> None:
    package, _ = validate_incoming(root, sha)
    release_manifest = root / "releases" / sha / "metadata/files.sha256"
    try:
        local = release_manifest.read_bytes()
    except OSError as exc:
        raise ReleaseError(
            f"stored release files manifest is missing: {release_manifest}"
        ) from exc
    if local != _files_manifest_bytes_from_package(package):
        raise ReleaseError(
            "stored metadata/files.sha256 differs from the immutable incoming package"
        )


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


def _canonical_opportunity_route(opportunity_id: str) -> tuple[str, str]:
    clean = opportunity_id.strip("/")
    if not clean or "\\" in clean or any(
        part in {"", ".", ".."} for part in clean.split("/")
    ):
        raise ReleaseError(f"unsafe accepted opportunity id: {opportunity_id!r}")
    route = f"/oportunidades/{clean}/"
    return route, f"_site{route}index.html"


def _accepted_overlay_identity(release: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Read the release-local accepted projection and derive exact INDEX routes."""
    path = release / "data/live_intelligence/accepted/opportunities.json"
    if not path.is_file():
        return (
            {
                "official_live": False,
                "source_kind": None,
                "source_run_id": None,
                "as_of": None,
                "manifest_hash": None,
                "consumer_observed_manifest_hash": None,
                "accepted_projection_sha256": None,
            },
            [],
        )
    payload = load_json(path)
    declared = str(payload.get("manifest_hash") or "")
    observed = str(payload.get("consumer_observed_manifest_hash") or "")
    if (
        payload.get("source_kind") != "official_live"
        or payload.get("official_live") is not True
        or not HEX_256.fullmatch(declared)
        or declared != observed
    ):
        raise ReleaseError("stage accepted projection is not verified official_live input")
    records = payload.get("opportunities")
    if not isinstance(records, list):
        raise ReleaseError("stage accepted opportunities must be a list")
    routes: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_routes: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise ReleaseError("stage accepted opportunity record must be an object")
        indexable = (
            (record.get("source_kind") or payload.get("source_kind")) == "official_live"
            and record.get("publication_state") == "PUBLISHABLE_INDEX"
            and record.get("index_eligible") is True
        )
        if not indexable:
            continue
        opportunity_id = str(record.get("opportunity_id") or "")
        route, html_path = _canonical_opportunity_route(opportunity_id)
        content_hash = str(record.get("content_hash") or "")
        if not HEX_256.fullmatch(content_hash):
            raise ReleaseError(
                f"accepted opportunity content hash is invalid for {opportunity_id!r}"
            )
        if record.get("route") != route:
            raise ReleaseError(
                f"accepted opportunity route is not canonical for {opportunity_id!r}"
            )
        if opportunity_id in seen_ids or route in seen_routes:
            raise ReleaseError(f"duplicate accepted opportunity route: {route}")
        page = release / html_path
        if not page.is_file() or page.is_symlink():
            raise ReleaseError(f"accepted opportunity page was not rendered: {html_path}")
        seen_ids.add(opportunity_id)
        seen_routes.add(route)
        routes.append(
            {
                "opportunity_id": opportunity_id,
                "route": route,
                "html_path": html_path,
                "content_hash": content_hash,
                "sha256": sha256_file(page),
            }
        )
    routes.sort(key=lambda item: item["route"])
    return (
        {
            "official_live": True,
            "source_kind": "official_live",
            "source_run_id": payload.get("source_run_id"),
            "as_of": payload.get("as_of"),
            "manifest_hash": declared,
            "consumer_observed_manifest_hash": observed,
            "accepted_projection_sha256": sha256_file(path),
        },
        routes,
    )


def _overlay_allowed_paths(routes: list[dict[str, Any]]) -> set[str]:
    return {
        *LIVE_INTEL_OVERLAY_FILES,
        *LIVE_INTEL_OVERLAY_REWRITES,
        *(str(item["html_path"]) for item in routes),
    }


def _managed_packaged_opportunity_pages(
    release: Path, expected: dict[str, str], *, allow_missing_legacy: bool = False
) -> set[str]:
    """Return exact packaged child pages owned by the opportunity renderer."""
    managed: set[str] = set()
    for rel in expected:
        if not re.fullmatch(r"_site/oportunidades/.+/index\.html", rel):
            continue
        path = release / rel
        if not path.is_file():
            if allow_missing_legacy:
                managed.add(rel)
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        if (
            'data-intel-surface="opportunity"' in html
            and 'data-route-family="live-opportunity"' in html
        ):
            managed.add(rel)
    return managed


def _write_live_intelligence_overlay_manifest(
    release: Path,
    sha: str,
    expected: dict[str, str],
    *,
    managed_packaged_html: set[str],
) -> None:
    """Bind stage output to the release-local accepted projection and file digests."""
    identity, routes = _accepted_overlay_identity(release)
    actual = _actual_release_files(release)
    actual_hashed = {
        rel: sha256_file(path)
        for rel, path in actual.items()
        if rel
        not in {
            "metadata/files.sha256",
            "metadata/release-manifest.json",
            LIVE_INTEL_OVERLAY_MANIFEST,
        }
        and not is_release_ephemeral(rel)
    }
    removed = {
        rel: digest
        for rel, digest in expected.items()
        if rel not in actual_hashed
    }
    changed = {
        rel: digest
        for rel, digest in actual_hashed.items()
        if expected.get(rel) != digest
    }
    allowed = (
        _overlay_allowed_paths(routes)
        if identity["official_live"]
        else {
            "_site/oportunidades/index.html",
            "_site/sitemap-oportunidades.xml",
        }
    )
    unexpected_changed = sorted(set(changed) - allowed)
    unauthorized_removed = sorted(
        rel
        for rel in removed
        if not (
            rel == "_site/sitemap-oportunidades.xml"
            or rel in LIVE_INTEL_ACCEPTED_FILES
            or rel in managed_packaged_html
        )
    )
    if unexpected_changed or unauthorized_removed:
        raise ReleaseError(
            "live-intelligence publisher changed undeclared files; "
            f"changed={unexpected_changed}, removed={unauthorized_removed}"
        )
    accepted_html = {str(item["html_path"]) for item in routes}
    public_children = {
        rel
        for rel in changed
        if rel.startswith("_site/oportunidades/")
        and rel != "_site/oportunidades/index.html"
    }
    if public_children != accepted_html:
        raise ReleaseError(
            "stage opportunity HTML does not equal accepted INDEX projection; "
            f"accepted={sorted(accepted_html)}, rendered={sorted(public_children)}"
        )
    public_payload = {
        "schema": LIVE_INTEL_PUBLIC_SCHEMA,
        "release_sha": sha,
        **identity,
        "routes": routes,
        "static_html_paths": (
            ["_site/oportunidades/index.html"]
            if (release / "_site/oportunidades/index.html").is_file()
            else []
        ),
        "static_html_sha256": (
            {
                "_site/oportunidades/index.html": sha256_file(
                    release / "_site/oportunidades/index.html"
                )
            }
            if (release / "_site/oportunidades/index.html").is_file()
            else {}
        ),
        "removed_html_paths": sorted(
            rel for rel in removed if rel.startswith("_site/") and rel.endswith(".html")
        ),
    }
    public_path = release / LIVE_INTEL_PUBLIC_MANIFEST
    public_path.parent.mkdir(parents=True, exist_ok=True)
    public_path.write_text(
        json.dumps(public_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    changed[LIVE_INTEL_PUBLIC_MANIFEST] = sha256_file(public_path)
    internal_payload = {
        "schema": LIVE_INTEL_OVERLAY_SCHEMA,
        "release_sha": sha,
        **identity,
        "routes": routes,
        "files": dict(sorted(changed.items())),
        "removed_files": dict(sorted(removed.items())),
        "managed_packaged_html": sorted(managed_packaged_html),
    }
    internal_path = release / LIVE_INTEL_OVERLAY_MANIFEST
    internal_path.parent.mkdir(parents=True, exist_ok=True)
    internal_path.write_text(
        json.dumps(internal_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _seal_legacy_live_intelligence_overlay(release: Path, sha: str) -> bool:
    """One-time route-exact sealing for a pre-contract staged release.

    The release-local accepted projection is the authority. A legacy prefix is
    never accepted: unexpected files make manifest creation fail closed.
    """
    releases = release.parent
    root = releases.parent
    if releases.name == "releases" and (root / "incoming" / sha).is_dir():
        # A legacy state record derives its exact paths and digests from this
        # manifest. Bind those bytes to the immutable uploaded package before
        # allowing the record to become an authority for rollback.
        _verify_files_manifest_matches_incoming(root, sha)
    if (release / LIVE_INTEL_OVERLAY_MANIFEST).is_file():
        return False
    state_path = _legacy_overlay_state_path(release, sha)
    if state_path.is_file():
        return False
    expected = _parse_files_manifest(release / "metadata/files.sha256")
    actual = _actual_release_files(release)
    actual_digests = {
        rel: sha256_file(path)
        for rel, path in actual.items()
        if rel not in {"metadata/files.sha256", "metadata/release-manifest.json"}
        and not is_release_ephemeral(rel)
    }
    has_stage_delta = (
        set(actual_digests) != set(expected)
        or any(actual_digests.get(rel) != digest for rel, digest in expected.items())
    )
    if not has_stage_delta:
        return False
    identity, routes = _accepted_overlay_identity(release)
    removed = {
        rel: digest for rel, digest in expected.items() if rel not in actual_digests
    }
    changed = {
        rel: digest
        for rel, digest in actual_digests.items()
        if expected.get(rel) != digest
    }
    managed_packaged_html = _managed_packaged_opportunity_pages(
        release, expected, allow_missing_legacy=True
    )
    allowed = (
        _overlay_allowed_paths(routes) - {
            LIVE_INTEL_OVERLAY_MANIFEST,
            LIVE_INTEL_PUBLIC_MANIFEST,
        }
        if identity["official_live"]
        else {
            "_site/oportunidades/index.html",
            "_site/sitemap-oportunidades.xml",
        }
    )
    unexpected = sorted(set(changed) - allowed)
    bad_removed = sorted(
        rel
        for rel in removed
        if not (
            rel == "_site/sitemap-oportunidades.xml"
            or rel in LIVE_INTEL_ACCEPTED_FILES
            or rel in managed_packaged_html
        )
    )
    accepted_html = {str(item["html_path"]) for item in routes}
    changed_children = {
        rel
        for rel in changed
        if rel.startswith("_site/oportunidades/")
        and rel != "_site/oportunidades/index.html"
    }
    if unexpected or bad_removed or changed_children != accepted_html:
        raise ReleaseError(
            "legacy live-intelligence overlay is not route-exact; "
            f"changed={unexpected}, removed={bad_removed}, "
            f"accepted={sorted(accepted_html)}, rendered={sorted(changed_children)}"
        )
    payload = {
        "schema": LIVE_INTEL_LEGACY_STATE_SCHEMA,
        "release_sha": sha,
        **identity,
        "routes": routes,
        "files": dict(sorted(changed.items())),
        "removed_files": dict(sorted(removed.items())),
        "managed_packaged_html": sorted(managed_packaged_html),
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = state_path.with_name(f".{state_path.name}.{uuid.uuid4().hex}")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, state_path)
    return True


def _legacy_overlay_state_path(release: Path, sha: str) -> Path:
    releases = release.parent
    if releases.name != "releases":
        return release / "metadata" / f".{sha}.legacy-overlay-state.unavailable"
    return releases.parent / "state" / "live-intelligence-overlays" / f"{sha}.json"


def _overlay_contract(
    release: Path, sha: str, expected: dict[str, str]
) -> tuple[dict[str, str], dict[str, str]]:
    """Validate and return exact changed/removed files for this staged release."""
    internal_path = release / LIVE_INTEL_OVERLAY_MANIFEST
    path = (
        internal_path
        if internal_path.is_file()
        else _legacy_overlay_state_path(release, sha)
    )
    if not path.is_file():
        return {}, {}
    payload = load_json(path)
    is_internal = path == internal_path
    expected_schema = (
        LIVE_INTEL_OVERLAY_SCHEMA if is_internal else LIVE_INTEL_LEGACY_STATE_SCHEMA
    )
    if payload.get("schema") != expected_schema or payload.get("release_sha") != sha:
        raise ReleaseError("live-intelligence overlay manifest identity mismatch")
    files = payload.get("files")
    removed = payload.get("removed_files")
    routes = payload.get("routes")
    managed_packaged_html = payload.get("managed_packaged_html")
    if (
        not isinstance(files, dict)
        or not isinstance(removed, dict)
        or not isinstance(routes, list)
        or not isinstance(managed_packaged_html, list)
        or any(not isinstance(rel, str) for rel in managed_packaged_html)
        or len(managed_packaged_html) != len(set(managed_packaged_html))
    ):
        raise ReleaseError("live-intelligence overlay manifest shape is invalid")
    if any(not isinstance(key, str) or not isinstance(value, str) or not HEX_256.fullmatch(value) for key, value in files.items()):
        raise ReleaseError("live-intelligence overlay file digest is invalid")
    if any(not isinstance(key, str) or not isinstance(value, str) or not HEX_256.fullmatch(value) for key, value in removed.items()):
        raise ReleaseError("live-intelligence overlay removed-file digest is invalid")
    identity, accepted_routes = _accepted_overlay_identity(release)
    if routes != accepted_routes:
        raise ReleaseError("live-intelligence overlay routes differ from accepted projection")
    for key, value in identity.items():
        if payload.get(key) != value:
            raise ReleaseError(f"live-intelligence overlay {key} mismatch")
    allowed = _overlay_allowed_paths(accepted_routes)
    if set(files) - allowed:
        raise ReleaseError(
            f"live-intelligence overlay contains unauthorized files: {sorted(set(files) - allowed)}"
        )
    managed_set = set(managed_packaged_html)
    if any(
        expected.get(rel) is None
        or not re.fullmatch(r"_site/oportunidades/.+/index\.html", rel)
        for rel in managed_set
    ):
        raise ReleaseError("live-intelligence managed packaged HTML is invalid")
    for rel, digest in removed.items():
        if expected.get(rel) != digest or not (
            rel == "_site/sitemap-oportunidades.xml"
            or rel in LIVE_INTEL_ACCEPTED_FILES
            or rel in managed_set
        ):
            raise ReleaseError(f"live-intelligence overlay withdrawal is invalid: {rel}")
    if is_internal:
        public = load_json(release / LIVE_INTEL_PUBLIC_MANIFEST)
        expected_public = {
            "schema": LIVE_INTEL_PUBLIC_SCHEMA,
            "release_sha": sha,
            **identity,
            "routes": accepted_routes,
            "static_html_paths": (
                ["_site/oportunidades/index.html"]
                if (release / "_site/oportunidades/index.html").is_file()
                else []
            ),
            "static_html_sha256": (
                {
                    "_site/oportunidades/index.html": sha256_file(
                        release / "_site/oportunidades/index.html"
                    )
                }
                if (release / "_site/oportunidades/index.html").is_file()
                else {}
            ),
            "removed_html_paths": sorted(
                rel for rel in removed if rel.startswith("_site/") and rel.endswith(".html")
            ),
        }
        if public != expected_public:
            raise ReleaseError("public live-intelligence overlay snapshot mismatch")
    return ({str(key): str(value) for key, value in files.items()}, {str(key): str(value) for key, value in removed.items()})


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
        "ops/bin/run-runtime",
        "ops/bin/run-schedule",
        "ops/lib/runtime_launcher.py",
        "ops/lib/schedule_gate.py",
        "ops/systemd/confenge-web-runtime.service",
    )
    for rel in required:
        path = release / rel
        if not path.is_file() or path.is_symlink():
            raise ReleaseError(f"release is missing required regular file: {rel}")

    expected = _parse_files_manifest(release / "metadata" / "files.sha256")
    actual = _actual_release_files(release)
    ignored = {"metadata/files.sha256", "metadata/release-manifest.json"}
    actual_hashed = {
        rel for rel in actual if rel not in ignored and not is_release_ephemeral(rel)
    }

    overlay_files, overlay_removed = _overlay_contract(release, sha, expected)
    overlay_manifest_files = (
        {LIVE_INTEL_OVERLAY_MANIFEST}
        if (release / LIVE_INTEL_OVERLAY_MANIFEST).is_file()
        else set()
    )
    permitted_actual = (set(expected) - set(overlay_removed)) | set(overlay_files) | overlay_manifest_files
    extra = sorted(actual_hashed - permitted_actual)
    missing = sorted(permitted_actual - actual_hashed)
    if missing or extra:
        raise ReleaseError(
            f"release file set mismatch; missing={missing}, extra={extra}"
        )
    for rel, digest in expected.items():
        if rel in overlay_removed:
            continue
        if rel not in actual:
            raise ReleaseError(f"release file checksum mismatch: {rel}")
        found = sha256_file(actual[rel])
        accepted_digest = overlay_files.get(rel, digest)
        if found != accepted_digest:
            raise ReleaseError(f"release file checksum mismatch: {rel}")
    for rel, digest in overlay_files.items():
        path = actual.get(rel)
        if path is None or sha256_file(path) != digest:
            raise ReleaseError(f"live-intelligence overlay checksum mismatch: {rel}")

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
    package, incoming_manifest = validate_incoming(root, sha)
    stored_files_manifest = root / "releases" / sha / "metadata/files.sha256"
    try:
        stored_files_manifest_bytes = stored_files_manifest.read_bytes()
    except OSError as exc:
        raise ReleaseError(
            f"stored release files manifest is missing: {stored_files_manifest}"
        ) from exc
    if stored_files_manifest_bytes != _files_manifest_bytes_from_package(package):
        raise ReleaseError(
            "stored metadata/files.sha256 differs from the immutable incoming package"
        )
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


def _withdraw_packaged_opportunity_pages(release: Path) -> None:
    """Delete packaged ``_site/oportunidades`` when official input cannot be consumed."""
    pages = release / "_site" / "oportunidades"
    if pages.is_dir() and not pages.is_symlink():
        shutil.rmtree(pages)
    sitemap = release / "_site" / "sitemap-oportunidades.xml"
    if sitemap.is_file() and not sitemap.is_symlink():
        sitemap.unlink()


def _publish_live_intelligence_overlay(release: Path) -> dict[str, Any]:
    """Render official INDEX pages into the staged `_site` without rewriting hashed files."""
    if os.environ.get("CONFENGE_RELEASE_TEST_MODE") == "1":
        return {"status": "not_applied_in_test_mode", "official_live": False}
    source_path = release / "metadata/release-source.json"
    files_path = release / "metadata/files.sha256"
    expected_files = _parse_files_manifest(files_path) if files_path.is_file() else {}
    managed_packaged_html = (
        _managed_packaged_opportunity_pages(release, expected_files)
        if expected_files
        else set()
    )

    def finalize_manifest() -> None:
        # Tiny direct-unit fixtures exercise withdrawal without a release
        # envelope. Real stage always has both files and must bind the delta.
        if not source_path.is_file() or not files_path.is_file():
            return
        source = load_json(source_path)
        commit = validate_sha(str(source.get("commit") or ""))
        _write_live_intelligence_overlay_manifest(
            release,
            commit,
            expected_files,
            managed_packaged_html=managed_packaged_html,
        )

    official: Path | None = HOST_OFFICIAL_DIR
    if not (official / "manifest.json").is_file():
        bundled = release / "data" / "live_intelligence" / "official" / "manifest.json"
        official = bundled.parent if bundled.is_file() else None
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True
    publish_py = release / "scripts" / "live_intelligence" / "publish.py"
    organic_py = release / "scripts" / "organic" / "sitemap_graph.py"
    if official is None:
        os.environ.pop("CONFENGE_LI_OFFICIAL_DIR", None)
        if not publish_py.is_file() or not organic_py.is_file():
            _withdraw_packaged_opportunity_pages(release)
            finalize_manifest()
            return {"status": "withdrawn", "reason": "official_input_absent", "official_live": False}
    else:
        os.environ["CONFENGE_LI_OFFICIAL_DIR"] = str(official)
        if not publish_py.is_file() or not organic_py.is_file():
            raise ReleaseError(
                "live-intelligence official overlay missing packaged scripts "
                "(scripts/live_intelligence/publish.py and "
                "scripts/organic/sitemap_graph.py)"
            )
    if str(release) not in sys.path:
        sys.path.insert(0, str(release))
    try:
        from scripts.live_intelligence.publish import (
            publish,
            withdraw_packaged_opportunities,
        )
    except ImportError as exc:
        if official is None:
            _withdraw_packaged_opportunity_pages(release)
            finalize_manifest()
            return {"status": "withdrawn", "reason": "official_input_absent", "official_live": False}
        raise ReleaseError(
            "live-intelligence official overlay import failed; the release "
            "payload must include scripts/live_intelligence and scripts/organic"
        ) from exc
    if official is None:
        _withdraw_packaged_opportunity_pages(release)
    result = publish(
        root=release,
        public_root=release / "_site",
        mutate_discovery=True,
        withdraw_if_absent=True,
    )
    if result.get("ok") is False:
        # A stale/invalid integration must never refresh accepted state or
        # publish a purportedly live opportunity, but it must not take down
        # unrelated commercial pages. Withdraw the family records and retain
        # the branded empty hub as the truthful direct-contact alternative.
        for dirname in ("accepted", "accepted.last"):
            target = release / "data/live_intelligence" / dirname
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
        withdraw_packaged_opportunities(release / "_site")
        finalize_manifest()
        return {
            "status": "withdrawn",
            "reason": str(result.get("reason") or "official_overlay_rejected"),
            "official_live": False,
        }
    finalize_manifest()
    return {
        "status": "published",
        "reason": str(result.get("reason") or "official_live_published"),
        "official_live": True,
        "indexable": int(result.get("indexable") or 0),
    }


def stage_release(sha: str, upload_dir: Path | None = None) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        for link_name in ("current", "rollback"):
            legacy_sha = read_release_link(root, link_name)
            if legacy_sha and _seal_legacy_live_intelligence_overlay(
                root / "releases" / legacy_sha, legacy_sha
            ):
                verify_release_tree_at(root / "releases" / legacy_sha, legacy_sha)
                append_evidence(
                    root,
                    "LEGACY_OVERLAY_SEALED",
                    legacy_sha,
                    release_link=link_name,
                    overlay_manifest=LIVE_INTEL_OVERLAY_MANIFEST,
                )
        if upload_dir is not None:
            _adopt_uploaded_bundle(root, sha, upload_dir)
        package, incoming_manifest = validate_incoming(root, sha)
        target = root / "releases" / sha
        if os.path.lexists(target):
            stored = verify_release_envelope_and_tree(root, sha)
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
            overlay_result = _publish_live_intelligence_overlay(temporary)
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
            live_intelligence=overlay_result,
        )
        return stored


def verify_release(sha: str) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        _seal_legacy_live_intelligence_overlay(root / "releases" / sha, sha)
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


def _switch_release(
    root: Path,
    sha: str,
    event: str,
    *,
    expected_current: str | None | object,
) -> dict[str, Any]:
    previous_before_checks = read_release_link(root, "current")
    rollback_before_checks = read_release_link(root, "rollback")
    if expected_current is not _NO_CURRENT_PRECONDITION:
        if isinstance(expected_current, str):
            validate_sha(expected_current)
        if previous_before_checks != expected_current:
            raise ReleaseError(
                "current release changed since authorization; "
                f"expected={expected_current or 'NONE'}, "
                f"found={previous_before_checks or 'NONE'}"
            )
    recovery_predecessor = None
    if event == "PROMOTED":
        recovery_predecessor = (
            rollback_before_checks
            if previous_before_checks == sha
            else previous_before_checks
        )
    for candidate in {value for value in (sha, recovery_predecessor) if value}:
        _seal_legacy_live_intelligence_overlay(root / "releases" / candidate, candidate)
    manifest = verify_release_envelope_and_tree(root, sha)
    if recovery_predecessor and recovery_predecessor != sha:
        # Never move the canonical symlink toward a candidate whose recovery
        # release is already corrupt. On an idempotent retry, the real recovery
        # release is the rollback link, not the candidate already at current.
        verify_release_envelope_and_tree(root, recovery_predecessor)
    smoke_candidate(root / "releases" / sha, sha)
    previous = read_release_link(root, "current")
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


_NO_CURRENT_PRECONDITION = object()


def promote_release(sha: str, expected_current: str | None) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        return _switch_release(
            root, sha, "PROMOTED", expected_current=expected_current
        )


def rollback_release(
    sha: str,
    expected_current: str | None | object = _NO_CURRENT_PRECONDITION,
) -> dict[str, Any]:
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        if not (root / "releases" / sha).is_dir():
            raise ReleaseError(f"rollback target does not exist: {sha}")
        return _switch_release(
            root,
            sha,
            "ROLLED_BACK",
            expected_current=expected_current,
        )


def _html_request_path(rel: str) -> str:
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return f"/{rel[:-len('index.html')]}"
    return f"/{rel}"


def _html_for_request(site: Path, request_path: str) -> str | None:
    path = urllib.parse.unquote(request_path).split("?", 1)[0]
    if not path.startswith("/") or "\\" in path:
        raise ReleaseError(f"unsafe HTTP inventory request path: {request_path!r}")
    clean = path.lstrip("/")
    if any(part in {".", ".."} for part in clean.split("/")):
        raise ReleaseError(f"unsafe HTTP inventory request path: {request_path!r}")
    candidates: list[str] = []
    if not clean:
        candidates.append("index.html")
    else:
        if clean.endswith(".html"):
            candidates.append(clean)
        if clean.endswith("/"):
            candidates.append(f"{clean}index.html")
        else:
            candidates.extend((f"{clean}.html", f"{clean}/index.html"))
    for rel in candidates:
        target = site / rel
        if target.is_file() and not target.is_symlink():
            return rel
    return None


def _matching_path_rule(
    routes: list[dict[str, Any]], request_path: str
) -> tuple[dict[str, Any] | None, str]:
    normalized_request = request_path if request_path == "/" else request_path.rstrip("/")
    for rule in routes:
        source = rule.get("from") or {}
        if source.get("kind") != "path":
            continue
        source_path = str(source.get("path") or "")
        match = source.get("match")
        if match == "exact":
            normalized_source = (
                source_path if source_path == "/" else source_path.rstrip("/")
            )
            if normalized_request == normalized_source:
                return rule, ""
        elif match == "prefix":
            base = source_path.removesuffix("/*").rstrip("/")
            prefix = f"{base}/"
            if request_path.startswith(prefix):
                return rule, request_path[len(prefix) :]
    return None, ""


def _resolved_http_disposition(
    site: Path,
    routes: list[dict[str, Any]],
    request_path: str,
    *,
    remaining: int = 8,
    seen: frozenset[str] = frozenset(),
) -> dict[str, Any]:
    if remaining <= 0 or request_path in seen:
        raise ReleaseError(f"HTTP inventory redirect cycle at {request_path}")
    physical = _html_for_request(site, request_path)
    rule, splat = _matching_path_rule(routes, request_path)
    if rule is not None:
        action = rule.get("action")
        status = rule.get("status")
        terminal = action == "gone" or rule.get("force") is True or physical is None
        if terminal and action == "gone":
            body = _html_for_request(site, "/404.html")
            if body is None:
                raise ReleaseError("HTTP 410 inventory body /404.html is missing")
            return {
                "status": 410,
                "location": None,
                "final_status": 410,
                "effective_html_path": body,
                "sha256": sha256_file(site / body),
            }
        target = rule.get("to") or {}
        target_path = str(target.get("pathname") or "").replace(":splat", splat)
        if terminal and action == "redirect":
            raw_location = str(target.get("raw") or "").replace(":splat", splat)
            absolute = target.get("absolute") is True
            origin = str(target.get("origin") or "")
            if absolute and origin not in {"https://confenge.com.br", "http://confenge.com.br"}:
                return {
                    "status": int(status),
                    "location": raw_location,
                    "final_status": None,
                    "effective_html_path": None,
                    "sha256": None,
                }
            final = _resolved_http_disposition(
                site,
                routes,
                target_path,
                remaining=remaining - 1,
                seen=seen | {request_path},
            )
            return {
                "status": int(status),
                "location": raw_location,
                "final_status": final["final_status"],
                "effective_html_path": final["effective_html_path"],
                "sha256": final["sha256"],
            }
        if terminal and action == "rewrite":
            physical = _html_for_request(site, target_path)
            if physical is None:
                raise ReleaseError(
                    f"HTTP 200 rewrite target has no HTML body: {target_path}"
                )
    if physical is None:
        raise ReleaseError(f"physical HTML has no effective HTTP body: {request_path}")
    return {
        "status": 200,
        "location": None,
        "final_status": 200,
        "effective_html_path": physical,
        "sha256": sha256_file(site / physical),
    }


def _gone_contract_probes(
    site: Path, routes: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Enumerate withdrawn URLs independently from physical HTML inventory."""
    probes: dict[str, dict[str, Any]] = {}
    for rule in routes:
        source = rule.get("from") or {}
        if source.get("kind") != "path" or rule.get("action") != "gone":
            continue
        source_path = str(source.get("path") or "")
        match = source.get("match")
        if match == "exact":
            request_paths = [source_path]
            if source_path != "/" and not source_path.endswith("/"):
                request_paths.append(f"{source_path}/")
        elif match == "prefix":
            base = source_path.removesuffix("/*").rstrip("/")
            request_paths = [f"{base}/__confenge_contract_probe__"]
        else:
            raise ReleaseError("gone host-contract rule has unsupported match type")
        for request_path in request_paths:
            disposition = _resolved_http_disposition(site, routes, request_path)
            if disposition["status"] != 410 or disposition["final_status"] != 410:
                raise ReleaseError(
                    f"gone host-contract probe did not resolve to 410: {request_path}"
                )
            entry = {
                "request_path": request_path,
                **disposition,
                "rule_order": rule.get("order"),
                "match": match,
            }
            previous = probes.get(request_path)
            if previous is not None and previous != entry:
                raise ReleaseError(
                    f"conflicting gone host-contract probes: {request_path}"
                )
            probes[request_path] = entry
    return dict(sorted(probes.items()))


def served_html_inventory(sha: str) -> dict[str, Any]:
    """Inventory the actual current release independently of build manifests."""
    sha = validate_sha(sha)
    root = release_root()
    with deploy_lock(root):
        current = read_release_link(root, "current")
        if current != sha:
            raise ReleaseError(
                "served inventory current release mismatch; "
                f"expected={sha}, found={current or 'NONE'}"
            )
        manifest = verify_release_envelope_and_tree(root, sha)
        release = root / "releases" / sha
        site = release / "_site"
        html_sha256 = {
            path.relative_to(site).as_posix(): sha256_file(path)
            for path in sorted(site.rglob("*.html"))
            if path.is_file() and not path.is_symlink()
        }
        if not html_sha256:
            raise ReleaseError("served release HTML inventory is empty")
        non_html_sha256 = {
            path.relative_to(site).as_posix(): sha256_file(path)
            for path in sorted(site.rglob("*"))
            if path.is_file() and not path.is_symlink() and path.suffix != ".html"
        }
        host_contract = load_json(
            release / "nginx/generated/contract.normalized.json"
        )
        routes = host_contract.get("routes")
        if not isinstance(routes, list):
            raise ReleaseError("host contract routes are not a list")
        http_dispositions = {}
        for rel in html_sha256:
            request_path = _html_request_path(rel)
            http_dispositions[rel] = {
                "request_path": request_path,
                **_resolved_http_disposition(site, routes, request_path),
            }
        contract_probes = _gone_contract_probes(site, routes)
        public_overlay = release / LIVE_INTEL_PUBLIC_MANIFEST
        build_info = load_json(site / ".well-known/build-info.json")
        runtime_info: dict[str, Any] | None = None
        if os.environ.get("CONFENGE_RELEASE_TEST_MODE") != "1":
            upstream = (manifest.get("host_contract") or {}).get("runtime_upstream") or {}
            host = upstream.get("host")
            port = upstream.get("port")
            if host in LOOPBACK_HOSTS and isinstance(port, int):
                try:
                    runtime_info = _http_get_json(
                        f"http://{host}:{port}/.well-known/runtime-info.json"
                    )
                except ReleaseError:
                    runtime_info = None
        return {
            "schema": "confenge.served-html-inventory/v1",
            "release_sha": sha,
            "html_sha256": html_sha256,
            "non_html_sha256": non_html_sha256,
            "http_dispositions": http_dispositions,
            "contract_probes": contract_probes,
            "overlay": load_json(public_overlay) if public_overlay.is_file() else None,
            "build_info": build_info,
            "runtime_info": runtime_info,
            "release_control_sha256": release_controller_evidence_hash(),
        }


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
        "served-html-inventory": "inventory",
        "prune-releases": "prune",
    }.get(name)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    argv = list(sys.argv[1:] if argv is None else argv)
    implicit = _command_from_argv0(sys.argv[0])
    if implicit:
        argv.insert(0, implicit)
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("stage", "verify", "promote", "rollback", "inventory"):
        child = subparsers.add_parser(command)
        child.add_argument("sha")
        if command == "stage":
            child.add_argument("--upload-dir", type=Path)
        if command == "promote":
            child.add_argument(
                "--expected-current",
                required=True,
                help="authorized predecessor full SHA, or NONE when no current release exists",
            )
        if command == "rollback":
            child.add_argument(
                "--expected-current",
                help="optional compensating guard: candidate full SHA, or NONE",
            )
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
            expected_current = (
                None
                if args.expected_current == "NONE"
                else validate_sha(args.expected_current)
            )
            promote_release(args.sha, expected_current)
            result = {
                "status": "PROMOTED",
                "sha": args.sha,
                "current_identity": args.sha,
            }
        elif args.command == "rollback":
            rollback_expected: str | None | object = _NO_CURRENT_PRECONDITION
            if args.expected_current is not None:
                rollback_expected = (
                    None
                    if args.expected_current == "NONE"
                    else validate_sha(args.expected_current)
                )
            rollback_release(args.sha, rollback_expected)
            result = {
                "status": "ROLLED_BACK",
                "sha": args.sha,
                "current_identity": args.sha,
            }
        elif args.command == "inventory":
            result = served_html_inventory(args.sha)
        else:
            removed = prune_releases(args.keep)
            result = {
                "status": "PRUNED",
                "removed": removed,
                "keep_previous": args.keep,
            }
        result["release_control_sha256"] = release_controller_evidence_hash()
    except ReleaseError as exc:
        print(f"NETCUP_RELEASE_ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
