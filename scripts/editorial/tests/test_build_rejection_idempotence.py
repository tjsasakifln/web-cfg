"""Regression coverage for repeated editorial builds on a rejected page."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.editorial.build import _record_rejection  # noqa: E402


def test_identical_rejection_is_one_audit_fact():
    page = {"history": []}

    _record_rejection(page, "official_sumula_text_date_url_not_verified")
    _record_rejection(page, "official_sumula_text_date_url_not_verified")

    assert len(page["history"]) == 1
    assert page["history"][0]["event"] == "REJECTED"
    assert page["history"][0]["reason"] == "official_sumula_text_date_url_not_verified"


def test_distinct_rejection_reason_remains_a_distinct_fact():
    page = {"history": []}

    _record_rejection(page, "jurisprudence_source_incomplete")
    _record_rejection(page, "official_sumula_text_date_url_not_verified")

    assert [row["reason"] for row in page["history"]] == [
        "jurisprudence_source_incomplete",
        "official_sumula_text_date_url_not_verified",
    ]
