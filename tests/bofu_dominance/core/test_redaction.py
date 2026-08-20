"""Live query text is hashed; PII is refused."""

from __future__ import annotations

import pytest

from scripts.bofu_dominance.core.redaction import (
    assert_no_pii,
    contains_pii,
    git_safe_status,
    redact_live_query_fields,
    redact_query,
)
from tests.bofu_dominance.core.helpers import build_status


def test_live_query_is_hashed_not_copied():
    payload = {
        "is_gsc_live": True,
        "source_kind": "gsc_api",
        "query": "consulta privada glosa",
        "impressions": 3,
    }
    redacted = redact_live_query_fields(payload)
    assert "query" not in redacted
    assert redacted["query_hash"] == redact_query("consulta privada glosa")
    assert redacted["query_hash"].startswith("sha256:")
    assert "consulta privada" not in str(redacted)
    assert redacted["query_text_redacted"] is True


def test_public_target_queries_in_status_are_not_live_rows():
    status = git_safe_status(build_status())
    blob = str(status)
    assert "52.407.089/0001-09" not in blob
    assert contains_pii(blob) is False
    live_rows = [
        item
        for family in status["families"]
        for item in [family["evidence"]]
        if item.get("is_gsc_live")
    ]
    assert live_rows == []


def test_cnpj_is_refused():
    with pytest.raises(ValueError, match="PII"):
        assert_no_pii("empresa 12.345.678/0001-90", "fixture")
