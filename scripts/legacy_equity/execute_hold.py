"""Fail-closed: HOLD_TARGET_NOT_READY never enters the execute-set (#62)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "data" / "migrations" / "smartlic-url-map" / "inventory.v2.json"
EXECUTE = ROOT / "data" / "migrations" / "smartlic-url-map" / "execute-set.v2.json"


def load_inventory() -> dict[str, Any]:
    return json.loads(INVENTORY.read_text(encoding="utf-8"))


def load_execute() -> dict[str, Any]:
    return json.loads(EXECUTE.read_text(encoding="utf-8"))


def evaluate_execute_hold(
    inventory: dict[str, Any] | None = None, execute: dict[str, Any] | None = None
) -> dict[str, Any]:
    inventory = inventory or load_inventory()
    execute = execute or load_execute()
    fails: list[str] = []
    holds = {
        e.get("legacy_url")
        for e in inventory.get("entries") or []
        if e.get("action") == "HOLD_TARGET_NOT_READY"
    }
    redirects = list(execute.get("redirects") or [])
    for row in redirects:
        url = row.get("legacy_url")
        target = (row.get("target_url") or "").rstrip("/")
        if url in holds:
            fails.append(f"hold_in_execute:{url}")
        if target in {"https://confenge.com.br", "https://www.confenge.com.br"}:
            fails.append(f"blanket_home:{url}")
        if "smartlic.tech" in (row.get("target_url") or ""):
            fails.append(f"target_stays_smartlic:{url}")
    for e in inventory.get("entries") or []:
        if e.get("action") == "REDIRECT_301":
            t = (e.get("target_url") or "").rstrip("/")
            if t in {"https://confenge.com.br", "https://www.confenge.com.br"}:
                fails.append(f"inventory_home_dump:{e.get('legacy_url')}")
    return {
        "schema_version": "execute-hold-gate-v1",
        "ok": not fails,
        "fails": fails,
        "hold_count": len(holds),
        "execute_redirects": len(redirects),
    }
