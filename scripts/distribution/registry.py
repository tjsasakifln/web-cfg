"""Load and validate a versioned per-asset earned-distribution registry."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from scripts.distribution.schema import (
    INHERITED_TYPE_TO_CLASS,
    SCHEMA_ID,
    SchemaError,
    require_auto_send_false,
    validate_target_row,
)

DEFAULT_ASSET_ID = "radar-nacional-obras-publicas"
DEFAULT_REGISTRY_REL = Path("data/distribution/assets") / f"{DEFAULT_ASSET_ID}.v1.json"
INHERITED_KIT_REL = Path("data/distribution/radar-outreach-kit.json")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def registry_path_for(asset_id: str | None = None, root: Path | None = None) -> Path:
    root = root or repo_root()
    aid = asset_id or DEFAULT_ASSET_ID
    return root / "data" / "distribution" / "assets" / f"{aid}.v1.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_registry(registry: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(registry, dict):
        raise SchemaError("registry_must_be_object")
    if registry.get("schema") != SCHEMA_ID:
        raise SchemaError(f"unexpected_schema:{registry.get('schema')}")
    require_auto_send_false(registry)
    asset = registry.get("asset")
    if not isinstance(asset, dict) or not asset.get("id"):
        raise SchemaError("asset_required")
    targets = registry.get("targets")
    if not isinstance(targets, list):
        raise SchemaError("targets_must_be_list")
    for row in targets:
        validate_target_row(row)
    return registry


def load_registry(path: Path | None = None, *, root: Path | None = None) -> dict[str, Any]:
    target = path or registry_path_for(root=root)
    return validate_registry(load_json(target))


def load_inherited_kit(root: Path | None = None) -> dict[str, Any]:
    path = (root or repo_root()) / INHERITED_KIT_REL
    kit = load_json(path)
    if kit.get("auto_send") is not False:
        raise SchemaError("inherited_kit_auto_send_must_be_false")
    return kit


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _same_org(contact: dict[str, Any], target: dict[str, Any]) -> bool:
    contact_url = str(contact.get("url") or "")
    target_url = str(target.get("public_url") or "")
    if contact_url and target_url and _host(contact_url) == _host(target_url):
        if _host(contact_url) not in {"", "linkedin.com", "www.linkedin.com"}:
            return True
    contact_name = str(contact.get("name") or "").strip().lower()
    nominal = str(target.get("target_nominal") or "").strip().lower()
    return bool(nominal) and contact_name == nominal


def map_inherited_contact(
    contact: dict[str, Any], registry: dict[str, Any]
) -> dict[str, Any]:
    """Reuse the PR #25 kit without cloning it as a second farm."""
    raw_type = str(contact.get("type") or "")
    target_class = INHERITED_TYPE_TO_CLASS.get(raw_type)
    matched = None
    for row in registry.get("targets") or []:
        if row.get("fit") is True and _same_org(contact, row):
            matched = row
            break
    return {
        "inherited_id": contact.get("id"),
        "inherited_name": contact.get("name"),
        "inherited_type": raw_type,
        "target_class": target_class,
        "matched_registry_id": None if matched is None else matched.get("id"),
        "fit": bool(matched),
        "action": "eligible" if matched else "do-not-contact",
        "reason": (
            "mapped_to_fit_registry_row"
            if matched
            else "inherited_row_not_in_fit_registry"
        ),
    }
