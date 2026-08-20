"""Frozen #128 families must not recommend edit-now."""

from __future__ import annotations

from scripts.bofu_dominance.core.constants import EDIT_NOW_ACTIONS
from scripts.bofu_dominance.core.recommend import recommend_family
from tests.bofu_dominance.core.helpers import build_status, load_registry, resolve_family_state

FROZEN_PATHS = {
    "/aditivos-obras-publicas/",
    "/medicoes-glosas-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/auditoria-orcamento-licitacao/",
    "/diagnostico-b2g-360/",
    "/diagnostico-pre-licitacao/",
}


def test_issue_128_families_are_frozen_and_refuse_edit_now():
    status = build_status()
    frozen = [item for item in status["families"] if item["state"] == "FROZEN"]
    assert {item["canonical_owner"]["path"] for item in frozen} == FROZEN_PATHS
    for item in frozen:
        assert item["freeze"]["frozen"] is True
        assert item["freeze"]["html_edit"] is False
        rec = item["recommendation"]
        assert rec["authorizes_html_edit"] is False
        assert rec["action"] not in EDIT_NOW_ACTIONS
        assert rec["action"] == "observe_only"
        assert rec["earliest_safe_action_at"] == "2026-09-16"


def test_resolver_keeps_frozen_even_with_fake_live_top1():
    registry = load_registry()
    aditivos = next(item for item in registry["families"] if item["id"] == "aditivos")
    fake_live = {
        "source": "gsc_live",
        "is_gsc_live": True,
        "date": "2026-08-19",
        "geo": "bra",
        "device": "DESKTOP",
        "denominator": "impressions",
        "position": 1.0,
        "impressions": 40,
    }
    resolved = resolve_family_state(aditivos, evidence=fake_live, gsc_live_state="LIVE")
    assert resolved["state"] == "FROZEN"
    rec = recommend_family(resolved, aditivos)
    assert rec["authorizes_html_edit"] is False
    assert rec["action"] not in EDIT_NOW_ACTIONS
