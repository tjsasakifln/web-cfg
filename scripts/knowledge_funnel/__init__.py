"""WEB-002 knowledge-funnel integration walk.

Thin orchestrator over shipped Market Answer, contract-analysis, X-Ray,
persist-first intake and Warmbly adapter. Fixture-safe. Does not authorize
INDEX, flag flip, or a live commercial send.
"""

from __future__ import annotations

SCHEMA_ID = "knowledge-funnel-trace/1.0"
CORPUS_SCHEMA = "knowledge-funnel-corpus/1.0"
SOURCE = "CONFENGE_WEB"
DEFAULT_CORPUS = "data/knowledge_funnel/corpus.v1.json"
CTA_COPY = "Veja sua empresa neste mercado"

AUTHORITIES = {
    "answer": "web-cfg/scripts.market_answers (SELECT-only consume of extra-cli facts)",
    "evidence": "web-cfg/scripts.market_answers.urls drill-down (no combinatorial URLs)",
    "analysis": "web-cfg/scripts.contract_analysis (editorial consume + gate)",
    "xray": "web-cfg/scripts.conversion.xray (extra-cli Goal 03 absent; labeled fixture)",
    "persist": "web-cfg/scripts.conversion.intake-core persist-first",
    "handoff": "web-cfg/scripts.conversion.adapter → warmbly inbound (isolated; frozen #85 libs)",
}

PUBLICATION_RANK = {
    "REJECT": 0,
    "HOLD_FOR_DATA": 1,
    "NEEDS_DATA": 1,
    "PRIVATE_ANSWER_ONLY": 2,
    "CANDIDATE": 2,
    "EDITORIAL_REVIEW": 3,
    "PUBLISHABLE_NOINDEX": 4,
    "PUBLISHABLE_INDEX": 5,
}

XRAY_RANK = {
    "ERROR": 0,
    "BLOCKED": 0,
    "NOT_FOUND": 1,
    "STALE": 1,
    "NEEDS_DATA": 1,
    "READY": 2,
}

# Non-semantic clocks stripped before hashing two traces.
CLOCK_KEYS = frozenset(
    {
        "at",
        "received_at",
        "updated_at",
        "latency_ms",
        "generated_at",
        "now",
        "started_at",
        "finished_at",
    }
)
PATH_KEYS = frozenset({"store_dir", "_source_path", "source_path", "report"})

__all__ = [
    "AUTHORITIES",
    "CLOCK_KEYS",
    "CORPUS_SCHEMA",
    "CTA_COPY",
    "DEFAULT_CORPUS",
    "PATH_KEYS",
    "PUBLICATION_RANK",
    "SCHEMA_ID",
    "SOURCE",
    "XRAY_RANK",
]
