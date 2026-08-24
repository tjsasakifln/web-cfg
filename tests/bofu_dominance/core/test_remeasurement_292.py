import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "seo" / "gsc-2026-08-24"
REMEASUREMENT = ROOT / "data" / "bofu-dominance" / "remeasurements" / "2026-08-24"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_gsc_export_is_versioned_live_redacted_and_hash_bound():
    meta = load(SNAPSHOT / "meta.json")
    payload = SNAPSHOT / "search-analytics-redacted.json"
    assert meta["source"] == "search_analytics_api"
    assert meta["synthetic"] is False
    assert meta["query_text_redacted"] is True
    assert meta["raw_query_rows_in_git"] is False
    assert meta["official_position_claimed"] is False
    assert meta["rows"] > 0
    assert hashlib.sha256(payload.read_bytes()).hexdigest() == meta["artifact_sha256"]


def test_serp_sentinel_covers_every_core_family_without_rank_claim():
    sentinel = load(REMEASUREMENT / "serp-sentinel.json")
    historical = load(ROOT / "data" / "bofu-dominance" / "core" / "serp-census.v1.json")
    rows = sentinel["rows"]
    assert sentinel["official_position_claimed"] is False
    assert {row["family_id"] for row in rows} == {
        row["family_id"] for row in historical["observations"]
    }
    assert len(rows) == len({row["family_id"] for row in rows})
    assert all(row["comparison_state"] in {"MUDOU", "NAO_MUDOU", "AMOSTRA_INSUFICIENTE"} for row in rows)
    assert all(row["comparison_state"] == "AMOSTRA_INSUFICIENTE" for row in rows)


def test_product_decision_stays_closed_until_like_for_like_serp_exists():
    decision = load(REMEASUREMENT / "decision.json")
    assert decision["core_ready_for_product_decisions"] is False
    assert decision["core_ready_owner"] == "web-cfg#292"
    assert decision["serp"]["official_position_claimed"] is False
    assert decision["serp"]["comparison_states"] == {
        "MUDOU": 0,
        "NAO_MUDOU": 0,
        "AMOSTRA_INSUFICIENTE": 11,
    }
    assert decision["unmet_conditions"]
    assert any("html_mutation_authorized=false" in item for item in decision["plan_b_if_unmet_on_2026_09_16"])
