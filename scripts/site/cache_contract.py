"""Pure cache-header contract for hashed assets, HTML, identity JSON and fallbacks."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

HASHED_DASH = re.compile(r"-[0-9a-f]{8,}\.[A-Za-z0-9]+$")
HASHED_DOT = re.compile(r"\.[0-9a-f]{8,}\.(?:css|js)$")
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
REVALIDATABLE_IDENTITY = "no-cache, max-age=0, must-revalidate"


def parse_header_rules(text: str) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw.startswith((" ", "\t")):
            current = raw.strip()
            out.setdefault(current, {})
            continue
        if current and ":" in raw:
            name, value = raw.strip().split(":", 1)
            out[current][name.lower()] = value.strip()
    return out


def max_age(value: str) -> int | None:
    match = re.search(r"(?:^|,)\s*max-age=(\d+)(?:,|$)", value, re.IGNORECASE)
    return int(match.group(1)) if match else None


def is_immutable(value: str) -> bool:
    return "immutable" in value.lower()


def is_revalidatable(value: str) -> bool:
    lower = value.lower()
    if is_immutable(lower):
        return False
    age = max_age(lower)
    if age is not None and age >= 31536000:
        return False
    return "must-revalidate" in lower or "no-cache" in lower or "no-store" in lower


def is_hashed_asset_name(name: str) -> bool:
    return bool(HASHED_DASH.search(name) or HASHED_DOT.search(name))


def render_hashed_cache_block(hrefs: list[str], *, begin: str, end: str) -> str:
    lines = [begin, "# Generated for content-hashed files; do not hand-edit."]
    for href in sorted(set(hrefs)):
        lines.append(href)
        lines.append(f"  Cache-Control: {IMMUTABLE_CACHE}")
        lines.append("")
    lines.append(end)
    return "\n".join(lines) + "\n"


def upsert_hashed_cache_block(text: str, hrefs: list[str], *, begin: str, end: str) -> str:
    block = render_hashed_cache_block(hrefs, begin=begin, end=end)
    start = text.find(begin)
    if start != -1:
        stop = text.find(end, start)
        if stop == -1:
            raise ValueError(f"{begin} is unclosed")
        stop += len(end)
        while stop < len(text) and text[stop] == "\n":
            stop += 1
        return text[:start] + block + text[stop:]
    if text and not text.endswith("\n"):
        text += "\n"
    return text + ("\n" if text else "") + block


def evaluate_cache_contract(
    *,
    headers_text: str,
    hashed_source_assets: set[str],
    hashed_published_assets: set[str] | None = None,
    published_headers_text: str | None = None,
    downloadable_paths: set[str] | None = None,
) -> list[str]:
    parsed = parse_header_rules(headers_text)
    errors: list[str] = []

    global_cache = parsed.get("/*", {}).get("cache-control", "")
    if not global_cache:
        errors.append("global /* Cache-Control rule is missing")
    if is_immutable(global_cache):
        errors.append("HTML default must not be immutable")
    if not is_revalidatable(global_cache):
        errors.append("HTML default must stay revalidatable")

    identity = parsed.get("/.well-known/build-info.json", {}).get("cache-control", "")
    if not identity:
        errors.append("/.well-known/build-info.json Cache-Control rule is missing")
    elif is_immutable(identity) or not is_revalidatable(identity):
        errors.append("/.well-known/build-info.json must stay revalidatable")

    fallback = parsed.get("/assets/*", {}).get("cache-control", "")
    fallback_age = max_age(fallback)
    if not fallback:
        errors.append("/assets/* Cache-Control rule is missing")
    if is_immutable(fallback):
        errors.append("/assets/* must not make mutable assets or 404s immutable")
    if fallback_age is None or fallback_age > 86400:
        errors.append("/assets/* fallback max-age must be at most one day")
    if "must-revalidate" not in fallback.lower():
        errors.append("/assets/* fallback must revalidate")

    exact_immutable: set[str] = set()
    for route, headers in parsed.items():
        cache = headers.get("cache-control", "")
        if not is_immutable(cache):
            continue
        if route in {"/*", "/.well-known/build-info.json"} or route.endswith(".html"):
            errors.append(f"non-hashed document must not be immutable: {route}")
            continue
        if "*" in route or not is_hashed_asset_name(Path(route).name):
            errors.append(f"immutable rule is not exact/content-addressed: {route}")
            continue
        exact_immutable.add(route)
        if max_age(cache) != 31536000:
            errors.append(f"immutable asset must use one-year max-age: {route}")

    missing_rules = hashed_source_assets - exact_immutable
    stale_rules = exact_immutable - hashed_source_assets
    if hashed_published_assets is None:
        if missing_rules:
            errors.append(f"fingerprinted assets missing immutable rules: {sorted(missing_rules)}")
        if stale_rules:
            errors.append(f"immutable rules without fingerprinted assets: {sorted(stale_rules)}")
    else:
        source_stale = (exact_immutable - hashed_source_assets) - hashed_published_assets
        source_missing = hashed_source_assets - exact_immutable
        if source_missing:
            errors.append(f"fingerprinted assets missing immutable rules: {sorted(source_missing)}")
        if source_stale:
            errors.append(f"immutable rules without fingerprinted assets: {sorted(source_stale)}")

        published = parse_header_rules(published_headers_text or headers_text)
        published_immutable = {
            route
            for route, headers in published.items()
            if is_immutable(headers.get("cache-control", ""))
        }
        missing_published = hashed_published_assets - published_immutable
        if missing_published:
            errors.append(
                f"published hashed assets missing immutable rules: {sorted(missing_published)}"
            )
        for route in published_immutable:
            cache = published[route].get("cache-control", "")
            if route in {"/*", "/.well-known/build-info.json"} or route.endswith(".html"):
                errors.append(f"published non-hashed document is immutable: {route}")
            elif "*" in route or not is_hashed_asset_name(Path(route).name):
                errors.append(f"published immutable rule is not exact/content-addressed: {route}")
            elif max_age(cache) != 31536000:
                errors.append(f"published immutable asset must use one-year max-age: {route}")

    for path in sorted(downloadable_paths or ()):
        disposition = parsed.get(path, {}).get("content-disposition", "")
        if "attachment" not in disposition.lower():
            errors.append(f"downloadable file missing Content-Disposition attachment: {path}")

    return errors
