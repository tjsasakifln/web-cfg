"""Admit knowledge-funnel events through the shipped FUNNEL-EVENT-DICTIONARY.

WEB-028 landed on main (`netlify/functions/lib/event-registry.json`).
This walk does not keep a parallel catalog. Family `build_event` still
emits the Market Answer payload; layer / admission come from the registry.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from scripts.knowledge_funnel.corpus import root

REGISTRY_REL = Path("netlify/functions/lib/event-registry.json")
DICTIONARY_DOC = Path("docs/contracts/FUNNEL-EVENT-DICTIONARY.md")
OBSERVED_ONLY = frozenset({"qualified_lead", "pipeline"})
PAGE_VIEW_LAYERS = frozenset({"page_view"})


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    path = root() / REGISTRY_REL
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), dict):
        raise ValueError(f"invalid event registry: {path}")
    if payload.get("source") != "CONFENGE_WEB":
        raise ValueError("event registry source is not CONFENGE_WEB")
    return payload


def registry_event(name: str) -> dict[str, Any]:
    events = load_registry()["events"]
    spec = events.get(name)
    if not isinstance(spec, dict):
        raise ValueError(f"event {name!r} is not in FUNNEL-EVENT-DICTIONARY")
    if spec.get("canonical"):
        canon = str(spec["canonical"])
        resolved = events.get(canon)
        if not isinstance(resolved, dict):
            raise ValueError(f"alias {name!r} points at missing {canon!r}")
        return {"name": canon, "alias_of": name, **resolved}
    return {"name": name, **spec}


def admit(name: str) -> dict[str, Any]:
    spec = registry_event(name)
    layer = str(spec.get("layer") or "")
    if layer in OBSERVED_ONLY:
        raise ValueError(f"{name} is observed_only ({layer}); web-cfg must not emit it")
    if spec.get("admission") == "observed_only":
        raise ValueError(f"{name} admission=observed_only; refuse")
    return spec


def layer_of(name: str) -> str:
    return str(admit(name)["layer"])


def is_lead_event(name: str) -> bool:
    return layer_of(name) == "lead"


def is_page_view_event(name: str) -> bool:
    return layer_of(name) in PAGE_VIEW_LAYERS
