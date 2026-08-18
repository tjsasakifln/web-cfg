"""Drive the shipped state classifier: publication ≠ index/discovery."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.gsc_import import import_gsc_file
from scripts.discovery.http_client import FakeTransport, ProbeResponse
from scripts.discovery.observation import (
    REASON_GSC_NOT_PROVIDED,
    REASON_HTTP_5XX,
    REASON_HTTP_TIMEOUT,
    REASON_HTTP_UNAVAILABLE,
    build_observation,
)
from scripts.discovery.operations import operations_for_asset
from scripts.discovery.referral_import import import_referral_file
from scripts.discovery.registry import load_cohort
from scripts.discovery.report import build_report, format_report
from scripts.discovery.states import (
    BLOCKED,
    FALSE,
    REASON_GSC_BLOCKED,
    REASON_HTTP_4XX,
    REASON_PUBLICATION_IS_NOT_INDEX,
    REASON_SITE_OPERATOR_WEAK,
    STATE_NAMES,
    TRUE,
    UNKNOWN,
    classify_states,
    state_values,
)
from scripts.discovery.store import append_observation
from tests.discovery.test_probe import ASSET, CANONICAL, baseline_transport, run_probe

FIXTURES = ROOT / "tests" / "discovery" / "fixtures"
ASSET_ID = "valor-tipico-contratos-pavimentacao"
AS_OF = "2026-08-17T18:25:58Z"


def _ok(method: str, url: str, body: bytes = b"", status: int = 200) -> ProbeResponse:
    return ProbeResponse(method=method, url=url, status=status, headers={}, body=body)


def _canary_asset() -> dict:
    return next(item for item in load_cohort(root=ROOT)["assets"] if item["id"] == ASSET_ID)


def _index_state_row(*, verdict: str) -> dict:
    return build_observation(
        asset_id=ASSET_ID,
        observation_type="gsc",
        observed_at=AS_OF,
        source="gsc_export",
        status="observed",
        reason_codes=[],
        dimensions={
            "page": CANONICAL,
            "index_state": verdict,
            "fact_key": f"index-state-{verdict}",
            "row_hash": f"index-state-{verdict}",
        },
        metrics={"impressions": None, "clicks": None, "index_state": verdict},
    )


def test_http_200_robots_sitemap_is_not_indexed_or_discovered():
    probe = run_probe(baseline_transport())
    assert probe["http"]["status"] == 200
    assert probe["robots"]["blocked"] is False
    assert probe["sitemap"]["present"] is True
    assert probe["indexability"]["state"] == "indexable"
    ops = operations_for_asset(ASSET, [probe])
    values = state_values(ops["states"])
    assert values["HTTP_OK"] == TRUE
    assert values["CRAWL_ALLOWED"] == TRUE
    assert values["SITEMAP_LISTED"] == TRUE
    assert values["CANONICAL_VALID"] == TRUE
    assert values["DISCOVERED"] == UNKNOWN
    assert values["INDEXED"] == UNKNOWN
    assert values["IMPRESSION"] == UNKNOWN
    assert values["CLICK"] == UNKNOWN
    assert values["LEAD"] == UNKNOWN
    assert values["REVENUE"] == UNKNOWN
    assert ops["states"]["INDEXED"]["reason"] == REASON_PUBLICATION_IS_NOT_INDEX
    assert ops["states"]["DISCOVERED"]["reason"] == REASON_GSC_NOT_PROVIDED
    assert ops["discovery_status"] == "DISCOVERY_UNKNOWN"


def test_site_operator_is_weak_and_never_indexed():
    probe = run_probe(baseline_transport())
    site = {
        "asset_id": ASSET_ID,
        "source": "site_operator",
        "dimensions": {"signal": "site:", "query": f"site:{CANONICAL}"},
        "status": "observed",
    }
    states = classify_states(
        asset=ASSET,
        probe=probe,
        extra_rows=[site],
        gsc_access="not_provided",
    )
    assert states["INDEXED"]["value"] == UNKNOWN
    assert states["INDEXED"]["strength"] == "weak"
    assert states["INDEXED"]["reason"] == REASON_SITE_OPERATOR_WEAK
    assert states["DISCOVERED"]["value"] == UNKNOWN
    assert states["DISCOVERED"]["strength"] == "weak"
    assert states["DISCOVERED"]["reason"] == REASON_SITE_OPERATOR_WEAK
    assert states["HTTP_OK"]["value"] == TRUE


def test_unavailable_timeout_and_dns_fail_closed():
    timeout_t = FakeTransport()
    timeout_t.add("GET", CANONICAL, TimeoutError("timed out"))
    timeout_t.add("HEAD", CANONICAL, TimeoutError("timed out"))
    timeout_t.add("GET", "https://confenge.com.br/robots.txt", TimeoutError("timed out"))
    timed = run_probe(timeout_t)
    timed_ops = operations_for_asset(ASSET, [timed])
    assert REASON_HTTP_TIMEOUT in timed["reason_codes"]
    assert timed_ops["states"]["HTTP_OK"]["value"] == UNKNOWN
    assert timed_ops["states"]["HTTP_OK"]["reason"] == REASON_HTTP_TIMEOUT
    assert timed_ops["states"]["CRAWL_ALLOWED"]["value"] == UNKNOWN
    assert timed_ops["states"]["DISCOVERED"]["value"] == UNKNOWN
    assert timed_ops["states"]["INDEXED"]["value"] == UNKNOWN

    dns_t = FakeTransport()
    dns_t.add("GET", CANONICAL, ConnectionError("dns"))
    dns_t.add("HEAD", CANONICAL, ConnectionError("dns"))
    dns_t.add("GET", "https://confenge.com.br/robots.txt", ConnectionError("dns"))
    dns = run_probe(dns_t)
    dns_ops = operations_for_asset(ASSET, [dns])
    assert REASON_HTTP_UNAVAILABLE in dns["reason_codes"]
    assert dns_ops["states"]["HTTP_OK"]["value"] == UNKNOWN
    assert dns_ops["states"]["HTTP_OK"]["reason"] == REASON_HTTP_UNAVAILABLE


def test_4xx_is_false_5xx_is_unknown():
    t404 = baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, b"missing", status=404)})
    r404 = operations_for_asset(ASSET, [run_probe(t404)])
    assert r404["states"]["HTTP_OK"]["value"] == FALSE
    assert r404["states"]["HTTP_OK"]["reason"] == REASON_HTTP_4XX
    assert r404["states"]["INDEXED"]["value"] == UNKNOWN

    t5 = baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, b"err", status=503)})
    r5 = operations_for_asset(ASSET, [run_probe(t5)])
    assert REASON_HTTP_5XX in (r5.get("reason_codes") or []) or r5["states"]["HTTP_OK"]["reason"] == REASON_HTTP_5XX
    assert r5["states"]["HTTP_OK"]["value"] == UNKNOWN
    assert r5["states"]["INDEXED"]["value"] == UNKNOWN


def test_gsc_impressions_are_not_indexed():
    probe = run_probe(baseline_transport())
    gsc = import_gsc_file(
        FIXTURES / "gsc.json",
        asset_id=ASSET_ID,
        observed_at=AS_OF,
    )
    ops = operations_for_asset(ASSET, [probe] + gsc)
    values = state_values(ops["states"])
    assert values["HTTP_OK"] == TRUE
    assert values["DISCOVERED"] == TRUE
    assert values["IMPRESSION"] == TRUE
    assert values["CLICK"] == TRUE
    assert values["INDEXED"] == UNKNOWN
    assert ops["states"]["INDEXED"]["reason"] == REASON_PUBLICATION_IS_NOT_INDEX or ops["states"][
        "INDEXED"
    ]["reason"] == "NO_EXPLICIT_INDEX_STATE"
    assert values["LEAD"] == UNKNOWN
    assert values["REVENUE"] == UNKNOWN


def test_explicit_index_state_is_indexed_site_operator_is_not():
    probe = run_probe(baseline_transport())
    indexed = operations_for_asset(ASSET, [probe, _index_state_row(verdict="indexed")])
    assert indexed["states"]["INDEXED"]["value"] == TRUE
    assert indexed["states"]["DISCOVERED"]["value"] == TRUE
    discovered_only = operations_for_asset(
        ASSET, [probe, _index_state_row(verdict="discovered - currently not indexed")]
    )
    assert discovered_only["states"]["DISCOVERED"]["value"] == TRUE
    assert discovered_only["states"]["INDEXED"]["value"] == UNKNOWN


def test_gsc_blocked_is_blocked_not_false():
    probe = run_probe(baseline_transport())
    blocked = build_observation(
        asset_id=ASSET_ID,
        observation_type="gsc",
        observed_at=AS_OF,
        source="gsc_api",
        status="UNAVAILABLE",
        reason_codes=[REASON_GSC_BLOCKED],
        dimensions={"fact_key": "gsc-blocked", "row_hash": "gsc-blocked"},
        metrics={"impressions": None, "clicks": None},
    )
    ops = operations_for_asset(ASSET, [probe, blocked])
    for name in ("DISCOVERED", "INDEXED", "IMPRESSION", "CLICK"):
        assert ops["states"][name]["value"] == BLOCKED
        assert ops["states"][name]["reason"] == REASON_GSC_BLOCKED
    assert ops["states"]["HTTP_OK"]["value"] == TRUE
    assert ops["states"]["LEAD"]["value"] == UNKNOWN


def test_opaque_lead_id_is_not_lead_true():
    asset = _canary_asset()
    only_id = import_referral_file(
        FIXTURES / "lead-only-id.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    ops = operations_for_asset(asset, only_id)
    assert ops["states"]["LEAD"]["value"] == UNKNOWN
    assert ops["states"]["LEAD"]["value"] != TRUE
    assert ops["lead_status"] == "UNKNOWN"

    with_search = import_referral_file(
        FIXTURES / "lead-with-gclid.json", asset_id=ASSET_ID, observed_at=AS_OF
    )
    proven = operations_for_asset(asset, with_search)
    assert proven["states"]["LEAD"]["value"] == TRUE
    assert proven["lead_status"] == "LEAD_PROVEN"


def test_append_only_replay_does_not_mutate_states(tmp_path):
    store = tmp_path / "observations.ndjson"
    first = run_probe(baseline_transport())
    a = append_observation(store, first)
    b = append_observation(store, first)
    assert a["appended"] is True
    assert b["replay"] is True
    lines = [line for line in store.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 1
    ops_one = operations_for_asset(ASSET, [json.loads(lines[0])])
    ops_two = operations_for_asset(ASSET, [json.loads(lines[0]), first])
    assert state_values(ops_one["states"]) == state_values(ops_two["states"])


def test_report_emits_ten_states_for_live_canary():
    report = build_report(root=ROOT, generated_at=AS_OF)
    canary = next(item for item in report["assets"] if item["id"] == ASSET_ID)
    states = canary["operations"]["states"]
    for name in STATE_NAMES:
        assert name in states
        assert states[name]["value"] in {TRUE, FALSE, UNKNOWN, BLOCKED}
    values = state_values(states)
    assert values["HTTP_OK"] == TRUE
    assert values["CRAWL_ALLOWED"] == TRUE
    assert values["SITEMAP_LISTED"] == TRUE
    assert values["CANONICAL_VALID"] == TRUE
    assert values["DISCOVERED"] == UNKNOWN
    assert values["INDEXED"] == UNKNOWN
    assert values["IMPRESSION"] == UNKNOWN
    assert values["CLICK"] == UNKNOWN
    assert values["LEAD"] == UNKNOWN
    assert values["REVENUE"] == UNKNOWN
    text = format_report(report)
    assert "HTTP_OK: TRUE" in text
    assert "INDEXED: UNKNOWN" in text
    assert "DISCOVERED: UNKNOWN" in text
    assert "LEAD: UNKNOWN" in text
