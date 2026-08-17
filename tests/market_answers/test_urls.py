"""No combinatorial URL set is generated."""

from __future__ import annotations

from scripts.market_answers.consume import adapt_payload, load_payload
from scripts.market_answers.urls import (
    ALLOWED_STRATA,
    allowed_strata,
    combinatorial_paths,
    drilldown_model,
    geography_ufs,
    stratum_href,
)
from tests.market_answers.helpers import load_shipped_fixture


def test_generated_paths_are_a_singleton():
    assert combinatorial_paths() == ["/inteligencia/valor-tipico-contratos-pavimentacao/"]
    fixture = load_shipped_fixture()
    model = drilldown_model(fixture)
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
    for item in allowed_strata(fixture):
        href = stratum_href(item["id"], fixture)
        assert href.startswith("/inteligencia/valor-tipico-contratos-pavimentacao/")
        if item["filter"]:
            assert href.startswith("/inteligencia/valor-tipico-contratos-pavimentacao/?")
            assert "/sc/" not in href
            assert "/rs/" not in href
            assert "municipio" not in href


def test_fixture_geography_keeps_sc_and_rs_slices():
    fixture = load_shipped_fixture()
    assert geography_ufs(fixture) == ["SC", "RS"]
    ids = [item["id"] for item in allowed_strata(fixture)]
    assert ids == ["recorte-publicado", "sc-municipal", "rs-municipal"]
    labels = [item["label"] for item in drilldown_model(fixture)["strata"]]
    assert labels[0] == "Recorte publicado (Santa Catarina e Rio Grande do Sul)"
    assert any("Rio Grande do Sul" in label for label in labels)
    # Default constant remains the two-UF fixture set, not the live path.
    assert [item["id"] for item in ALLOWED_STRATA] == ids


def test_official_sc_payload_does_not_ship_fixture_rs_strata():
    payload = load_payload()
    assert payload["official_live"] is True
    assert geography_ufs(payload) == ["SC"]
    model = drilldown_model(payload)
    ids = [item["id"] for item in model["strata"]]
    labels = " ".join(item["label"] for item in model["strata"])
    hrefs = " ".join(item["href"] for item in model["strata"])
    assert ids == ["recorte-publicado", "sc-municipal"]
    assert "rs-municipal" not in ids
    assert "Rio Grande do Sul" not in labels
    assert "SC e RS" not in labels
    assert "rs-municipal" not in hrefs
    assert model["strata"][0]["label"] == "Recorte publicado (Santa Catarina)"


def test_missing_geography_does_not_invent_ufs():
    strata = allowed_strata({})
    assert [item["id"] for item in strata] == ["recorte-publicado"]
    assert strata[0]["label"] == "Recorte publicado"


def test_raw_extra_cli_code_sc_projects_same_as_adapted():
    """Drive the shipped adapter, not a hand-built geography object."""
    payload = adapt_payload(load_payload())
    assert geography_ufs(payload) == ["SC"]
    assert [item["id"] for item in allowed_strata(payload)] == [
        "recorte-publicado",
        "sc-municipal",
    ]
