"""Overlap and cannibalization rules for BOFU families."""

from __future__ import annotations

from typing import Any


def overlap_conflicts(families: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ids = {str(item["id"]) for item in families}
    conflicts: list[dict[str, Any]] = []
    for family in families:
        for rule in family.get("overlap") or []:
            other = str(rule.get("other_family") or "")
            if other.startswith("issue-") or other.startswith("pr-") or other.startswith("external:"):
                continue
            if other and other not in ids:
                conflicts.append(
                    {
                        "family": family["id"],
                        "other_family": other,
                        "rule": rule.get("rule"),
                        "reason": "unknown_other_family",
                    }
                )
    return conflicts


def shared_primary_queries(families: list[dict[str, Any]]) -> list[dict[str, Any]]:
    owners: dict[str, list[str]] = {}
    for family in families:
        for query in family.get("primary_queries") or []:
            key = str(query).strip().lower()
            owners.setdefault(key, []).append(family["id"])
    collisions: list[dict[str, Any]] = []
    by_id = {item["id"]: item for item in families}
    for query, ids in owners.items():
        unique = sorted(set(ids))
        if len(unique) < 2:
            continue
        for left in unique:
            declared = {str(rule.get("other_family")) for rule in (by_id[left].get("overlap") or [])}
            missing = [right for right in unique if right != left and right not in declared]
            if missing:
                collisions.append(
                    {
                        "query": query,
                        "families": unique,
                        "missing_overlap_from": left,
                        "missing_others": missing,
                    }
                )
    return collisions
