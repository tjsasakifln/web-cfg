"""Isolate market-panorama tests from the developer-home rendezvous."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolate_official_rendezvous(monkeypatch, tmp_path):
    """Default tests must not see a real $HOME READY.json."""
    empty = tmp_path / "isolated-handoffs"
    empty.mkdir()
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(empty))
    return empty
