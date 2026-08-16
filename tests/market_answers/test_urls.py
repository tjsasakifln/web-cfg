"""No combinatorial URL set is generated."""

from __future__ import annotations

from scripts.market_answers.urls import (
    ALLOWED_STRATA,
    combinatorial_paths,
    drilldown_model,
    stratum_href,
)
from tests.market_answers.helpers import load_shipped_fixture


def test_generated_paths_are_a_singleton():
    assert combinatorial_paths() == ["/inteligencia/valor-tipico-contratos-pavimentacao/"]
    model = drilldown_model(load_shipped_fixture())
    assert model["generated_paths"] == ["/inteligencia/valor-tipico-contratos-pavimentacao/"]
    assert model["forbids_combinatorial_urls"] is True
    assert model["levels"] == [
        "mercado",
        "estrato_permitido",
        "contratos_evidence",
        "analysis",
        "xray_cta",
    ]
    # Allowed extra filters stay on the same path as query string.
    for item in ALLOWED_STRATA:
        href = stratum_href(item["id"])
        assert href.startswith("/inteligencia/valor-tipico-contratos-pavimentacao/")
        if item["filter"]:
            assert href.startswith("/inteligencia/valor-tipico-contratos-pavimentacao/?")
            assert "/sc/" not in href
            assert "/rs/" not in href
            assert "municipio" not in href
