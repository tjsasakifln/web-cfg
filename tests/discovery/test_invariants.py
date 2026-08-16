"""Invariants: no GEO hack, no live send, metric-stage and eligibility gates."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.eligibility import is_indexnow_eligible, is_publicable
from scripts.discovery.geo_guard import assert_no_geo_strategy, scan_owned_code
from scripts.discovery.indexnow import IndexNowPrepareError, prepare
from scripts.discovery.inspect import inspect_asset
from scripts.discovery.metrics import MetricStageError, count_event
from scripts.discovery.registry import load_allowlist, load_cohort
from scripts.discovery.report import build_report

AS_OF = "2026-08-16T00:00:00Z"
OWNED = (
    ROOT / "scripts" / "discovery",
    ROOT / "scripts" / "data_desk",
    ROOT / "tests" / "discovery",
    ROOT / "tests" / "data_desk",
    ROOT / "data" / "discovery",
    ROOT / "data" / "data-desk",
    ROOT / "docs" / "discovery",
    ROOT / "docs" / "data-desk",
)


def test_no_llms_txt_or_geo_hack_in_owned_code():
    assert_no_geo_strategy(ROOT)
    assert scan_owned_code(ROOT) == []
    for base in OWNED:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in {".py", ".json", ".md", ".html"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if path.name == "INTEGRATION_NOTES.md" or path.name.endswith(".md"):
                # Docs may name the forbidden tactic in order to reject it.
                continue
            if path.name in {"geo_guard.py", "test_invariants.py"}:
                continue
            assert "llms.txt" not in text


def test_owned_trees_do_not_post_to_indexnow():
    skip = {"geo_guard.py", "test_invariants.py"}
    for base in (ROOT / "scripts" / "discovery", ROOT / "scripts" / "data_desk"):
        for path in base.rglob("*.py"):
            if path.name in skip:
                continue
            text = path.read_text(encoding="utf-8")
            assert "import urllib.request" not in text
            assert "from urllib import request" not in text
            assert "import http.client" not in text
            assert "import requests" not in text
            assert "import httpx" not in text
            assert "aiohttp" not in text
            assert "urlopen(" not in text


def test_noindex_or_fixture_fails_indexnow_and_publicable():
    cohort = load_cohort(root=ROOT)
    allowlist = list(load_allowlist(root=ROOT)["urls"])
    for asset in cohort["assets"]:
        inspected = inspect_asset(asset, root=ROOT)
        if asset.get("fixture") or asset.get("index_intent") == "DO_NOT_INDEX":
            assert is_publicable(asset, inspected) is False
            url = asset.get("canonical") or "https://confenge.com.br/internal/data-desk/fixture-only/"
            ok, reason = is_indexnow_eligible(
                url, allowlist=allowlist, asset=asset, inspected=inspected
            )
            assert ok is False
            assert reason in {"fixture", "noindex", "not_on_allowlist", "not_approved_canonical"}


def test_receipt_is_not_indexation(tmp_path):
    receipt = prepare(
        ["https://confenge.com.br/radar/nacional-obras-publicas/"],
        root=ROOT,
        receipts_dir=tmp_path,
        generated_at=AS_OF,
    )
    assert receipt["indexation"] is False
    with pytest.raises(MetricStageError):
        count_event("indexnow_200", "INDEX/APPEARANCE")


def test_send_without_flag_cannot_happen(tmp_path):
    receipt = prepare(
        ["https://confenge.com.br/metodologia-inteligencia/"],
        root=ROOT,
        receipts_dir=tmp_path,
        generated_at=AS_OF,
    )
    assert receipt["dry_run"] is True
    assert receipt["sent"] is False
    with pytest.raises(IndexNowPrepareError):
        prepare(
            ["https://confenge.com.br/metodologia-inteligencia/"],
            root=ROOT,
            receipts_dir=tmp_path,
            send=True,
            dry_run=False,
        )


def test_report_does_not_invent_appearance_or_citations():
    report = build_report(root=ROOT, generated_at=AS_OF)
    for record in report["assets"]:
        assert record["generative_ai_visibility"] == "UNKNOWN"
        assert record["citations"] == "UNKNOWN"
        assert record["chatgpt_ai_referrals"] == "UNKNOWN"
        assert record["metric_stages"]["CITATION"]["status"] == "UNKNOWN"
        assert record["metric_stages"]["REFERRAL"]["status"] == "UNKNOWN"
        assert record["metric_stages"]["INDEX/APPEARANCE"]["status"] == "UNKNOWN"
