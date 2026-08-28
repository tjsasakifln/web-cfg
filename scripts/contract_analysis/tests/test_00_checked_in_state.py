"""The checked-in public surface must match the current hash-bound decision.

The CLI tests are isolated under ``CONFENGE_CONTRACT_ANALYSIS_ROOT``; this
test therefore does not depend on collection order.
"""

from __future__ import annotations

import json
from pathlib import Path

from scripts.contract_analysis import AUTHORIZED_ANALYSIS_ID, AUTHORIZED_CANONICAL_PATH
from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.gate import evaluate_cohort
from scripts.contract_analysis.handoff import inspect_handoff
from scripts.contract_analysis.render import apply_rendered_hash_gate, render_analysis_html


ROOT = Path(__file__).resolve().parents[3]
OFFICIAL_CANARY = ROOT / "scripts/contract_analysis/fixtures/official-live-01"


def test_checked_in_canary_matches_current_approval_decision() -> None:
    bundle = load_canary(live_path=OFFICIAL_CANARY)
    records = [
        record
        for record in bundle["records"]
        if record.get("id") == AUTHORIZED_ANALYSIS_ID
    ]
    assert len(records) == 1

    record = records[0]
    decision = evaluate_cohort(records)[0]
    expected_html = render_analysis_html(record, decision)
    decision, expected_html = apply_rendered_hash_gate(record, decision, expected_html)
    assert "Autoria e revisão estão identificadas" in expected_html
    assert "Autoria e revisão humanas ainda não foram confirmadas" not in expected_html
    assert "HUMAN_REVIEW_PENDING" not in expected_html

    page = ROOT / AUTHORIZED_CANONICAL_PATH.strip("/") / "index.html"
    assert page.read_text(encoding="utf-8") == expected_html

    status = json.loads(
        (ROOT / "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json").read_text(
            encoding="utf-8"
        )
    )
    status_item = next(
        item for item in status["items"] if item.get("id") == AUTHORIZED_ANALYSIS_ID
    )
    assert status["source_kind"] == bundle["source_kind"] == "official_live"
    assert status["index_count"] == int(decision.indexable)
    assert status_item["state"] == decision.state
    assert status_item["indexable"] is decision.indexable
    expected_handoff = inspect_handoff(OFFICIAL_CANARY)
    assert status["handoff"]["status"] == expected_handoff["status"] == "HANDOFF_READY"
    status_live = next(row for row in status["handoff"]["checked"] if row["official_live"])
    expected_live = next(row for row in expected_handoff["checked"] if row["official_live"])
    assert status_live["hashes_ok"] is expected_live["hashes_ok"] is True
    assert status_live["reasons"] == expected_live["reasons"] == []
    assert "Replay o produtor" not in status["recommendation_reason"]
    assert "approval_material_hash_mismatch" in status["recommendation_reason"]

    slug = AUTHORIZED_CANONICAL_PATH.strip("/").split("/")[-1]
    sitemap_exists = (ROOT / "sitemap-analises-contratos.xml").is_file()
    robots_allows = f"Allow: {AUTHORIZED_CANONICAL_PATH}" in (
        ROOT / "robots.txt"
    ).read_text(encoding="utf-8")
    header_override = (
        f"{AUTHORIZED_CANONICAL_PATH}*\n  X-Robots-Tag: index, follow"
        in (ROOT / "_headers").read_text(encoding="utf-8")
    )

    assert sitemap_exists is decision.indexable
    # robots, X-Robots-Tag, sitemap and canonical are one decision. A noindex
    # family is Disallow'd; recrawl of a previously indexed URL is a GSC
    # manifesto action, not a robots Allow vs header noindex split.
    assert robots_allows is decision.indexable
    assert header_override is decision.indexable
    if sitemap_exists:
        assert slug in (ROOT / "sitemap-analises-contratos.xml").read_text(
            encoding="utf-8"
        )
