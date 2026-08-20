"""Timestamp-aware freshness through the shipped evaluate/build/validate path."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from scripts.market_answers import FRESHNESS_CLASSES, PII_EVENT_KEYS
from scripts.market_answers.clock import parse_instant
from scripts.market_answers.gate import evaluate
from scripts.market_answers.render import render_html, write_page
from scripts.market_answers.report import build_status
from scripts.market_answers.sitemap import parse_locs
from tests.market_answers.helpers import (
    drifted_approval,
    load_shipped_candidate,
    load_shipped_fixture,
    matching_approval,
    official_like_payload,
)

ROOT = Path(__file__).resolve().parents[2]
CANONICAL = "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
EXPIRES_P2 = "2026-08-19T11:29:23.193694+02:00"
EXPIRES_Z = "2026-08-19T09:29:23.193694Z"
EXPIRES_M3 = "2026-08-19T06:29:23.193694-03:00"


def _run(cmd: list[str], *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = None
    if env is not None:
        import os

        merged = {**os.environ, **env}
    return subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=False, env=merged)


def _payload_with_expires(expires_at: str) -> dict:
    payload = official_like_payload()
    freshness = dict(payload.get("freshness") or {})
    freshness["expires_at"] = expires_at
    payload["freshness"] = freshness
    return payload


def _decide(payload: dict, now: datetime, approvals: dict | None = None):
    record = load_shipped_candidate()
    return evaluate(
        record,
        payload,
        approvals if approvals is not None else matching_approval(payload),
        now=now,
    )


def test_instant_before_expires_at_can_index_when_approved():
    payload = _payload_with_expires(EXPIRES_P2)
    expires = parse_instant(EXPIRES_P2)
    assert expires is not None
    now = expires - timedelta(seconds=1)
    decision = _decide(payload, now)
    assert decision.freshness_class in {"CURRENT", "EXPIRING"}
    assert decision.conditions["freshness_current"] is True
    assert decision.state == "PUBLISHABLE_INDEX"
    assert decision.indexable is True
    assert decision.robots == "index,follow"
    assert decision.sitemap is True
    assert decision.evaluated_at
    assert decision.age_seconds is not None
    assert decision.expires_at == EXPIRES_P2


def test_instant_at_and_after_expires_at_are_stale_and_not_index():
    payload = _payload_with_expires(EXPIRES_P2)
    expires = parse_instant(EXPIRES_P2)
    assert expires is not None
    for instant in (expires, expires + timedelta(seconds=1), expires + timedelta(hours=6)):
        decision = _decide(payload, instant)
        assert decision.freshness_class == "STALE", (instant, decision.reason_codes)
        assert decision.state != "PUBLISHABLE_INDEX"
        assert decision.indexable is False
        assert "noindex" in decision.robots
        assert decision.sitemap is False
        assert "freshness_expired" in decision.reason_codes


def test_expires_at_offsets_compare_in_utc():
    expires = parse_instant(EXPIRES_Z)
    assert expires is not None
    before = expires - timedelta(seconds=1)
    at = expires
    after = expires + timedelta(seconds=1)
    for raw in (EXPIRES_Z, EXPIRES_P2, EXPIRES_M3):
        payload = _payload_with_expires(raw)
        dec_before = _decide(payload, before)
        dec_at = _decide(payload, at)
        dec_after = _decide(payload, after)
        assert dec_before.freshness_class in {"CURRENT", "EXPIRING"}
        assert dec_before.indexable is True
        assert dec_at.freshness_class == "STALE"
        assert dec_at.indexable is False
        assert dec_after.freshness_class == "STALE"
        assert dec_after.indexable is False
        assert parse_instant(dec_at.expires_at) == expires


def test_missing_and_unparseable_timestamps_are_unknown_and_not_index():
    record = load_shipped_candidate()
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)

    missing = official_like_payload()
    missing["as_of"] = ""
    missing["freshness"] = {"max_age_hours": 48, "status": "FRESH"}
    dec_missing = evaluate(record, missing, matching_approval(missing), now=now)
    assert dec_missing.freshness_class == "UNKNOWN"
    assert dec_missing.indexable is False
    assert dec_missing.state != "PUBLISHABLE_INDEX"
    assert "freshness_unknown_timestamps" in dec_missing.reason_codes

    bad = official_like_payload()
    bad["as_of"] = "not-a-timestamp"
    bad["freshness"] = {
        "expires_at": "also-bad",
        "as_of": "also-bad",
        "source_as_of": "also-bad",
        "max_age_hours": 48,
        "status": "FRESH",
    }
    dec_bad = evaluate(record, bad, matching_approval(bad), now=now)
    assert dec_bad.freshness_class == "UNKNOWN"
    assert dec_bad.indexable is False
    assert dec_bad.state != "PUBLISHABLE_INDEX"


def test_fixture_coverage_and_approval_mismatch_stay_fail_closed():
    record = load_shipped_candidate()
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)

    fixture = load_shipped_fixture()
    dec_fix = evaluate(record, fixture, matching_approval(fixture), now=now)
    assert dec_fix.is_fixture is True
    assert dec_fix.indexable is False
    assert dec_fix.state != "PUBLISHABLE_INDEX"
    assert "noindex" in dec_fix.robots
    assert dec_fix.sitemap is False

    weak = official_like_payload()
    weak["coverage"] = {
        "status": "INSUFFICIENT",
        "stale": True,
        "national_universe_complete": False,
        "reason_codes": ["coverage_stale"],
    }
    dec_cov = evaluate(record, weak, matching_approval(weak), now=now)
    assert dec_cov.indexable is False
    assert dec_cov.state != "PUBLISHABLE_INDEX"
    assert dec_cov.conditions["coverage_sufficient"] is False

    ok_payload = official_like_payload()
    dec_hash = evaluate(record, ok_payload, drifted_approval(ok_payload), now=now)
    assert dec_hash.indexable is False
    assert dec_hash.state != "PUBLISHABLE_INDEX"
    assert dec_hash.conditions["human_approval_hash"] is False


def test_generated_at_only_refresh_does_not_renew_stale_evaluation():
    now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
    payload = official_like_payload()
    payload["as_of"] = "2026-08-14T00:00:00Z"
    payload["freshness"] = {
        "as_of": "2026-08-14T00:00:00Z",
        "source_as_of": "2026-08-14T00:00:00Z",
        "generated_at": "2026-08-14T00:00:00Z",
        "expires_at": "2026-08-16T00:00:00Z",
        "max_age_hours": 48,
        "status": "FRESH",
    }
    first = _decide(payload, now)
    bumped = copy.deepcopy(payload)
    bumped["freshness"] = dict(payload["freshness"])
    bumped["freshness"]["generated_at"] = "2026-08-17T12:00:00Z"
    second = _decide(bumped, now)
    assert first.freshness_class == "STALE"
    assert second.freshness_class == "STALE"
    assert first.indexable is False
    assert second.indexable is False
    assert first.state != "PUBLISHABLE_INDEX"
    assert second.state != "PUBLISHABLE_INDEX"


def test_lkg_cannot_preserve_index_after_expiry():
    payload = _payload_with_expires(EXPIRES_P2)
    now = parse_instant(EXPIRES_P2)
    assert now is not None
    approvals = matching_approval(payload)
    digest = payload.get("content_hash") or ""
    from scripts.market_answers.approval import rendered_content_hash

    lkg = {
        "indexable": True,
        "payload_content_hash": digest,
        "rendered_content_hash": rendered_content_hash(load_shipped_candidate(), payload),
        "robots": "index,follow",
        "freshness_class": "CURRENT",
    }
    decision = evaluate(load_shipped_candidate(), payload, approvals, now=now, lkg=lkg)
    assert decision.freshness_class == "STALE"
    assert decision.indexable is False
    assert decision.state != "PUBLISHABLE_INDEX"
    assert "lkg_preserved" not in decision.reason_codes


def test_uninjected_evaluate_uses_real_utc_clock():
    payload = official_like_payload()
    before = datetime.now(timezone.utc) - timedelta(seconds=2)
    decision = evaluate(load_shipped_candidate(), payload, matching_approval(payload))
    after = datetime.now(timezone.utc) + timedelta(seconds=2)
    evaluated = parse_instant(decision.evaluated_at)
    assert evaluated is not None
    assert evaluated.tzinfo is not None
    assert before <= evaluated <= after
    assert "2026-08-17T00:00:00Z" != decision.evaluated_at
    assert decision.freshness_class in FRESHNESS_CLASSES


def test_cli_validate_fail_on_stale_is_observable_nonsuccess():
    validated = _run(
        [sys.executable, "-m", "scripts.market_answers", "validate", "--fail-on-stale"]
    )
    body = json.loads(validated.stdout)
    assert body["state"] != "PUBLISHABLE_INDEX"
    assert body["freshness_class"] in {"STALE", "UNKNOWN"}
    assert body["ok"] is False
    assert validated.returncode != 0
    evaluated = parse_instant(body["evaluated_at"])
    assert evaluated is not None
    assert evaluated.tzinfo is not None
    assert "2026-08-17T00:00:00" not in body["evaluated_at"]

    again = _run(
        [sys.executable, "-m", "scripts.market_answers", "validate", "--fail-on-stale"]
    )
    second = json.loads(again.stdout)
    assert second["freshness_class"] == body["freshness_class"]
    assert second["state"] == body["state"]
    assert second["ok"] is False


def test_html_status_sitemap_parity_for_injected_states(tmp_path: Path):
    record = load_shipped_candidate()
    payload = _payload_with_expires(EXPIRES_P2)
    expires = parse_instant(EXPIRES_P2)
    assert expires is not None

    for now, expect_index in ((expires - timedelta(seconds=1), True), (expires, False)):
        decision = evaluate(record, payload, matching_approval(payload), now=now)
        html = render_html(record, payload, decision, site_root=ROOT)
        status = build_status(record=record, payload=payload, decision=decision, now=now)
        site = tmp_path / now.isoformat().replace(":", "")
        site.mkdir()
        write_page(record, payload, decision, site_root=site)
        xml = (site / "sitemap-inteligencia.xml").read_text(encoding="utf-8")
        locs = parse_locs(xml)
        robots = "index,follow" if expect_index else "noindex,nofollow"
        assert f'content="{robots}"' in html
        assert status["page_index_state"]["robots"] == robots
        assert status["page_index_state"]["sitemap"] is expect_index
        assert status["gate_results"]["indexable"] is expect_index
        assert status["freshness_class"] == decision.freshness_class
        assert status["evaluated_at"] == decision.evaluated_at
        assert status["age_seconds"] == decision.age_seconds
        assert status["expires_at"] == decision.expires_at
        if expect_index:
            assert CANONICAL in locs
            assert decision.freshness_class in {"CURRENT", "EXPIRING"}
        else:
            assert CANONICAL not in locs
            assert decision.freshness_class == "STALE"
        for key in PII_EVENT_KEYS:
            assert key not in status
            assert key not in status["page_index_state"]
            assert key not in status["gate_results"]
