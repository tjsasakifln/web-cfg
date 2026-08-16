"""Load the versioned discovery cohort registry."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.discovery.schema import (
    INDEX_INTENTS,
    REQUIRED_CATEGORIES,
    SCHEMA_ID,
    SchemaError,
    validate_index_intent,
)

DEFAULT_REGISTRY_REL = Path("data/discovery/cohort.v1.json")
DEFAULT_OBSERVED_REL = Path("data/discovery/observed.v1.json")
DEFAULT_ALLOWLIST_REL = Path("data/discovery/indexnow-allowlist.v1.json")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_cohort(registry: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(registry, dict):
        raise SchemaError("cohort_must_be_object")
    if registry.get("schema") != SCHEMA_ID:
        raise SchemaError(f"unexpected_schema:{registry.get('schema')}")
    assets = registry.get("assets")
    if not isinstance(assets, list) or not assets:
        raise SchemaError("assets_required")
    if not (5 <= len(assets) <= 10):
        raise SchemaError(f"cohort_size_out_of_range:{len(assets)}")
    seen_ids: set[str] = set()
    categories: set[str] = set()
    for asset in assets:
        if not isinstance(asset, dict):
            raise SchemaError("asset_must_be_object")
        aid = asset.get("id")
        if not isinstance(aid, str) or not aid.strip():
            raise SchemaError("asset_id_required")
        if aid in seen_ids:
            raise SchemaError(f"duplicate_asset_id:{aid}")
        seen_ids.add(aid)
        category = asset.get("category")
        if not isinstance(category, str) or not category.strip():
            raise SchemaError("asset_category_required")
        categories.add(category)
        validate_index_intent(asset.get("index_intent"))
        if asset.get("fixture") and asset.get("publicable") is True:
            raise SchemaError(f"fixture_cannot_be_publicable:{aid}")
        if asset.get("fixture") and asset.get("index_intent") == "INDEX":
            raise SchemaError(f"fixture_cannot_request_index:{aid}")
    missing = [c for c in REQUIRED_CATEGORIES if c not in categories]
    if missing:
        raise SchemaError("missing_required_categories:" + ",".join(missing))
    return registry


def load_cohort(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    target = path or (root / DEFAULT_REGISTRY_REL)
    return validate_cohort(load_json(target))


def load_observed(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    target = path or (root / DEFAULT_OBSERVED_REL)
    if not target.is_file():
        return {"schema": "discovery_observed_v1", "assets": {}}
    data = load_json(target)
    if not isinstance(data, dict):
        raise SchemaError("observed_must_be_object")
    return data


def load_allowlist(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    root = root or repo_root()
    target = path or (root / DEFAULT_ALLOWLIST_REL)
    data = load_json(target)
    if data.get("schema") != "indexnow_allowlist_v1":
        raise SchemaError(f"unexpected_allowlist_schema:{data.get('schema')}")
    urls = data.get("urls")
    if not isinstance(urls, list):
        raise SchemaError("allowlist_urls_must_be_list")
    return data


def asset_by_id(registry: dict[str, Any], asset_id: str) -> dict[str, Any]:
    for asset in registry.get("assets") or []:
        if asset.get("id") == asset_id:
            return asset
    raise SchemaError(f"unknown_asset:{asset_id}")


def publicable_assets(registry: dict[str, Any]) -> list[dict[str, Any]]:
    """Assets that may enter a publicable / IndexNow candidate set."""
    out: list[dict[str, Any]] = []
    for asset in registry.get("assets") or []:
        if asset.get("fixture"):
            continue
        if asset.get("index_intent") not in INDEX_INTENTS:
            continue
        if asset.get("index_intent") == "DO_NOT_INDEX":
            continue
        if asset.get("noindex") is True:
            continue
        if asset.get("publicable") is False:
            continue
        out.append(asset)
    return out
