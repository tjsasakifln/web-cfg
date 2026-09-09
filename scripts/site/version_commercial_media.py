#!/usr/bin/env python3
"""Content-bind references to the reviewed commercial media in a public artifact.

The source HTML deliberately keeps stable asset paths for local development and
backward compatibility. During public artifact finalization, references receive
``?v=<sha256>`` derived from the exact JPEG bytes. The physical legacy path is
kept, so old links still resolve, while a corrected image cannot be hidden by a
browser cache entry for the earlier bytes.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MANIFEST = Path("data/site/commercial-media/source.json")
PUBLIC_MANIFEST = Path(".well-known/commercial-media-assets.json")
TEXT_SUFFIXES = frozenset(
    {".html", ".json", ".js", ".css", ".xml", ".txt", ".webmanifest", ".map"}
)
REFERENCE_SCAN_EXCLUSIONS = frozenset(
    {
        PUBLIC_MANIFEST.as_posix(),
        # This identity document contains artifact-relative file names as hash
        # keys. Those keys are not visitor-facing URLs.
        ".well-known/build-manifest.json",
    }
)
CANONICAL_ORIGIN = "https://confenge.com.br"
EXPECTED_VERSIONING = {
    "schema": "confenge.commercial-media-query-version/v1",
    "parameter": "v",
    "digest": "sha256",
    "digest_length": 64,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _confined_file(root: Path, relative: str, *, field: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ValueError(f"commercial media {field} must be a non-empty POSIX path")
    pure = PurePosixPath(relative)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError(f"commercial media {field} is not confined: {relative!r}")
    candidate = (root / pure).resolve()
    if not candidate.is_relative_to(root.resolve()) or not candidate.is_file():
        raise FileNotFoundError(f"commercial media {field} is absent: {relative}")
    return candidate


def load_commercial_media(source_root: Path = ROOT) -> list[dict[str, str]]:
    """Load and validate the single source-to-public media contract."""
    source_root = Path(source_root).resolve()
    manifest_path = source_root / SOURCE_MANIFEST
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"commercial media source manifest is unreadable: {exc}") from exc
    if not isinstance(document, dict):
        raise ValueError("commercial media source manifest must be an object")
    if document.get("public_reference_versioning") != EXPECTED_VERSIONING:
        raise ValueError("commercial media public reference versioning contract drifted")
    assets = document.get("assets")
    if not isinstance(assets, list) or not assets:
        raise ValueError("commercial media source manifest has no assets")

    normalized: list[dict[str, str]] = []
    seen_targets: set[str] = set()
    for item in assets:
        if not isinstance(item, dict):
            raise ValueError("commercial media asset entry must be an object")
        source = str(item.get("source") or "")
        target = str(item.get("target") or "")
        _confined_file(source_root, source, field="source")
        target_path = _confined_file(source_root, target, field="target")
        if not target.startswith("assets/") or target_path.suffix.lower() not in {".jpg", ".jpeg"}:
            raise ValueError(f"commercial media target must be a JPEG under assets/: {target}")
        if target in seen_targets:
            raise ValueError(f"duplicate commercial media target: {target}")
        seen_targets.add(target)
        sha256 = _sha256(target_path)
        normalized.append(
            {
                "source": source,
                "target": target,
                "sha256": sha256,
                "href": f"/{target}?v={sha256}",
            }
        )
    return normalized


def _text_files(dest: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(dest.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(dest).as_posix()
        if relative not in REFERENCE_SCAN_EXCLUSIONS:
            files.append(path)
    return files


def _reference_pattern(target: str) -> re.Pattern[str]:
    # Variants are derived from the manifest target rather than copied into four
    # unrelated expressions. Relative URLs from nested pages remain supported.
    prefix = rf"(?:{re.escape(CANONICAL_ORIGIN)}/|//confenge\.com\.br/|/|\./|(?:\.\./)+)?"
    return re.compile(
        rf"(?<![A-Za-z0-9_.%/-])(?P<base>{prefix}{re.escape(target)})"
        rf"(?P<version>\?v=[A-Za-z0-9._~-]+)?"
        rf"(?=$|[\"'<>\s),;}}\]#])"
    )


def _rewrite_text(text: str, asset: dict[str, str]) -> tuple[str, int]:
    pattern = _reference_pattern(asset["target"])
    expected = f"?v={asset['sha256']}"
    return pattern.subn(lambda match: match.group("base") + expected, text)


def _reference_files_and_count(
    dest: Path, asset: dict[str, str]
) -> tuple[list[str], int, list[str]]:
    expected = f"?v={asset['sha256']}"
    files: list[str] = []
    count = 0
    invalid: list[str] = []
    target = asset["target"]
    for path in _text_files(dest):
        text = path.read_text(encoding="utf-8", errors="strict")
        offsets = [match.start() for match in re.finditer(re.escape(target), text)]
        if not offsets:
            continue
        relative = path.relative_to(dest).as_posix()
        files.append(relative)
        count += len(offsets)
        for offset in offsets:
            following = text[offset + len(target) :]
            if not following.startswith(expected):
                invalid.append(f"{relative}:{offset}")
    return files, count, invalid


def _public_manifest_payload(
    dest: Path,
    assets: list[dict[str, str]],
    *,
    require_all_referenced: bool = True,
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for asset in assets:
        files, count, invalid = _reference_files_and_count(dest, asset)
        if invalid:
            raise ValueError(
                f"unversioned or stale commercial media reference {asset['target']}: {invalid[:8]}"
            )
        if count == 0 and require_all_referenced:
            raise ValueError(f"commercial media asset is not discoverable in artifact: {asset['target']}")
        if count == 0:
            continue
        entries.append(
            {
                "href": asset["href"],
                "sha256": asset["sha256"],
                "reference_count": count,
                "reference_files": files,
            }
        )
    return {
        "schema": "confenge.public-commercial-media-assets/v1",
        "versioning": EXPECTED_VERSIONING,
        "assets": entries,
    }


def version_commercial_media_references(
    dest: Path,
    *,
    source_root: Path = ROOT,
    require_published_assets: bool = True,
    write_public_manifest: bool = True,
) -> dict[str, Any]:
    """Rewrite only ``dest`` and bind every managed reference to target bytes."""
    dest = Path(dest).resolve()
    if not dest.is_dir():
        raise FileNotFoundError(f"public artifact is absent: {dest}")
    assets = load_commercial_media(source_root)

    if require_published_assets:
        for asset in assets:
            published = _confined_file(dest, asset["target"], field="published target")
            actual = _sha256(published)
            if actual != asset["sha256"]:
                raise ValueError(
                    f"published commercial media bytes differ from source target: {asset['target']}"
                )

    rewritten_files: set[str] = set()
    replacements = 0
    for path in _text_files(dest):
        original = path.read_text(encoding="utf-8", errors="strict")
        updated = original
        replaced_here = 0
        for asset in assets:
            updated, count = _rewrite_text(updated, asset)
            replaced_here += count
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            rewritten_files.add(path.relative_to(dest).as_posix())
        replacements += replaced_here

    # Re-scan after all rewrites; this catches target text in metadata, JSON-LD,
    # JS, XML and any newly added public text type, not only known HTML pages.
    payload = _public_manifest_payload(
        dest,
        assets,
        require_all_referenced=require_published_assets or write_public_manifest,
    )
    if write_public_manifest:
        manifest_path = dest / PUBLIC_MANIFEST
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return {
        **payload,
        "rewritten_files": sorted(rewritten_files),
        "replacement_count": replacements,
    }


def validate_commercial_media_versioning(
    dest: Path, *, source_root: Path = ROOT
) -> dict[str, Any]:
    """Validate target bytes, reference coverage and the generated public manifest."""
    dest = Path(dest).resolve()
    assets = load_commercial_media(source_root)
    for asset in assets:
        published = _confined_file(dest, asset["target"], field="published target")
        if _sha256(published) != asset["sha256"]:
            raise ValueError(
                f"published commercial media bytes differ from source target: {asset['target']}"
            )
    expected = _public_manifest_payload(dest, assets)
    manifest_path = dest / PUBLIC_MANIFEST
    try:
        actual = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"public commercial media manifest is absent or invalid: {exc}") from exc
    if actual != expected:
        raise ValueError("public commercial media manifest disagrees with artifact references or bytes")
    return actual


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("write", "check"))
    parser.add_argument("--artifact", default="_site")
    parser.add_argument("--source-root", default=str(ROOT))
    args = parser.parse_args()
    artifact = Path(args.artifact)
    source_root = Path(args.source_root)
    report = (
        version_commercial_media_references(artifact, source_root=source_root)
        if args.action == "write"
        else validate_commercial_media_versioning(artifact, source_root=source_root)
    )
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
