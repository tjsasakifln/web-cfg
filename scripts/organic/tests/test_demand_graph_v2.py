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
