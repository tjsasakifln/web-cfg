#!/usr/bin/env python3
"""Launch the current immutable runtime with release-bound identity."""

from __future__ import annotations

import os
from pathlib import Path

try:
    from .release_control import ReleaseError, load_json, read_release_link, release_root
except ImportError:  # Installed scripts share /opt/confenge-web/lib without a package.
    from release_control import ReleaseError, load_json, read_release_link, release_root


def runtime_environment(root: Path) -> tuple[Path, dict[str, str]]:
    sha = read_release_link(root, "current")
    if not sha:
        raise ReleaseError("current release is required before runtime launch")
    release = root / "releases" / sha
    manifest = load_json(release / "metadata" / "release-manifest.json")
    integrated = load_json(release / "runtime" / "contract.json")
    netcup = integrated.get("netcup_production") or {}
    expected_port = str(netcup.get("port") or "")
    configured_port = str(os.environ.get("RUNTIME_PORT") or "")
    if not expected_port or configured_port != expected_port:
        raise ReleaseError(
            f"RUNTIME_PORT must explicitly match the release contract ({expected_port})"
        )
    if os.environ.get("NODE_ENV") != "production":
        raise ReleaseError("NODE_ENV=production is required by the Netcup launcher")
    if os.environ.get("CONFENGE_STORAGE_BACKEND") != "filesystem":
        raise ReleaseError("CONFENGE_STORAGE_BACKEND=filesystem is required on Netcup")
    if not os.environ.get("CONFENGE_STORAGE_DIR"):
        raise ReleaseError("CONFENGE_STORAGE_DIR is required on Netcup")
    artifact = manifest.get("artifact") or {}
    public = manifest.get("public_artifact") or {}
    env = dict(os.environ)
    env.update(
        {
            "RUNTIME_HOST": str(netcup.get("host") or "127.0.0.1"),
            "RUNTIME_PORT": expected_port,
            "RUNTIME_PROFILE": str(netcup.get("profile") or "netcup-production"),
            "RUNTIME_RELEASE_SHA": sha,
            "RUNTIME_BUILD_TIMESTAMP": str(manifest.get("built_at") or ""),
            "RUNTIME_PUBLIC_ARTIFACT_HASH": str(public.get("artifact_hash") or ""),
            "RUNTIME_RELEASE_BUNDLE_HASH": str(artifact.get("sha256") or ""),
        }
    )
    return release, env


def main() -> int:
    try:
        release, env = runtime_environment(release_root())
        os.chdir(release)
        os.execvpe("node", ["node", "runtime/server.mjs"], env)
    except (OSError, ReleaseError) as exc:
        print(f"NETCUP_RUNTIME_START_BLOCKED: {exc}", file=os.sys.stderr)
        return 78
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
