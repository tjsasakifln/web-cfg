from copy import deepcopy

import pytest

from scripts.organic.demand_graph import demand_map, validate_demand_map


def test_required_day_d_chain_and_unknown_economics_are_versioned():
    graph = demand_map()
    assert graph["schema_version"] == "organic-demand-v2"
    assert "unique utility" in graph["model"]
    assert any(row["id"] == "service-economics" and row["state"] == "UNKNOWN" for row in graph["inputs"])
    assert all(node["success_metric"] == "qualified_commercial_opportunity_created" for node in graph["nodes"])
    assert all(node["experiment"]["publication_canary_size"] == "one canonical asset or family" for node in graph["nodes"])


def test_missing_unique_utility_fails_closed():
    graph = deepcopy(demand_map())
    graph["nodes"][0]["unique_utility"] = ""
    with pytest.raises(ValueError, match="unique_utility"):
        validate_demand_map(graph)


def test_page_aggregate_points_to_existing_purchase_owner_and_not_to_a_query():
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    graph = demand_map()
    tracked = json.loads((root / "data/organic/demand-map.json").read_text())
    assert tracked == graph
    source = next(row for row in graph["inputs"] if row["id"] == "gsc-pages-2026-11-18")
    for evidence in source["purchase_route_evidence"]:
        contract = json.loads((root / evidence["contract"]).read_text())
        owner = next(row for row in contract["purchases"] if row["purchase_id"] == evidence["purchase_id"])
        assert (evidence["intent_family"], evidence["owner_path"]) == (
            owner["intent_family"], owner["primary_url"]
        )
        assert evidence["granularity"] == "page"
        assert not {"query", "queries", "search_volume"} & evidence.keys()
