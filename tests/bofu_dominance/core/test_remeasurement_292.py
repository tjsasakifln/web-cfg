from collections import Counter, defaultdict
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "seo" / "gsc-2026-08-24"
REMEASUREMENT = ROOT / "data" / "bofu-dominance" / "remeasurements" / "2026-08-24"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_gsc_export_is_versioned_live_redacted_and_hash_bound():
    meta = load(SNAPSHOT / "meta.json")
    payload_path = SNAPSHOT / "search-analytics-redacted.json"
    payload = load(payload_path)
    rows = payload["queries"]

    assert meta["source"] == payload["source"] == "search_analytics_api"
    assert meta["synthetic"] is payload["synthetic"] is False
    assert meta["query_text_redacted"] is True
    assert meta["raw_query_rows_in_git"] is False
    assert meta["official_position_claimed"] is False
    assert payload["query_text_redacted"] is True
    assert payload["raw_query_rows_in_git"] is False
    assert hashlib.sha256(payload_path.read_bytes()).hexdigest() == meta["artifact_sha256"]

    aggregate = payload["git_safe_aggregate"]
    manifest = payload["manifest"]
    assert (
        meta["rows"]
        == payload["query_count"]
        == aggregate["row_count"]
        == len(rows)
        == 75
    )
    assert payload["page_count"] == len(payload["pages"]) == 0
    assert (
        meta["provider_max_date"]
        == payload["max_date"]
        == max(row["date"] for row in rows)
    )
    assert aggregate["impressions"] == sum(row["impressions"] for row in rows)
    assert aggregate["clicks"] == sum(row["clicks"] for row in rows)
    assert aggregate["branded_rows"] == sum(row["brand_class"] == "brand" for row in rows)
    assert aggregate["legacy_brand_rows"] == sum(
        row["brand_class"] == "legacy_brand" for row in rows
    )
    assert aggregate["nonbrand_rows"] == sum(
        row["brand_class"] == "non_brand" for row in rows
    )

    manifest_rows = [
        {
            key: row[key]
            for key in ("date", "page", "country", "device", "impressions", "clicks")
        }
        for row in rows
    ]
    manifest_blob = json.dumps(
        manifest_rows, ensure_ascii=False, sort_keys=True, default=str
    ).encode("utf-8")
    assert manifest["content_sha256"] == hashlib.sha256(manifest_blob).hexdigest()
    assert manifest["row_count"] == len(rows)
    assert manifest["max_date"] == payload["max_date"]


def test_gsc_export_contains_only_git_safe_query_rows_on_confenge_surface():
    payload = load(SNAPSHOT / "search-analytics-redacted.json")
    row_keys = {
        "date",
        "query_hash",
        "page",
        "country",
        "device",
        "impressions",
        "clicks",
        "ctr",
        "position",
        "brand_class",
        "brand_class_version",
    }
    assert all("query" not in item for item in payload["queries"])

    for row in payload["queries"]:
        assert set(row) == row_keys
        assert re.fullmatch(r"sha256:[0-9a-f]{16}", row["query_hash"])
        parsed = urlsplit(row["page"])
        assert parsed.scheme in {"http", "https"}
        assert parsed.hostname == "confenge.com.br"
        assert parsed.username is None and parsed.password is None
        assert not parsed.query and not parsed.fragment
        assert row["clicks"] <= row["impressions"]
        assert 0 <= row["ctr"] <= 1
        assert row["position"] > 0


def test_gsc_freshness_anchor_is_property_local_and_derived():
    meta = load(SNAPSHOT / "meta.json")
    payload = load(SNAPSHOT / "search-analytics-redacted.json")
    decision = load(REMEASUREMENT / "decision.json")
    pulled_at = datetime.fromisoformat(meta["pulled_at"])
    property_date = pulled_at.astimezone(ZoneInfo(meta["property_timezone"])).date()
    provider_date = date.fromisoformat(meta["provider_max_date"])
    requested_end = date.fromisoformat(payload["end"])

    assert meta["property_timezone"] == payload["timezone"] == "America/Sao_Paulo"
    assert (
        meta["property_date_at_pull"] == property_date.isoformat() == "2026-08-23"
    )
    assert (
        meta["provider_age_days_at_pull"]
        == (property_date - provider_date).days
        == 5
    )
    assert (
        meta["provider_lag_days_to_requested_end"]
        == (requested_end - provider_date).days
        == 2
    )
    assert meta["as_of"] == payload["as_of"] == payload["end"]
    assert decision["gsc"]["property_date_at_pull"] == meta["property_date_at_pull"]
    assert decision["gsc"]["provider_age_days_at_pull"] == meta["provider_age_days_at_pull"]
    assert decision["gsc"]["provider_max_date"] == meta["provider_max_date"]


def test_serp_sentinel_covers_every_core_family_without_rank_claim():
    sentinel = load(REMEASUREMENT / "serp-sentinel.json")
    historical = load(ROOT / "data" / "bofu-dominance" / "core" / "serp-census.v1.json")
    rows = sentinel["rows"]
    historical_by_family = defaultdict(list)
    for row in historical["observations"]:
        historical_by_family[row["family_id"]].append(row)

    assert sentinel["official_position_claimed"] is False
    assert sentinel["source"] == historical["collector"] == "web_search_api"
    assert {row["family_id"] for row in rows} == {
        row["family_id"] for row in historical["observations"]
    }
    assert len(rows) == len({row["family_id"] for row in rows})
    for row in rows:
        family_history = historical_by_family[row["family_id"]]
        assert len(family_history) > 1
        assert sum(item["query"] == row["query"] for item in family_history) == 1
        assert row["historical_confenge_observed"] is any(
            item["confenge_observed"] for item in family_history
        )
        assert row["confenge_observed"] is bool(row["confenge_urls"])
        assert row["comparison_state"] == "AMOSTRA_INSUFICIENTE"
        assert row["query"].strip()
        assert urlsplit(row["sample_url"]).scheme in {"http", "https"}
        assert all(
            urlsplit(url).hostname == "confenge.com.br"
            for url in row["confenge_urls"]
        )


def test_product_decision_stays_closed_until_like_for_like_serp_exists():
    decision = load(REMEASUREMENT / "decision.json")
    sentinel = load(REMEASUREMENT / "serp-sentinel.json")
    matrix = load(ROOT / "data" / "organic" / "bofu-intent-matrix.json")
    state_counts = Counter(row["comparison_state"] for row in sentinel["rows"])

    assert decision["core_ready_for_product_decisions"] is False
    assert decision["core_ready_owner"] == "web-cfg#292"
    assert decision["serp"]["official_position_claimed"] is False
    assert decision["serp"]["families"] == len(sentinel["rows"])
    assert decision["serp"]["comparison_states"] == {
        state: state_counts[state]
        for state in ("MUDOU", "NAO_MUDOU", "AMOSTRA_INSUFICIENTE")
    }
    assert matrix["as_of"] == decision["as_of"]
    assert (
        matrix["core_ready_for_product_decisions"]
        is decision["core_ready_for_product_decisions"]
    )
    assert decision["unmet_conditions"]
    assert any(
        "html_mutation_authorized=false" in item
        for item in decision["plan_b_if_unmet_on_2026_09_16"]
    )
