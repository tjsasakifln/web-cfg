"""Drive shipped demand-control / CTR / queue functions — no reimplementation."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.serp_ctr import is_ctr_gap
from scripts.revops.search_demand_observatory import (
    build_next_action_queue,
    classify_snapshot_source,
    exclusion_for_url,
    is_live_gsc_payload,
    stamp_non_live_snapshot,
)


EXCLUDED_PATHS = (
    "/conteudos/sinapi-desonerado-nao-desonerado/",
    "/conteudos/chuva-prorrogacao-prazo-obra-publica/",
    "/aditivos-obras-publicas/",
    "/reequilibrio-obras-publicas/",
    "/auditoria-orcamento-licitacao/",
    "/ferramentas/diagnostico-defesa-margem/",
    "/analises-contratos-publicos/",
    "/inteligencia/valor-tipico-contratos-pavimentacao/",
    "/internal/data-desk/",
    "/ofertas/",
    "https://smartlic.tech/anything",
)


def test_ctr_gap_missing_denominator_is_not_zero():
    gap = is_ctr_gap(impressions=None, clicks=None, position=None)
    assert gap["is_opportunity"] is False
    assert gap["ctr"] is None
    assert gap["status"] == "INSUFFICIENT_EVIDENCE"
    assert gap["zero_inferred_from_absence"] is False
    assert "missing_denominator_is_not_zero" in gap["reasons"]


def test_ctr_gap_zero_impressions_is_not_opportunity():
    gap = is_ctr_gap(impressions=0.0, clicks=0.0, position=7.0)
    assert gap["is_opportunity"] is False
    assert gap["ctr"] == 0.0


def test_historical_csv_is_not_live():
    stamped = stamp_non_live_snapshot({"source": "csv_export", "queries": []})
    assert classify_snapshot_source(stamped) == "historical_csv_export"
    assert is_live_gsc_payload(stamped) is False
    assert stamped["ready_for_product_decisions"] is False


def test_queue_excludes_active_experiments_from_change_now():
    rows = [
        {
            "date": "2026-07-28",
            "query": "sinapi desonerado",
            "page": "https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/",
            "impressions": 18,
            "clicks": 1,
            "position": 6.8,
            "country": "bra",
            "device": "DESKTOP",
        },
        {
            "date": "2026-07-28",
            "query": "aditivos obras publicas",
            "page": "https://confenge.com.br/aditivos-obras-publicas/",
            "impressions": 40,
            "clicks": 1,
            "position": 8,
            "country": "bra",
            "device": "DESKTOP",
        },
    ]
    queue = build_next_action_queue(
        {"source": "csv_export", "historical": True, "queries": rows, "max_date": "2026-07-28"},
        today=date(2026, 8, 19),
    )
    assert queue["count"] <= 3
    assert len(queue["candidates"]) <= 3
    assert queue["authorizes_html_edit"] is False
    for cand in queue["candidates"]:
        if cand.get("observe_only"):
            continue
        for url in (cand.get("current_landing"), cand.get("intended_landing")):
            assert exclusion_for_url(str(url or "")) is None, url


def test_exclusion_table_covers_anchor_families():
    for path in EXCLUDED_PATHS:
        assert exclusion_for_url(path), path
