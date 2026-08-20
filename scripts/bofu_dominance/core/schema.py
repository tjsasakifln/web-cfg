"""Validate registry, census and status documents."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import (
    CENSUS_SCHEMA,
    MAX_CENSUS_QUERIES,
    REQUIRED_EVIDENCE_FIELDS,
    REQUIRED_FAMILY_FIELDS,
    SCHEMA,
    STATES,
)


class RegistryError(ValueError):
    """Invalid BOFU registry or census payload."""


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RegistryError(f"{label} must be an object")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise RegistryError(f"{label} must be a list")
    return value


def validate_registry(doc: dict[str, Any]) -> dict[str, Any]:
    require_mapping(doc, "registry")
    if doc.get("schema") != SCHEMA:
        raise RegistryError(f"registry.schema must be {SCHEMA}")
    families = require_list(doc.get("families"), "families")
    if not families:
        raise RegistryError("registry.families must not be empty")
    seen: set[str] = set()
    for family in families:
        validate_family(family)
        fid = family["id"]
        if fid in seen:
            raise RegistryError(f"duplicate family id: {fid}")
        seen.add(fid)
    return doc


def validate_family(family: Any) -> dict[str, Any]:
    family = require_mapping(family, "family")
    missing = [key for key in REQUIRED_FAMILY_FIELDS if key not in family]
    if missing:
        raise RegistryError(f"family missing fields {missing}")
    fid = family["id"]
    if not isinstance(fid, str) or not fid:
        raise RegistryError("family.id must be a non-empty string")
    queries = require_list(family.get("primary_queries"), f"{fid}.primary_queries")
    if not queries:
        raise RegistryError(f"{fid}.primary_queries must not be empty")
    require_list(family.get("negative_queries"), f"{fid}.negative_queries")
    owner = require_mapping(family.get("canonical_owner"), f"{fid}.canonical_owner")
    if "path" not in owner:
        raise RegistryError(f"{fid}.canonical_owner.path is required (may be null)")
    overlap = require_list(family.get("overlap"), f"{fid}.overlap")
    for rule in overlap:
        require_mapping(rule, f"{fid}.overlap[]")
        if "other_family" not in rule or "rule" not in rule:
            raise RegistryError(f"{fid}.overlap entries need other_family and rule")
    for key in ("next_test", "kill", "consolidate", "job", "decision"):
        if not str(family.get(key) or "").strip():
            raise RegistryError(f"{fid}.{key} must be non-empty")
    return family


def validate_census(doc: dict[str, Any], family_ids: set[str]) -> dict[str, Any]:
    require_mapping(doc, "census")
    if doc.get("schema") != CENSUS_SCHEMA:
        raise RegistryError(f"census.schema must be {CENSUS_SCHEMA}")
    observations = require_list(doc.get("observations"), "census.observations")
    counts: dict[str, int] = {}
    for row in observations:
        row = require_mapping(row, "census.observation")
        fid = row.get("family_id")
        if fid not in family_ids:
            raise RegistryError(f"census family_id not in registry: {fid}")
        for key in ("query", "source", "ranking_context", "organic", "local_pack", "paid", "serp_features"):
            if key not in row:
                raise RegistryError(f"census observation missing {key}")
        if row.get("official_position") not in (None,):
            raise RegistryError("census must not claim official_position from this collector")
        require_list(row.get("organic"), "organic")
        for bucket in ("local_pack", "paid", "serp_features"):
            require_mapping(row.get(bucket), bucket)
            if row[bucket].get("status") not in {"UNKNOWN", "ABSENT", "PRESENT"}:
                raise RegistryError(f"{bucket}.status must be UNKNOWN|ABSENT|PRESENT")
        counts[fid] = counts.get(fid, 0) + 1
        if counts[fid] > MAX_CENSUS_QUERIES:
            raise RegistryError(f"{fid} exceeds {MAX_CENSUS_QUERIES} census queries")
    return doc


def validate_evidence(evidence: Any, label: str) -> dict[str, Any]:
    evidence = require_mapping(evidence, label)
    missing = [key for key in REQUIRED_EVIDENCE_FIELDS if key not in evidence]
    if missing:
        raise RegistryError(f"{label} missing {missing}")
    return evidence


def validate_state(state: str) -> str:
    if state not in STATES:
        raise RegistryError(f"unknown state {state}")
    return state
