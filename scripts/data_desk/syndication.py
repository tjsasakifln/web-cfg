"""Five later-nameable syndication targets. auto_send=false. Nothing is sent."""

from __future__ import annotations

from typing import Any

from scripts.data_desk.schema import (
    SYNDICATION_SCHEMA,
    SYNDICATION_STATUSES,
    SYNDICATION_TARGET_COUNT,
    SchemaError,
)

REQUIRED_TARGET_FIELDS = (
    "id",
    "audience_type",
    "angle",
    "asset_version",
    "citation_link_requirements",
    "owner",
    "status",
    "outcome",
)


def empty_target(index: int, *, asset_version: str, owner: str) -> dict[str, Any]:
    return {
        "id": f"target-{index}",
        "audience_type": "UNNAMED",
        "angle": "UNNAMED",
        "asset_version": asset_version,
        "citation_link_requirements": (
            "Preserve CONFENGE permalink or canonical, method/as_of, and limitations. "
            "Do not present the fixture as a public statistic."
        ),
        "owner": owner,
        "status": "PREPARED",
        "outcome": "UNKNOWN",
        "target_nominal": None,
    }


def build_manifest(asset: dict[str, Any], *, package_version: str) -> dict[str, Any]:
    owner = asset.get("owner") or "Tiago Sasaki"
    targets = [
        empty_target(i, asset_version=package_version, owner=owner)
        for i in range(1, SYNDICATION_TARGET_COUNT + 1)
    ]
    manifest = {
        "schema": SYNDICATION_SCHEMA,
        "auto_send": False,
        "sent": False,
        "smtp_called": False,
        "webhook_called": False,
        "asset_id": asset.get("id"),
        "watermark": asset.get("watermark") or asset.get("label"),
        "external_distribution": False,
        "targets": targets,
    }
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    if manifest.get("auto_send") is not False:
        raise SchemaError("auto_send_must_be_false")
    targets = manifest.get("targets")
    if not isinstance(targets, list) or len(targets) != SYNDICATION_TARGET_COUNT:
        raise SchemaError(f"syndication_requires_{SYNDICATION_TARGET_COUNT}_targets")
    for row in targets:
        missing = [field for field in REQUIRED_TARGET_FIELDS if field not in row]
        if missing:
            raise SchemaError("missing_syndication_fields:" + ",".join(missing))
        if row.get("status") not in SYNDICATION_STATUSES:
            raise SchemaError(f"invalid_syndication_status:{row.get('status')}")
    return manifest
