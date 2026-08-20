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


def named_target(row: dict[str, Any], *, package_version: str, owner: str, source: str) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "audience_type": row.get("audience_type"),
        "angle": row.get("angle"),
        "asset_version": package_version,
        "citation_link_requirements": row.get("citation_link_requirements")
        or (
            "Preserve the CONFENGE canonical source, method/as_of, n/missingness and limitations. "
            "Do not convert the integral nominal ticket into custo/km. Do not claim a national statistic."
        ),
        "owner": row.get("owner") or owner,
        "status": row.get("status") or "PREPARED_NOT_SENT",
        "outcome": "UNKNOWN",
        "target_nominal": row.get("target_nominal") or row.get("organization"),
        "organization": row.get("organization"),
        "public_url": row.get("public_url"),
        "person_role": row.get("person_role"),
        "why_useful": row.get("why_useful"),
        "contact_route": row.get("contact_route"),
        "asset_link": row.get("asset_link") or source,
        "sent": False,
        "auto_send": False,
    }


def build_manifest(asset: dict[str, Any], *, package_version: str) -> dict[str, Any]:
    owner = asset.get("owner") or "Tiago Sasaki"
    source = asset.get("canonical_source") or asset.get("public_canonical")
    named = asset.get("syndication_targets")
    if named:
        if not isinstance(named, list) or len(named) != SYNDICATION_TARGET_COUNT:
            raise SchemaError(f"syndication_requires_{SYNDICATION_TARGET_COUNT}_targets")
        targets = [
            named_target(row, package_version=package_version, owner=owner, source=source)
            for row in named
        ]
    else:
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
    if manifest.get("sent") is True or manifest.get("smtp_called") is True or manifest.get("webhook_called") is True:
        raise SchemaError("syndication_must_remain_unsent")
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
