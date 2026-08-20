"""Isolate contract-analysis tests from the developer-home rendezvous."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolate_official_rendezvous(monkeypatch, tmp_path):
    """Default tests must not see $HOME official-live-01 READY.json."""
    empty = tmp_path / "isolated-handoffs"
    empty.mkdir()
    monkeypatch.setenv("CONFENGE_HANDOFF_DIR", str(empty))
    work = tmp_path / "isolated-contract-analysis-root"
    work.mkdir()
    monkeypatch.setenv("CONFENGE_CONTRACT_ANALYSIS_ROOT", str(work))
    return empty
