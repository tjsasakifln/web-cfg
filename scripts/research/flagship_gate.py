"""Refuse extra flagship-like index pages until the flagship gate opens (#91)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from scripts.research.pack import PackError

GATE_REL = Path("data/editorial/flagship-gate.v1.json")
EXISTING_FLAGSHIP = ("/radar/pesquisa/edicao-zero-4uf/",)


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_flagship_gate(root: Path | None = None) -> dict[str, Any]:
    path = (root or _root()) / GATE_REL
    return json.loads(path.read_text(encoding="utf-8"))


def assert_no_recurring_index(
    planned_paths: Iterable[str] | None = None,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    """Fail closed when a builder would emit extra index pages while the flag is false."""
    gate = load_flagship_gate(root)
    allowed = set(EXISTING_FLAGSHIP)
    allowed.add(str(gate.get("flagship_path") or ""))
    if gate.get("recurring_index_allowed") is True:
        return gate
    extras = []
    for raw in planned_paths or ():
        path = raw if str(raw).startswith("/") else f"/{raw}"
        if not path.endswith("/"):
            path += "/"
        if path not in allowed:
            extras.append(path)
    if extras:
        raise PackError("recurring_index_blocked:" + ",".join(extras))
    return gate
