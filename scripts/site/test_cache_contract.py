#!/usr/bin/env python3
"""Verify public cache rules cannot freeze mutable assets or asset 404s."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / "_headers"
HASHED_NAME = re.compile(r"-[0-9a-f]{8,}\.[A-Za-z0-9]+$")


def rules() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    current: str | None = None
    for raw in HEADERS.read_text(encoding="utf-8").splitlines():
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


def main() -> int:
    parsed = rules()
    errors: list[str] = []
    fallback = parsed.get("/assets/*", {}).get("cache-control", "")
    fallback_age = max_age(fallback)
    if not fallback:
        errors.append("/assets/* Cache-Control rule is missing")
    if "immutable" in fallback.lower():
        errors.append("/assets/* must not make mutable assets or 404s immutable")
    if fallback_age is None or fallback_age > 86400:
        errors.append("/assets/* fallback max-age must be at most one day")
    if "must-revalidate" not in fallback.lower():
        errors.append("/assets/* fallback must revalidate")

    exact_immutable: set[str] = set()
    for route, headers in parsed.items():
        cache = headers.get("cache-control", "")
        if not route.startswith("/assets/") or "immutable" not in cache.lower():
            continue
        exact_immutable.add(route)
        if "*" in route or not HASHED_NAME.search(route):
            errors.append(f"immutable rule is not exact/content-addressed: {route}")
        if not (ROOT / route.lstrip("/")).is_file():
            errors.append(f"immutable asset does not exist: {route}")
        if max_age(cache) != 31536000:
            errors.append(f"immutable asset must use one-year max-age: {route}")

    hashed_assets = {
        "/" + path.relative_to(ROOT).as_posix()
        for path in (ROOT / "assets").rglob("*")
        if path.is_file() and HASHED_NAME.search(path.name)
    }
    missing_rules = hashed_assets - exact_immutable
    stale_rules = exact_immutable - hashed_assets
    if missing_rules:
        errors.append(f"fingerprinted assets missing immutable rules: {sorted(missing_rules)}")
    if stale_rules:
        errors.append(f"immutable rules without fingerprinted assets: {sorted(stale_rules)}")

    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print(
        "CACHE_CONTRACT_OK "
        f"fallback_max_age={fallback_age} immutable_assets={len(exact_immutable)} "
        "missing_asset_policy=revalidate"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
