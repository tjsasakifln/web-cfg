"""#91: recurring index stays blocked until the shipped flagship gate opens."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.research.flagship_gate import (  # noqa: E402
    GATE_REL,
    assert_no_recurring_index,
    load_flagship_gate,
)
from scripts.research.pack import PackError  # noqa: E402
from scripts.research.render import render_all  # noqa: E402


def test_shipped_gate_blocks_recurring_index():
    gate = load_flagship_gate(ROOT)
    assert gate["recurring_index_allowed"] is False
    assert gate["flagship_status"]
    assert_no_recurring_index(
        planned_paths=["/radar/pesquisa/edicao-zero-4uf/"], root=ROOT
    )
    with pytest.raises(PackError, match="recurring_index_blocked"):
        assert_no_recurring_index(
            planned_paths=["/radar/indice-mercado-obras-publicas/"], root=ROOT
        )
    src = (ROOT / "scripts" / "research" / "render.py").read_text(encoding="utf-8")
    assert "assert_no_recurring_index" in src
    assert (ROOT / GATE_REL).is_file()
    raw = json.loads((ROOT / GATE_REL).read_text(encoding="utf-8"))
    assert raw["recurring_index_allowed"] is False


def test_render_all_refuses_extra_index_when_gate_closed(monkeypatch):
    def boom(planned_paths=None, root=None):
        raise PackError("recurring_index_blocked:/radar/indice-mercado-obras-publicas/")

    monkeypatch.setattr(
        "scripts.research.flagship_gate.assert_no_recurring_index", boom
    )
    with pytest.raises(PackError, match="recurring_index_blocked"):
        render_all({"questions": [], "charts": [], "indexation": {"robots": "noindex"}})
