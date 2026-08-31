#!/usr/bin/env python3
"""Build the immutable Netcup release payload from the gated ``_site`` tree.

The deploy tarball cannot contain its own SHA-256 without a circular digest.
``release-manifest.json`` is therefore a detached, checksummed envelope.  The
payload still contains source metadata plus a SHA-256 manifest for every file.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import stat
import tarfile
import tempfile
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = "tjsasakifln/web-cfg"
SCHEMA_VERSION = "1.0.0"
OPERATIONAL_PRIVACY_RETENTION_CAPABILITY = "confenge.operational-privacy-retention/v1"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
HEX_256 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_PATH_PARTS = {".git", "node_modules", "__pycache__", ".pytest_cache"}
FORBIDDEN_FILE_SUFFIXES = {".pem", ".key", ".sql", ".dump", ".sqlite", ".sqlite3"}


class PackageError(RuntimeError):
    """Release input is unsafe or inconsistent."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PackageError(f"invalid JSON at {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PackageError(f"expected JSON object at {path}")
    return value


def assert_regular_tree(root: Path, label: str) -> None:
    if not root.is_dir() or root.is_symlink():
        raise PackageError(f"{label} must be a real directory: {root}")
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise PackageError(f"{label} contains a symlink: {path.relative_to(root)}")
        mode = path.stat().st_mode
        if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            raise PackageError(
                f"{label} contains a special file: {path.relative_to(root)}"
            )


def assert_payload_hygiene(root: Path) -> None:
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in FORBIDDEN_PATH_PARTS for part in rel.parts):
            raise PackageError(f"release payload contains a forbidden path: {rel}")
        if not path.is_file():
            continue
        if path.name == ".env" or path.suffix.lower() in FORBIDDEN_FILE_SUFFIXES:
            raise PackageError(
                f"release payload contains a secret/dump-shaped file: {rel}"
            )
        with path.open("rb") as handle:
            sample = handle.read(1024 * 1024)
        if (
            b"-----BEGIN OPENSSH PRIVATE KEY-----" in sample
            or b"-----BEGIN RSA PRIVATE KEY-----" in sample
        ):
            raise PackageError(f"release payload contains private-key material: {rel}")


def copy_tree(source: Path, destination: Path) -> None:
    assert_regular_tree(source, source.name)
    shutil.copytree(
        source,
        destination,
        copy_function=shutil.copy2,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache"),
    )


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(
        root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()
    ):
        if path.is_file() and not path.is_symlink():
            yield path


def files_manifest(root: Path, excluded: set[str] | None = None) -> str:
    excluded = excluded or set()
    lines: list[str] = []
    for path in iter_files(root):
        rel = path.relative_to(root).as_posix()
        if rel in excluded:
            continue
        lines.append(f"{sha256_file(path)}  {rel}")
    return "\n".join(lines) + "\n"


def _normalized_mode(path: Path) -> int:
    executable = bool(path.stat().st_mode & stat.S_IXUSR)
    return 0o755 if executable else 0o644


def write_deterministic_tar(source: Path, output: Path, epoch: int) -> None:
    """Write a gzip/tar with stable ordering, ownership, modes and mtimes."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with (
        output.open("wb") as raw,
        gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=epoch) as zipped,
        tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as archive,
    ):
        paths = sorted(
            source.rglob("*"), key=lambda item: item.relative_to(source).as_posix()
        )
        for path in paths:
            rel = path.relative_to(source).as_posix()
            info = tarfile.TarInfo(rel + ("/" if path.is_dir() else ""))
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mtime = epoch
            info.pax_headers = {}
            if path.is_dir():
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                archive.addfile(info)
                continue
            if not path.is_file() or path.is_symlink():
                raise PackageError(f"refusing non-regular payload entry: {rel}")
            info.size = path.stat().st_size
            info.mode = _normalized_mode(path)
            with path.open("rb") as handle:
                archive.addfile(info, handle)


def validate_public_identity(site: Path, sha: str) -> dict[str, Any]:
    identity_path = site / ".well-known" / "build-info.json"
    build_manifest_path = site / ".well-known" / "build-manifest.json"
    pseo_path = site / ".well-known" / "pseo-build.json"
    release_result_path = site / ".well-known" / "release-result.json"
    for path in (
        identity_path,
        build_manifest_path,
        pseo_path,
        release_result_path,
        site / "index.html",
    ):
        if not path.is_file() or path.is_symlink():
            raise PackageError(
                f"gated public artifact is missing {path.relative_to(site)}"
            )

    identity = load_json(identity_path)
    build_manifest = load_json(build_manifest_path)
    pseo = load_json(pseo_path)
    release_result = load_json(release_result_path)
    commits = {
        str(identity.get("commit") or ""),
        str(build_manifest.get("commit") or ""),
        str(pseo.get("web_cfg_sha") or ""),
        str(release_result.get("commit") or release_result.get("web_cfg_sha") or ""),
    }
    if commits != {sha}:
        raise PackageError(
            f"public identity SHA mismatch: expected {sha}, found {sorted(commits)}"
        )

    artifact_hash = str(build_manifest.get("artifact_hash") or "")
    manifest_hash = str(build_manifest.get("manifest_hash") or "")
    if not HEX_256.fullmatch(artifact_hash) or not HEX_256.fullmatch(manifest_hash):
        raise PackageError(
            "public build manifest is missing full SHA-256 identity hashes"
        )
    if identity.get("artifact_hash") != artifact_hash:
        raise PackageError("build-info artifact_hash conflicts with build-manifest")
    if identity.get("manifest_hash") != manifest_hash:
        raise PackageError("build-info manifest_hash conflicts with build-manifest")
    if release_result.get("artifact_hash") != artifact_hash:
        raise PackageError("release-result artifact_hash conflicts with build-manifest")
    if release_result.get("manifest_hash") != manifest_hash:
        raise PackageError("release-result manifest_hash conflicts with build-manifest")
    built_at = identity.get("build_time")
    if not isinstance(built_at, str) or not built_at.endswith("Z"):
        raise PackageError("build-info build_time is missing or not UTC")

    return {
        "identity_path": "/.well-known/build-info.json",
        "artifact_hash": artifact_hash,
        "manifest_hash": manifest_hash,
        "build_info_schema_version": identity.get("schema_version"),
        "built_at": built_at,
    }


def validate_host_contract(host_contract: Path, integrated: dict[str, Any]) -> dict[str, Any]:
    assert_regular_tree(host_contract, "generated host contract")
    manifest_path = host_contract / "manifest.json"
    contract_path = host_contract / "contract.normalized.json"
    manifest = load_json(manifest_path)
    contract = load_json(contract_path)
    if manifest.get("schema") != "confenge.http-host-contract-manifest/v1":
        raise PackageError("generated host contract manifest schema mismatch")
    expected_architecture = integrated.get("host_architecture_version")
    if (
        manifest.get("hostArchitectureVersion") != expected_architecture
        or contract.get("hostArchitectureVersion") != expected_architecture
    ):
        raise PackageError("host architecture version diverges from runtime/contract.json")
    runtime = contract.get("runtime") or {}
    upstream = runtime.get("upstream") or {}
    expected_netcup = integrated.get("netcup_production") or {}
    if (
        runtime.get("contractVersion") != integrated.get("runtime_contract_version")
        or runtime.get("storageContractVersion") != integrated.get("storage_contract_version")
        or upstream.get("host") != expected_netcup.get("host")
        or upstream.get("port") != expected_netcup.get("port")
        or runtime.get("nginxProxyGenerated") is not True
    ):
        raise PackageError("generated host/runtime contract is not the integrated Netcup contract")
    outputs = manifest.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        raise PackageError("generated host contract has no checksummed outputs")
    for record in outputs:
        name = str(record.get("path") or "") if isinstance(record, dict) else ""
        if not name or Path(name).name != name:
            raise PackageError("generated host contract output path is unsafe")
        target = host_contract / name
        if not target.is_file() or target.is_symlink():
            raise PackageError(f"generated host contract output is missing: {name}")
        if record.get("sha256") != sha256_file(target):
            raise PackageError(f"generated host contract output hash mismatch: {name}")
    contract_hash = sha256_file(contract_path)
    if contract_hash != manifest.get("contractHash"):
        raise PackageError("generated normalized contract hash mismatch")
    return {
        "schema": manifest.get("schema"),
        "contract_hash": contract_hash,
        "manifest_hash": sha256_file(manifest_path),
        "host_architecture_version": expected_architecture,
        "runtime_upstream": upstream,
    }


def build_release(
    *,
    repo_root: Path,
    site: Path,
    host_contract: Path,
    output_dir: Path,
    sha: str,
    node_version: str,
    python_version: str,
    ci_run_id: str | None,
    ci_run_url: str | None,
    source_date_epoch: int,
) -> dict[str, Path]:
    if not FULL_SHA.fullmatch(sha):
        raise PackageError(
            "release SHA must be exactly 40 lowercase hexadecimal characters"
        )
    if source_date_epoch <= 0:
        raise PackageError("SOURCE_DATE_EPOCH must be a positive Unix timestamp")

    repo_root = repo_root.resolve()
    site = site.resolve()
    host_contract = host_contract.resolve()
    output_dir = output_dir.resolve()
    assert_regular_tree(site, "_site")
    public_identity = validate_public_identity(site, sha)
    integrated_contract = load_json(repo_root / "runtime" / "contract.json")
    if integrated_contract.get("schema") != "confenge.runtime-host-contract/v1":
        raise PackageError("unsupported integrated runtime/host contract schema")
    host_contract_identity = validate_host_contract(host_contract, integrated_contract)

    package_name = f"confenge-web-{sha}.tar.gz"
    output_dir.mkdir(parents=True, exist_ok=True)
    package_path = output_dir / package_name
    manifest_path = output_dir / "release-manifest.json"
    checksum_path = output_dir / f"{package_name}.sha256"
    for path in (package_path, manifest_path, checksum_path):
        if path.exists():
            raise PackageError(f"refusing to overwrite release output: {path}")

    with tempfile.TemporaryDirectory(prefix="confenge-netcup-package-") as temporary:
        payload = Path(temporary) / "payload"
        payload.mkdir()
        copy_tree(site, payload / "_site")

        control_root = repo_root / "deploy" / "netcup"
        copy_tree(control_root / "bin", payload / "ops" / "bin")
        copy_tree(control_root / "lib", payload / "ops" / "lib")
        for source_name, target_name in (
            ("nginx", "nginx"),
            ("schedules", "schedules"),
            ("runtime", "ops/systemd"),
        ):
            source = control_root / source_name
            if source.is_dir():
                copy_tree(source, payload / target_name)

        runtime_source = repo_root / "runtime"
        functions_source = repo_root / "netlify" / "functions"
        for required, label in (
            (runtime_source, "runtime"),
            (functions_source, "netlify/functions"),
        ):
            if not required.is_dir() or required.is_symlink():
                raise PackageError(f"required portable {label} tree is missing")
        copy_tree(runtime_source, payload / "runtime")
        copy_tree(functions_source, payload / "netlify" / "functions")
        for source, destination in (
            (repo_root / "scripts" / "conversion", payload / "scripts" / "conversion"),
            (repo_root / "scripts" / "offers", payload / "scripts" / "offers"),
            (repo_root / "data" / "commercial", payload / "data" / "commercial"),
            (repo_root / "data" / "conversion", payload / "data" / "conversion"),
        ):
            copy_tree(source, destination)
        for relative in (
            "scripts/storage/lib.cjs",
            "scripts/storage/retention.mjs",
        ):
            source = repo_root / relative
            destination = payload / relative
            if not source.is_file() or source.is_symlink():
                raise PackageError(f"required runtime file is missing: {relative}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        copy_tree(
            repo_root / "data" / "offers" / "fixtures",
            payload / "data" / "offers" / "fixtures",
        )
        for relative in (
            "data/revops/inbound-backlog-decision.v1.json",
            "data/revops/closed-loop-funnel.v1.json",
            "data/nurture/tracks.json",
            "data/site/editorial-policy.json",
            "data/bofu-dominance/core/gsc-live-overlay.v1.json",
            "data/offers/flags.json",
            "data/offers/catalog.snapshot.json",
            "data/offers/provider-mapping.json",
        ):
            source = repo_root / relative
            destination = payload / relative
            if not source.is_file() or source.is_symlink():
                raise PackageError(f"required runtime data file is missing: {relative}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        for name in ("netlify.toml", "package.json", "package-lock.json"):
            source = repo_root / name
            if not source.is_file() or source.is_symlink():
                raise PackageError(f"required runtime file is missing: {name}")
            shutil.copy2(source, payload / name)
        copy_tree(host_contract, payload / "nginx" / "generated")

        built_at = public_identity.get("built_at") or datetime.fromtimestamp(
            source_date_epoch, tz=timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        source_metadata = {
            "schema_version": SCHEMA_VERSION,
            "repo": REPO,
            "commit": sha,
            "built_at": built_at,
            "public_artifact": public_identity,
            "runtime": {
                "contract_version": integrated_contract["runtime_contract_version"],
                "storage_contract_version": integrated_contract["storage_contract_version"],
                "host_architecture_version": integrated_contract["host_architecture_version"],
                "portable_runtime_included": True,
                "portable_runtime_source": "runtime/",
                "functions_source": "netlify/functions/",
                "netcup": integrated_contract["netcup_production"],
            },
            "host_contract": host_contract_identity,
            "capabilities": {
                "operational_privacy_retention": OPERATIONAL_PRIVACY_RETENTION_CAPABILITY,
            },
            "package_layout": [
                "_site/",
                "metadata/",
                "ops/",
                "nginx/",
                "schedules/",
                "runtime/",
                "netlify/functions/",
                "scripts/conversion/",
                "scripts/offers/",
                "scripts/storage/lib.cjs",
                "scripts/storage/retention.mjs",
                "data/commercial/",
                "data/conversion/",
                "data/nurture/tracks.json",
                "data/site/editorial-policy.json",
                "data/bofu-dominance/core/gsc-live-overlay.v1.json",
                "data/offers/flags.json",
                "data/offers/catalog.snapshot.json",
                "data/offers/provider-mapping.json",
                "data/offers/fixtures/",
                "data/revops/inbound-backlog-decision.v1.json",
                "data/revops/closed-loop-funnel.v1.json",
                "netlify.toml",
                "package.json",
                "package-lock.json",
            ],
        }
        write_json(payload / "metadata" / "release-source.json", source_metadata)
        file_manifest_path = payload / "metadata" / "files.sha256"
        file_manifest_path.write_text(
            files_manifest(payload, {"metadata/files.sha256"}), encoding="utf-8"
        )
        files_manifest_sha256 = sha256_file(file_manifest_path)
        assert_regular_tree(payload, "release payload")
        assert_payload_hygiene(payload)
        write_deterministic_tar(payload, package_path, source_date_epoch)

    artifact_sha = sha256_file(package_path)
    release_manifest = {
        "schema_version": SCHEMA_VERSION,
        "manifest_type": "confenge.netcup-release",
        "repo": REPO,
        "commit": sha,
        "built_at": public_identity.get("built_at"),
        "ci": {"run_id": ci_run_id or None, "run_url": ci_run_url or None},
        "tools": {"node": node_version, "python": python_version},
        "artifact": {
            "filename": package_name,
            "sha256": artifact_sha,
            "size_bytes": package_path.stat().st_size,
            "checksum_filename": checksum_path.name,
            "files_manifest_sha256": files_manifest_sha256,
        },
        "public_artifact": public_identity,
        "contract_versions": {
            "integrated": integrated_contract["schema"],
            "runtime": integrated_contract["runtime_contract_version"],
            "storage": integrated_contract["storage_contract_version"],
            "host_architecture": integrated_contract["host_architecture_version"],
            "http_host_manifest": host_contract_identity["schema"],
        },
        "capabilities": {
            "operational_privacy_retention": OPERATIONAL_PRIVACY_RETENTION_CAPABILITY,
        },
        "host_contract": host_contract_identity,
        "identity_contract": {
            "canonical_public_path": "/.well-known/build-info.json",
            "rule": "release manifest references, but never replaces, the public build identity",
        },
    }
    write_json(manifest_path, release_manifest)
    checksum_path.write_text(f"{artifact_sha}  {package_name}\n", encoding="utf-8")
    return {
        "artifact": package_path,
        "manifest": manifest_path,
        "checksum": checksum_path,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--site", type=Path, required=True)
    parser.add_argument("--host-contract", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--node-version", required=True)
    parser.add_argument("--python-version", required=True)
    parser.add_argument("--ci-run-id")
    parser.add_argument("--ci-run-url")
    parser.add_argument("--source-date-epoch", type=int, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        outputs = build_release(
            repo_root=args.repo_root,
            site=args.site,
            host_contract=args.host_contract,
            output_dir=args.output,
            sha=args.sha,
            node_version=args.node_version,
            python_version=args.python_version,
            ci_run_id=args.ci_run_id,
            ci_run_url=args.ci_run_url,
            source_date_epoch=args.source_date_epoch,
        )
    except PackageError as exc:
        print(f"NETCUP_PACKAGE_ERROR: {exc}", file=os.sys.stderr)
        return 2
    manifest = load_json(outputs["manifest"])
    print(
        json.dumps(
            {
                "status": "PACKAGED",
                "commit": manifest["commit"],
                "artifact": outputs["artifact"].name,
                "artifact_sha256": manifest["artifact"]["sha256"],
                "public_artifact_hash": manifest["public_artifact"]["artifact_hash"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
