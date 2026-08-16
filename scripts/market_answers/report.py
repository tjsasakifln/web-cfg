"""Status JSON/MD for the paving-ticket Market Answer canary."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from scripts.market_answers import STATUS_STEM
from scripts.market_answers.events import catalog
from scripts.market_answers.gate import GateDecision


REPORT_MD = Path("docs/editorial") / f"{STATUS_STEM}.md"
REPORT_JSON = Path("docs/editorial") / f"{STATUS_STEM}.json"


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_status(
    *,
    record: dict[str, Any],
    payload: dict[str, Any],
    decision: GateDecision,
    written: dict[str, Path] | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    today = today or date(2026, 8, 16)
    events = catalog(
        asset_version=str(record.get("version") or "1.0"),
        content_hash=decision.content_hash,
    )
    blockers = list(decision.reason_codes)
    next_steps = [
        "Wait for extra-cli Goal 03 official_live export (issues #400 market-answer addendum).",
        "Bind Goal 05 peer-group / #415 comparables only when COMPARABLE is fail-closed.",
        "Do not claim national coverage until extra-cli #302 closes the publishing-org denominator.",
        "Do not close web-cfg #84 until organic discovery → engagement → handoff → real outcome.",
        "Keep the canary noindex/off-sitemap until official_live + claim + coverage + human hash pass.",
    ]
    return {
        "report": STATUS_STEM,
        "as_of_report": today.isoformat(),
        "generated_at": datetime(today.year, today.month, today.day, tzinfo=timezone.utc).strftime(
            "%Y-%m-%dT00:00:00Z"
        ),
        "candidate_decision": {
            "question": record.get("question"),
            "question_id": decision.question_id,
            "state": decision.state,
            "score": decision.score,
            "reason_codes": list(decision.reason_codes),
            "owner": record.get("owner"),
            "demand": record.get("demand"),
        },
        "data_state": {
            "official_live": decision.official_live,
            "producer_status": decision.producer_status,
            "is_fixture": decision.is_fixture,
            "schema": payload.get("schema"),
            "as_of": payload.get("as_of"),
            "coverage": payload.get("coverage"),
            "freshness": payload.get("freshness"),
            "claim": payload.get("claim"),
            "content_hash": decision.content_hash,
            "producer_sha": payload.get("producer_sha"),
            "source_path": payload.get("_source_path"),
        },
        "gate_results": {
            "gate_version": decision.gate_version,
            "state": decision.state,
            "indexable": decision.indexable,
            "conditions": decision.conditions,
            "reason_codes": list(decision.reason_codes),
        },
        "page_index_state": {
            "path": "/inteligencia/valor-tipico-contratos-pavimentacao/",
            "robots": decision.robots,
            "sitemap": decision.sitemap,
            "canonical": "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/",
            "rendered": sorted(str(path) for path in (written or {}).values()),
            "fixture_marked": decision.is_fixture,
        },
        "engagement_events_available": events,
        "blockers": blockers,
        "next_integration_steps": next_steps,
        "recommendation": decision.recommendation,
    }


def render_markdown(status: dict[str, Any]) -> str:
    cand = status["candidate_decision"]
    data = status["data_state"]
    gate = status["gate_results"]
    page = status["page_index_state"]
    events = status["engagement_events_available"]
    cond_lines = "\n".join(
        f"- `{key}`: `{value}`" for key, value in (gate.get("conditions") or {}).items()
    )
    event_lines = "\n".join(
        f"- `{item['name']}` ({item['layer']})"
        for item in events.get("events") or []
    )
    blocker_lines = "\n".join(f"- `{item}`" for item in status.get("blockers") or []) or "- none"
    next_lines = "\n".join(f"- {item}" for item in status.get("next_integration_steps") or [])
    demand = cand.get("demand") or {}
    demand_status = demand.get("status") if isinstance(demand, dict) else demand
    score = cand.get("score") or {}
    return f"""# Market Answer canary status

**Recommendation:** `{status['recommendation']}`

**Candidate decision:** `{cand.get('state')}`: {cand.get('question')}

**Demand:** `{demand_status}` (UNKNOWN stays UNKNOWN)

**Data state:** official_live=`{data.get('official_live')}` · producer_status=`{data.get('producer_status')}` · fixture=`{data.get('is_fixture')}`

**as_of:** `{data.get('as_of')}` · content_hash=`{data.get('content_hash')}`

## Gate results

- gate: `{gate.get('gate_version')}`
- indexable: `{gate.get('indexable')}`
- robots: `{page.get('robots')}`
- sitemap: `{page.get('sitemap')}`

{cond_lines}

Reason codes: {", ".join(f"`{c}`" for c in gate.get("reason_codes") or []) or "none"}

Score `{score.get("version")}` total=`{score.get("total")}` · unknown components: {", ".join(score.get("unknown_components") or []) or "none"}

## Page / index state

- path: `{page.get('path')}`
- canonical: `{page.get('canonical')}`
- fixture marked: `{page.get('fixture_marked')}`
- rendered: {", ".join(page.get("rendered") or []) or "none"}

## Engagement events available

{event_lines}

Page view is not a lead. Impression, engagement, lead and pipeline stay separate.

## Blockers

{blocker_lines}

## Next integration steps

{next_lines}

Do not close #84. Extra-cli #400/#415/#302 official_live market-answer payload is still absent.
"""


def write_status(status: dict[str, Any]) -> dict[str, Path]:
    root = _root()
    md = root / REPORT_MD
    js = root / REPORT_JSON
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text(render_markdown(status), encoding="utf-8")
    js.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"markdown": md, "json": js}
