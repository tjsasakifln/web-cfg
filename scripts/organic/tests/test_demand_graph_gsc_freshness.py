"""MEDICAO-11 (c): the demand graph must read the GSC input's as_of from the
file it points at and re-evaluate freshness on read, instead of hard-coding
metadata that drifts (2026-07-30 declared vs 2026-08-15 in the file)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from scripts.organic import demand_graph

ROOT = Path(__file__).resolve().parents[3]


def _gsc_input(graph=None):
    rows = (graph or demand_graph.demand_map())["inputs"]
    return next(row for row in rows if row["id"] == "gsc-current")


def test_gsc_input_as_of_comes_from_the_pointed_file():
    row = _gsc_input()
    payload = json.loads((ROOT / row["path"]).read_text(encoding="utf-8"))
    assert row["as_of"] == payload["as_of"], "declared as_of drifted from the file"


def test_gsc_input_freshness_is_reevaluated_on_read():
    stale = demand_graph.gsc_input_freshness(now=date(2026, 9, 19))
    assert stale["status"] == "STALE"
    assert stale["lag_days"] == 35
    assert stale["max_as_of_lag_days"] == 14
    assert stale["ready_for_product_decisions_declared"] is True
    assert stale["usable_for_decisions"] is False

    current = demand_graph.gsc_input_freshness(now=date(2026, 8, 20))
    assert current["status"] == "CURRENT"
    assert current["usable_for_decisions"] is True


def test_missing_gsc_file_is_unknown_not_zero(tmp_path):
    missing = demand_graph.gsc_input_freshness(now=date(2026, 9, 19), path=tmp_path / "nope.json")
    assert missing["status"] == "UNKNOWN"
    assert missing["as_of"] is None
    assert missing["usable_for_decisions"] is False


def test_demand_map_carries_the_freshness_policy_but_no_evaluation_date():
    """The tracked artifact is hashed by the buyer decision map: a field that
    changes with the calendar (evaluated_on, lag_days, status) would make every
    regeneration drift (site-ci 2026-09-20 reproved source_contract_hash_drift)."""
    row = _gsc_input(demand_graph.demand_map(now=date(2026, 9, 19)))
    assert row["freshness"]["max_as_of_lag_days"] == 14
    assert row["freshness"]["evaluated"] == "on_read"
    for key in demand_graph.FRESHNESS_EVALUATED_FIELDS:
        assert key not in row["freshness"], key
    assert demand_graph.demand_map(now=date(2026, 9, 19)) == demand_graph.demand_map(now=date(2026, 12, 1))
