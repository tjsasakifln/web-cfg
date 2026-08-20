"""Old/generic owner tokens never grant INDEX. Drives shipped approval.py."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.contract_analysis import (
    OWNER_CONDITIONAL_PREAPPROVAL_V2,
    OWNER_CONDITIONAL_PREAPPROVAL_V2_2026_08_19,
    OWNER_CONDITIONAL_TOKEN_2026_08_17,
    OWNER_PREAPPROVAL_TOKEN_2026_08_19,
)
from scripts.contract_analysis.approval import ApprovalError, approve_conditional_canary
from scripts.contract_analysis.tests.helpers import complete_live_record
from scripts.contract_analysis.gate import evaluate_publication
from scripts.contract_analysis.render import render_analysis_html


def _html(rec):
    return render_analysis_html(rec, evaluate_publication(rec, cohort=[rec]))


@pytest.mark.parametrize(
    "token",
    [
        OWNER_CONDITIONAL_TOKEN_2026_08_17,
        OWNER_PREAPPROVAL_TOKEN_2026_08_19,
        OWNER_CONDITIONAL_PREAPPROVAL_V2_2026_08_19,
        "OWNER_CONDITIONAL_TOKEN",
        "OWNER_CONDITIONAL_PREAPPROVAL",
        "OWNER_CONDITIONAL_APPROVAL",
        "generic",
        "",
    ],
)
def test_stale_and_generic_tokens_never_index(token, tmp_path):
    rec = complete_live_record(approved_for_index=False)
    with pytest.raises(ApprovalError, match="conditional_token_invalid"):
        approve_conditional_canary(
            rec,
            token=token,
            rollback="git:revert:ca",
            rendered_html=_html(rec),
            producer_root_hash="abc",
            source_dossier_hash="def",
            quality={"score": 90, "dimensions": {}, "hard_gates": {}},
            handoff={"status": "HANDOFF_READY"},
            suite_green=True,
            root=tmp_path,
        )


def test_v2_token_constant_is_exact_preapproval():
    assert OWNER_CONDITIONAL_PREAPPROVAL_V2.endswith("2026_08_20")
    assert "V2" in OWNER_CONDITIONAL_PREAPPROVAL_V2
    assert OWNER_CONDITIONAL_TOKEN_2026_08_17 not in OWNER_CONDITIONAL_PREAPPROVAL_V2
    assert OWNER_PREAPPROVAL_TOKEN_2026_08_19 not in OWNER_CONDITIONAL_PREAPPROVAL_V2
