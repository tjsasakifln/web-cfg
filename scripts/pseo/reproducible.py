#!/usr/bin/env python3
"""Reproducible public-artifact hashing, compare, and input/output manifest.

Pure units used by `build:site`. Timestamps listed in VERSIONED_TIMESTAMP_FIELDS
are the only clock fields ignored when comparing two clean builds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

SCHEMA_VERSION = "1.0.0"

# Wall-clock fields that two clean builds may differ on. Any other byte
# difference fails the compare closed.
VERSIONED_TIMESTAMP_FIELDS = frozenset(
    {"build_time", "generated_at", "preview_generated_at"}
)

# Written every `build:site` into `.well-known/`. Not source; wiped at start
# so a leftover from a prior local run cannot enter the next assemble.
GENERATED_WELL_KNOWN = frozenset(
    {
        "pseo-build.json",
        "build-info.json",
        "release-result.json",
        "build-manifest.json",
    }
)

# Self-referential hashes written into identity JSON after the tree hash is
# computed. Emptied before hashing so the artifact hash is not circular.
DERIVED_HASH_FIELDS = frozenset(
    {"artifact_hash", "manifest_hash", "public_artifact_hash"}
)

NORMALIZE_FIELDS = VERSIONED_TIMESTAMP_FIELDS | DERIVED_HASH_FIELDS

# Env names the build may *record as present*. Values are never written.
# Secret-bearing names (tokens, DSNs, keys) must not be added here.
BUILD_ENV_NAME_ALLOWLIST = (
    "COMMIT_REF",
    "CACHED_COMMIT_REF",
    "GITHUB_SHA",
    "CF_PAGES_COMMIT_SHA",
    "CONTEXT",
    "NETLIFY_CONTEXT",
    "NODE_ENV",
    "DEPLOY_ID",
    "NETLIFY_DEPLOY_ID",
    "SOURCE_DATE_EPOCH",
    "CI",
    "NETLIFY",
    "GITHUB_ACTIONS",
)

# Public diagnostic / public manifest keys. Anything else is dropped.
PUBLIC_BUILD_INFO_KEYS = frozenset(
    {
        "schema_version",
        "commit",
        "build_time",
        "environment",
        "site_schema_version",
        "deploy_id",
        "artifact_hash",
        "manifest_hash",
        "source",
        "versioned_timestamp_fields",
    }
)

PUBLIC_MANIFEST_KEYS = frozenset(
    {
        "schema_version",
        "commit",
        "artifact_hash",
        "manifest_hash",
        "inputs",
        "tools",
        "env_names",
        "versioned_timestamp_fields",
        "generated_files",
        "generated_file_count",
    }
)

# Extra leak patterns for public JSON payloads (stricter than HTML scan).
_PAYLOAD_LEAK_PATTERNS = [
    re.compile(r"(?i)postgres(ql)?://[^\s\"']+"),
    re.compile(r"(?i)mysql://[^\s\"']+"),
    re.compile(r"(?i)mongodb(\+srv)?://[^\s\"']+"),
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['\"][^'\"]{8,}"),
    re.compile(r"(?i)-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)Bearer\s+[A-Za-z0-9\-_]{20,}"),
    re.compile(r"/home/[A-Za-z0-9._-]+/"),
    re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    re.compile(r"/mnt/[A-Za-z0-9._-]+/"),
    re.compile(r"/tmp/[A-Za-z0-9._-]+"),
    re.compile(r"[A-Za-z]:\\Users\\"),
    re.compile(r"[A-Za-z]:\\\\Users\\\\"),
]

JSON_SUFFIXES = frozenset({".json", ".webmanifest"})


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def canonical_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
        + "\n"
    ).encode("utf-8")


def normalize_json_value(value: Any, fields: frozenset[str] | set[str] = NORMALIZE_FIELDS) -> Any:
    """Replace listed keys with None anywhere in a JSON-like value."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, child in value.items():
            if key in fields:
                out[key] = None
            else:
                out[key] = normalize_json_value(child, fields)
        return out
    if isinstance(value, list):
        return [normalize_json_value(child, fields) for child in value]
    return value


def normalize_json_bytes(
    data: bytes, fields: frozenset[str] | set[str] = NORMALIZE_FIELDS
) -> bytes:
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return data
    return canonical_json_bytes(normalize_json_value(parsed, fields))


def normalize_file_bytes(
    path: Path,
    data: bytes | None = None,
    fields: frozenset[str] | set[str] = NORMALIZE_FIELDS,
) -> bytes:
    raw = data if data is not None else path.read_bytes()
    if path.suffix.lower() in JSON_SUFFIXES:
        return normalize_json_bytes(raw, fields)
    return raw


def content_hash(
    path: Path,
    fields: frozenset[str] | set[str] = NORMALIZE_FIELDS,
) -> str:
    return sha256_bytes(normalize_file_bytes(path, fields=fields))


def file_hashes(
    tree: Path,
    fields: frozenset[str] | set[str] = NORMALIZE_FIELDS,
) -> dict[str, str]:
    """Relative path → normalized content hash for every file under *tree*."""
    out: dict[str, str] = {}
    if not tree.is_dir():
        return out
    for path in sorted(tree.rglob("*")):
        if path.is_file():
            rel = path.relative_to(tree).as_posix()
            out[rel] = content_hash(path, fields)
    return out


def content_tree_hash(
    tree: Path,
    fields: frozenset[str] | set[str] = NORMALIZE_FIELDS,
) -> str:
    """Deterministic hash of relative paths + normalized content hashes."""
    items = file_hashes(tree, fields)
    body = "\n".join(f"{rel}:{digest}" for rel, digest in items.items())
    return sha256_text(body)


def _json_leaf_diffs(left: Any, right: Any, prefix: str = "") -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    if type(left) is not type(right):
        diffs.append({"path": prefix or "$", "left": left, "right": right})
        return diffs
    if isinstance(left, dict):
        keys = set(left) | set(right)
        for key in sorted(keys):
            child = f"{prefix}.{key}" if prefix else key
            if key not in left:
                diffs.append({"path": child, "left": None, "right": right[key]})
            elif key not in right:
                diffs.append({"path": child, "left": left[key], "right": None})
            else:
                diffs.extend(_json_leaf_diffs(left[key], right[key], child))
        return diffs
    if isinstance(left, list):
        n = max(len(left), len(right))
        for i in range(n):
            child = f"{prefix}[{i}]"
            if i >= len(left):
                diffs.append({"path": child, "left": None, "right": right[i]})
            elif i >= len(right):
                diffs.append({"path": child, "left": left[i], "right": None})
            else:
                diffs.extend(_json_leaf_diffs(left[i], right[i], child))
        return diffs
    if left != right:
        diffs.append({"path": prefix or "$", "left": left, "right": right})
    return diffs


def _leaf_field_name(path: str) -> str:
    # "foo.bar.build_time" → "build_time"; "items[0].generated_at" → "generated_at"
    tail = path.split(".")[-1]
    return tail.split("[", 1)[0]


def _versioned_cause(field: str) -> str | None:
    if field in VERSIONED_TIMESTAMP_FIELDS:
        return "versioned_timestamp"
    if field in DERIVED_HASH_FIELDS:
        return "versioned_derived_hash"
    return None


def compare_trees(
    tree_a: Path,
    tree_b: Path,
    fields: frozenset[str] | set[str] = NORMALIZE_FIELDS,
) -> dict[str, Any]:
    """Compare two publish trees after normalizing versioned fields.

    Fail-closed: leftover diffs must each carry an explicit versioned cause.
    """
    hashes_a = file_hashes(tree_a, fields)
    hashes_b = file_hashes(tree_b, fields)
    only_a = sorted(set(hashes_a) - set(hashes_b))
    only_b = sorted(set(hashes_b) - set(hashes_a))
    versioned_diffs: list[dict[str, Any]] = []
    content_diffs: list[dict[str, Any]] = []

    for rel in sorted(set(hashes_a) & set(hashes_b)):
        path_a = tree_a / rel
        path_b = tree_b / rel
        raw_a = path_a.read_bytes()
        raw_b = path_b.read_bytes()
        if raw_a == raw_b:
            continue
        if hashes_a[rel] == hashes_b[rel]:
            cause_fields: list[str] = []
            if path_a.suffix.lower() in JSON_SUFFIXES:
                try:
                    ja = json.loads(raw_a.decode("utf-8"))
                    jb = json.loads(raw_b.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    ja = jb = None
                if ja is not None:
                    for diff in _json_leaf_diffs(ja, jb):
                        field = _leaf_field_name(diff["path"])
                        cause = _versioned_cause(field)
                        if cause:
                            cause_fields.append(field)
                        else:
                            content_diffs.append(
                                {
                                    "path": rel,
                                    "field": diff["path"],
                                    "cause": None,
                                    "detail": "normalized hash matched but non-versioned field differs",
                                }
                            )
            versioned_diffs.append(
                {
                    "path": rel,
                    "fields": sorted(set(cause_fields)),
                    "cause": "versioned_timestamp"
                    if set(cause_fields) <= VERSIONED_TIMESTAMP_FIELDS
                    else "versioned_field",
                }
            )
            continue
        # Normalized hashes differ: inspect JSON for leftover unversioned keys.
        listed = False
        if path_a.suffix.lower() in JSON_SUFFIXES:
            try:
                ja = json.loads(raw_a.decode("utf-8"))
                jb = json.loads(raw_b.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                ja = jb = None
            if ja is not None:
                for diff in _json_leaf_diffs(ja, jb):
                    field = _leaf_field_name(diff["path"])
                    cause = _versioned_cause(field)
                    entry = {
                        "path": rel,
                        "field": diff["path"],
                        "cause": cause,
                    }
                    if cause:
                        versioned_diffs.append(entry)
                    else:
                        content_diffs.append(entry)
                    listed = True
        if not listed:
            content_diffs.append(
                {
                    "path": rel,
                    "field": None,
                    "cause": None,
                    "detail": "normalized content hash differs",
                }
            )

    leftover = (
        [{"path": p, "cause": None, "detail": "only_in_a"} for p in only_a]
        + [{"path": p, "cause": None, "detail": "only_in_b"} for p in only_b]
        + content_diffs
    )
    ok = len(leftover) == 0
    return {
        "ok": ok,
        "identical_after_normalize": ok,
        "versioned_timestamp_fields": sorted(VERSIONED_TIMESTAMP_FIELDS),
        "derived_hash_fields": sorted(DERIVED_HASH_FIELDS),
        "tree_a": str(tree_a),
        "tree_b": str(tree_b),
        "file_count_a": len(hashes_a),
        "file_count_b": len(hashes_b),
        "hash_a": content_tree_hash(tree_a, fields),
        "hash_b": content_tree_hash(tree_b, fields),
        "only_in_a": only_a,
        "only_in_b": only_b,
        "versioned_diffs": versioned_diffs,
        "content_diffs": content_diffs,
        "leftover": leftover,
    }


def present_env_names(
    environ: dict[str, str] | None = None,
    allowlist: tuple[str, ...] = BUILD_ENV_NAME_ALLOWLIST,
) -> list[str]:
    """Return allowlisted env *names* that are set. Never values."""
    env = environ if environ is not None else os.environ
    return [name for name in allowlist if (env.get(name) or "").strip() != ""]


def _cmd_version(argv: list[str]) -> str | None:
    try:
        out = subprocess.check_output(argv, text=True, stderr=subprocess.DEVNULL, timeout=10)
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return None
    return (out or "").strip() or None


def collect_tool_versions() -> dict[str, str | None]:
    node = _cmd_version(["node", "--version"])
    npm = _cmd_version(["npm", "--version"])
    return {
        "python": sys.version.split()[0],
        "node": node.lstrip("v") if node else None,
        "npm": npm,
    }


def build_timestamp(now: datetime | None = None) -> str:
    """UTC timestamp. SOURCE_DATE_EPOCH wins when set (unix seconds)."""
    epoch = (os.environ.get("SOURCE_DATE_EPOCH") or "").strip()
    if epoch.isdigit():
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stamp = now or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _repo_rel(root: Path, path: Path) -> str | None:
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        return None
    text = rel.as_posix()
    if text.startswith(".."):
        return None
    return text


def collect_input_shas(root: Path) -> dict[str, Any]:
    """Content hashes of commit-adjacent inputs that affect the public artifact.

    Paths are repo-relative. Files outside *root* are skipped (never hashed
    under an absolute path).
    """
    from scripts.pseo.public_artifact import (
        FORBIDDEN_DIR_NAMES,
        PUBLIC_ROOT_FILES,
        PUBLIC_TOP_DIRS,
    )

    files: dict[str, str] = {}
    trees: dict[str, str] = {}

    for directory, pattern in (
        (root / "data" / "pseo", "*.json"),
        (root / "data" / "editorial", "*.json"),
    ):
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob(pattern)):
            if not path.is_file():
                continue
            rel = _repo_rel(root, path)
            if rel:
                files[rel] = sha256_file(path)

    editorial_pages = root / "data" / "editorial" / "pages"
    if editorial_pages.is_dir():
        for path in sorted(editorial_pages.glob("*.json")):
            if not path.is_file():
                continue
            rel = _repo_rel(root, path)
            if rel:
                files[rel] = sha256_file(path)

    for name in sorted(PUBLIC_ROOT_FILES):
        path = root / name
        if path.is_file():
            rel = _repo_rel(root, path)
            if rel:
                files[rel] = sha256_file(path)

    for name in sorted(PUBLIC_TOP_DIRS):
        directory = root / name
        if not directory.is_dir():
            continue
        tree_items: list[str] = []
        for path in sorted(directory.rglob("*")):
            if not path.is_file():
                continue
            if any(part in FORBIDDEN_DIR_NAMES for part in path.relative_to(root).parts):
                continue
            if name == ".well-known" and path.name in GENERATED_WELL_KNOWN:
                continue
            rel = _repo_rel(root, path)
            if not rel:
                continue
            digest = sha256_file(path)
            tree_items.append(f"{rel}:{digest}")
        if tree_items:
            trees[name + "/"] = sha256_text("\n".join(tree_items))

    return {
        "files": files,
        "trees": trees,
        "file_count": len(files),
        "tree_count": len(trees),
    }


def scan_text_for_leaks(text: str) -> list[str]:
    hits: list[str] = []
    for pat in _PAYLOAD_LEAK_PATTERNS:
        if pat.search(text):
            hits.append(pat.pattern)
    return hits


def _walk_strings(value: Any) -> list[str]:
    found: list[str] = []
    if isinstance(value, str):
        found.append(value)
    elif isinstance(value, dict):
        for key, child in value.items():
            if isinstance(key, str):
                found.append(key)
            found.extend(_walk_strings(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_walk_strings(child))
    return found


def assert_public_payload_clean(payload: Any, *, label: str = "payload") -> None:
    """Fail-closed: secrets and local filesystem paths must not appear."""
    text = json.dumps(payload, ensure_ascii=False, default=str)
    hits = scan_text_for_leaks(text)
    for raw in _walk_strings(payload):
        hits.extend(scan_text_for_leaks(raw))
        if (
            raw.startswith("/home/")
            or raw.startswith("/Users/")
            or raw.startswith("/tmp/")
            or raw.startswith("/mnt/")
            or re.match(r"[A-Za-z]:\\Users\\", raw)
        ):
            raise ValueError(f"{label} contains a local filesystem path")
    if hits:
        raise ValueError(f"{label} contains secret or local path: {hits[0]}")


def allowlist_public_build_info(payload: dict[str, Any]) -> dict[str, Any]:
    out = {k: payload.get(k) for k in sorted(PUBLIC_BUILD_INFO_KEYS) if k in payload}
    assert_public_payload_clean(out, label="build-info")
    return out


def allowlist_public_manifest(payload: dict[str, Any]) -> dict[str, Any]:
    out = {k: payload.get(k) for k in sorted(PUBLIC_MANIFEST_KEYS) if k in payload}
    assert_public_payload_clean(out, label="build-manifest")
    return out


def manifest_hash_of(payload: dict[str, Any]) -> str:
    """Hash of the public manifest with the self-hash field emptied."""
    body = dict(payload)
    body["manifest_hash"] = None
    return sha256_bytes(canonical_json_bytes(normalize_json_value(body, NORMALIZE_FIELDS)))


def build_reproducible_manifest(
    *,
    commit: str,
    artifact_hash: str,
    inputs: dict[str, Any],
    tools: dict[str, str | None],
    env_names: list[str],
    generated_files: dict[str, str],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "commit": commit,
        "artifact_hash": artifact_hash,
        "manifest_hash": None,
        "inputs": {
            "commit": commit,
            "files": inputs.get("files") or {},
            "trees": inputs.get("trees") or {},
            "file_count": int(inputs.get("file_count") or 0),
            "tree_count": int(inputs.get("tree_count") or 0),
        },
        "tools": tools,
        "env_names": list(env_names),
        "versioned_timestamp_fields": sorted(VERSIONED_TIMESTAMP_FIELDS),
        "generated_files": generated_files,
        "generated_file_count": len(generated_files),
    }
    payload["manifest_hash"] = manifest_hash_of(payload)
    return allowlist_public_manifest(payload)


def write_json(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path


def wipe_generated_identity(root: Path) -> list[str]:
    """Remove leftover generated well-known identity so assemble cannot copy it."""
    removed: list[str] = []
    well_known = root / ".well-known"
    for name in sorted(GENERATED_WELL_KNOWN):
        path = well_known / name
        if path.is_file():
            path.unlink()
            removed.append(path.relative_to(root).as_posix())
    return removed


def emit_manifest_files(
    root: Path,
    manifest: dict[str, Any],
    *,
    public_dir_name: str = "_site",
) -> dict[str, str]:
    """Write private + public copies. Public copy is copied into `_site` too."""
    private = write_json(root / "seo" / "REPRODUCIBLE-BUILD-MANIFEST.json", manifest)
    public = write_json(root / ".well-known" / "build-manifest.json", manifest)
    site_dir = root / public_dir_name
    copied = None
    if site_dir.is_dir():
        dest = site_dir / ".well-known" / "build-manifest.json"
        copied = write_json(dest, manifest)
    return {
        "private": private.relative_to(root).as_posix(),
        "public": public.relative_to(root).as_posix(),
        "published": copied.relative_to(root).as_posix() if copied else "",
    }


def _cli_compare(args: argparse.Namespace) -> int:
    report = compare_trees(Path(args.a), Path(args.b))
    out = Path(args.out) if args.out else None
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return 0 if report.get("ok") else 1


def _cli_hash(args: argparse.Namespace) -> int:
    tree = Path(args.tree)
    report = {
        "tree": str(tree),
        "artifact_hash": content_tree_hash(tree),
        "file_count": len(file_hashes(tree)),
        "versioned_timestamp_fields": sorted(VERSIONED_TIMESTAMP_FIELDS),
    }
    sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reproducible public-artifact compare")
    sub = parser.add_subparsers(dest="cmd", required=True)
    cmp_p = sub.add_parser("compare", help="compare two publish trees")
    cmp_p.add_argument("--a", required=True, help="first tree (e.g. build A _site)")
    cmp_p.add_argument("--b", required=True, help="second tree (e.g. build B _site)")
    cmp_p.add_argument("--out", default="", help="optional JSON report path")
    hash_p = sub.add_parser("hash", help="normalized content-tree hash")
    hash_p.add_argument("--tree", required=True)
    args = parser.parse_args(argv)
    if args.cmd == "compare":
        return _cli_compare(args)
    if args.cmd == "hash":
        return _cli_hash(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
