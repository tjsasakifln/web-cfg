"""Family scoring drives the shipped select_family / score_family functions."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.paid_search.evidence import read_consultas_queries
from scripts.paid_search.family import score_family, select_family
from scripts.paid_search.schema import LANDING_60, PRIMARY_METRIC, UNKNOWN


def _landing60_ok() -> dict:
    return {
        "id": LANDING_60["id"],
        "path": LANDING_60["path"],
        "canonical": LANDING_60["canonical"],
        "html_path": LANDING_60["html"],
        "exists": True,
        "indexable": True,
        "noindex": False,
        "in_sitemap": True,
        "eligible": True,
        "wrong_landing": False,
        "honesty": "test-landing",
        "issue": 60,
        "kind": "utility",
        "asset_id": LANDING_60["asset_id"],
        "route_family": LANDING_60["route_family"],
        "cta_id": LANDING_60["cta_id"],
        "jornada": LANDING_60["jornada"],
    }


def test_volume_is_not_in_score():
    family = {
        "id": "glosa_medicao",
        "label": "x",
        "cluster": "medicoes-pagamentos",
        "adjacent_to_60": True,
        "commercial_intent": "high",
        "problem_now": True,
        "first_vertical_event": True,
        "event_family": "medicao",
    }
    low = score_family(
        family,
        gsc_rows=[{"query": "glosa", "impressions": 3, "clicks": 1, "export_id": "t"}],
        landing=_landing60_ok(),
    )
    high = score_family(
        family,
        gsc_rows=[{"query": "glosa", "impressions": 9000, "clicks": 1, "export_id": "t"}],
        landing=_landing60_ok(),
    )
    assert low["score"] == high["score"]
    assert low["score_components"]["volume_in_score"] == 0
    assert high["gsc_totals"]["impressions"] == 9000


def test_score_prefers_problem_now_over_informational():
    landing = _landing60_ok()
    problem = score_family(
        {
            "id": "glosa_medicao",
            "label": "glosa",
            "cluster": "medicoes-pagamentos",
            "adjacent_to_60": True,
            "commercial_intent": "high",
            "problem_now": True,
            "first_vertical_event": True,
        },
        gsc_rows=[{"query": "glosa", "impressions": 5, "clicks": 1}],
        landing=landing,
    )
    info = score_family(
        {
            "id": "prorrogacao_prazo",
            "label": "prazo",
            "cluster": "atrasos-prorrogacao",
            "adjacent_to_60": True,
            "commercial_intent": "medium",
            "problem_now": False,
            "first_vertical_event": True,
        },
        gsc_rows=[{"query": "chuva", "impressions": 5, "clicks": 1}],
        landing=landing,
    )
    assert problem["eligible"] and info["eligible"]
    assert problem["score"] > info["score"]


def test_wrong_landing_is_ineligible_regardless_of_volume():
    landing = _landing60_ok()
    landing["wrong_landing"] = True
    landing["eligible"] = False
    scored = score_family(
        {
            "id": "sinapi_desonerado",
            "label": "sinapi",
            "cluster": "orcamento-bdi",
            "adjacent_to_60": False,
            "commercial_intent": "informational",
            "problem_now": False,
            "first_vertical_event": False,
        },
        gsc_rows=[{"query": "sinapi desonerado", "impressions": 10000, "clicks": 50}],
        landing=landing,
    )
    assert not scored["eligible"]
    assert scored["score"] == 0
    assert "wrong_landing" in scored["ineligible_reasons"]


def test_paid_demand_stays_unknown():
    scored = score_family(
        {
            "id": "glosa_medicao",
            "adjacent_to_60": True,
            "commercial_intent": "high",
            "problem_now": True,
            "first_vertical_event": True,
        },
        gsc_rows=[{"query": "glosa", "impressions": 8, "clicks": 1}],
        landing=_landing60_ok(),
    )
    assert scored["paid_demand"] == UNKNOWN
    assert scored["organic_demand"] == "observed"


def test_select_family_cites_real_gsc_and_existing_landing():
    result = select_family(ROOT)
    assert result["primary_metric"] == PRIMARY_METRIC
    assert result["demand_engine"]["authorizes_page"] is False
    assert result["decision"] in {"SELECTED", "BLOCKED"}
    known = read_consultas_queries(ROOT)
    assert known, "GSC Consultas.csv must exist"
    if result["decision"] == "BLOCKED":
        assert result.get("prerequisite")
        assert result.get("next_command")
        return
    family = result["family"]
    assert family["eligible"]
    assert family["id"]
    assert family["paid_demand"] == UNKNOWN
    cited = [row["query"] for row in family["gsc_queries"]]
    assert cited, "winner must cite at least one GSC query"
    for query in cited:
        assert query in known, query
    landing = family["landing"]
    html = ROOT / landing["html_path"]
    assert html.is_file(), landing
    assert landing["exists"] is True
    assert landing["noindex"] is False
    assert landing["path"] == LANDING_60["path"]
    assert result["icp"]["who"]
    assert result["geography"]["include"] == ["Brasil"]
    assert "desktop" in result["device"]["include"]
    assert result["schedule"]["timezone"] == "America/Sao_Paulo"
    assert result["exclusions"]["brand_as_primary"] is True
    # #84 is not an eligible paid landing on origin/main
    assert landing["id"] != "valor-tipico-contratos-pavimentacao"
