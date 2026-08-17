"""Write CONTRACT_ANALYSIS_CANARY_STATUS (markdown + json)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.contract_analysis import GATE_VERSION, MAX_CANARY, PUBLICATION_STATES, QUALITY_VERSION
from scripts.contract_analysis.gate import PublicationDecision
from scripts.contract_analysis.handoff import FACTUAL_HANDOFF_PENDING

REPORT_STEM = "CONTRACT_ANALYSIS_CANARY_STATUS"
REPORT_MD = Path("docs/editorial") / f"{REPORT_STEM}.md"
REPORT_JSON = Path("docs/editorial") / f"{REPORT_STEM}.json"
# Keep the previous filename as a pointer so older links do not 404 in-repo.
LEGACY_STEM = "CONTRACT_ANALYSIS_EDITORIAL_STATUS"


def _root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_status(
    *,
    bundle: dict[str, Any],
    decisions: list[PublicationDecision],
    written: dict[str, Path] | None = None,
) -> dict[str, Any]:
    items = []
    for decision in decisions:
        items.append(
            {
                "id": decision.analysis_id,
                "slug": decision.slug,
                "state": decision.state,
                "reason_codes": list(decision.reason_codes),
                "source_kind": decision.source_kind,
                "fixture": decision.is_fixture,
                "indexable": decision.indexable,
                "robots": decision.robots,
                "review_recommendation": decision.review_recommendation,
                "human_review_status": decision.human_review_status,
                "quality_score": (decision.quality or {}).get("score") if decision.quality else None,
            }
        )
    index_count = sum(1 for d in decisions if d.state == "PUBLISHABLE_INDEX")
    comparable = []
    for rec, decision in zip(bundle.get("records") or [], decisions):
        comps = rec.get("comparisons") or []
        has_comp = False
        not_comp = False
        for item in comps:
            if isinstance(item, dict) and str(item.get("outcome") or "").upper() == "NOT_COMPARABLE":
                not_comp = True
            elif item:
                has_comp = True
        comparable.append(
            {
                "id": decision.analysis_id,
                "defensible_comparable": has_comp and not not_comp,
                "not_comparable": not_comp,
            }
        )
    live_absent = bool(bundle.get("live_absent") or bundle.get("source_kind") != "official_live")
    handoff = bundle.get("handoff") if isinstance(bundle.get("handoff"), dict) else {}
    handoff_pending = handoff.get("status") == FACTUAL_HANDOFF_PENDING or live_absent
    if handoff_pending or index_count == 0:
        recommendation = "ADJUST"
        recommendation_reason = (
            "Família e gate prontos; extra-cli #400 consumido na forma "
            "public-read-contract-analysis/1.0. FACTUAL_HANDOFF_PENDING: não há "
            "handoff official_live HANDOFF_READY com dossiê DATA_READY. "
            "index_count=0. Nenhum INDEX ativo. Não expandir. Ajustar o produtor "
            "e só então escrever análises. Matar a família se o handoff factual "
            "nunca autorizar tese defensável."
        )
    else:
        recommendation = "EXPAND"
        recommendation_reason = (
            "Há ao menos uma análise official_live aprovada individualmente. "
            "Medir citação, correção e engagement antes de escala."
        )
    allowed = set(PUBLICATION_STATES)
    return {
        "report": REPORT_STEM,
        "gate_version": GATE_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "evaluated": len(decisions),
        "evaluated_cap": MAX_CANARY,
        "source_kind": bundle.get("source_kind"),
        "catalog_mode": bundle.get("catalog_mode"),
        "claimed_live": bool(bundle.get("claimed_live")),
        "test_only": bool(bundle.get("test_only")),
        "source_path": bundle.get("source_path"),
        "schema": bundle.get("schema"),
        "export_kind": bundle.get("export_kind"),
        "live_absent": live_absent,
        "live_absent_reason": bundle.get("live_absent_reason"),
        "index_count": index_count,
        "state_counts": {
            state: sum(1 for d in decisions if d.state == state)
            for state in PUBLICATION_STATES
        },
        "states_are_closed": all(d.state in allowed for d in decisions),
        "items": items,
        "comparable": comparable,
        "has_comparable_or_not_comparable": any(
            row["defensible_comparable"] or row["not_comparable"] for row in comparable
        ),
        "rendered": sorted(
            {
                str(path.relative_to(_root())) if path.is_absolute() else str(path)
                for path in (written or {}).values()
            }
        ),
        "recommendation": recommendation,
        "recommendation_reason": recommendation_reason,
        "expand_adjust_kill": recommendation if recommendation != "STOP" else "KILL",
        "nenhum_index_ativo": index_count == 0,
        "factual_handoff_pending": handoff_pending,
        "handoff": handoff,
        "quality_version": QUALITY_VERSION,
        "written_analyses": 0 if handoff_pending else sum(
            1 for d in decisions if d.human_review_status == "HUMAN_REVIEW_PENDING"
        ),
    }


def render_markdown(status: dict[str, Any]) -> str:
    lines = [
        f"# {REPORT_STEM}",
        "",
        f"- Gate: `{status['gate_version']}`",
        f"- Generated: `{status['generated_at']}`",
        f"- Evaluated: **{status['evaluated']}** (cap {status['evaluated_cap']})",
        f"- Source: `{status['source_kind']}` (`{status.get('source_path') or 'n/d'}`)",
        f"- catalog_mode: `{status.get('catalog_mode')}` claimed_live=`{status.get('claimed_live')}`",
        f"- Fixture / test-only: **{status['test_only']}**",
        f"- official_live absent: **{status.get('live_absent')}**",
        f"- `index_count`: **{status['index_count']}**",
        f"- Recommendation: **{status['recommendation']}**",
        f"- expand/adjust/kill: **{status.get('expand_adjust_kill')}**",
        f"- nenhum INDEX ativo: **{status.get('nenhum_index_ativo')}**",
        f"- FACTUAL_HANDOFF_PENDING: **{status.get('factual_handoff_pending')}**",
        f"- Reason: {status.get('recommendation_reason')}",
        "",
        "## State counts",
        "",
        "| State | N |",
        "|---|---:|",
    ]
    for state, count in (status.get("state_counts") or {}).items():
        lines.append(f"| `{state}` | {count} |")
    lines += ["", "## Items", ""]
    for item in status.get("items") or []:
        reasons = ", ".join(item.get("reason_codes") or []) or "—"
        lines.append(
            f"- `{item['id']}` · `{item['state']}` · source=`{item['source_kind']}` "
            f"· fixture={item['fixture']} · robots=`{item['robots']}` · reasons: {reasons}"
        )
    lines += ["", "## Rendered", ""]
    for path in status.get("rendered") or []:
        lines.append(f"- `{path}`")
    lines.append("")
    return "\n".join(lines)


def write_status(status: dict[str, Any]) -> dict[str, Path]:
    root = _root()
    md_path = root / REPORT_MD
    json_path = root / REPORT_JSON
    md_path.parent.mkdir(parents=True, exist_ok=True)
    body = render_markdown(status)
    md_path.write_text(body, encoding="utf-8")
    json_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    legacy_md = root / "docs/editorial" / f"{LEGACY_STEM}.md"
    legacy_json = root / "docs/editorial" / f"{LEGACY_STEM}.json"
    legacy_md.write_text(
        f"# {LEGACY_STEM}\n\nSuperseded by `{REPORT_STEM}`.\n\n" + body,
        encoding="utf-8",
    )
    legacy_json.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"markdown": md_path, "json": json_path, "legacy_markdown": legacy_md}
