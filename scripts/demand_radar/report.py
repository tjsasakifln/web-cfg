"""Stable Markdown view of the Demand Radar ledger."""

from __future__ import annotations

from typing import Any


def _sample(item: dict[str, Any]) -> str:
    evidence = item["evidence_sample"]
    if evidence["state"] != "OBSERVED_PAGE_EVIDENCE":
        return f"`UNKNOWN` — {evidence['reason']}"
    owner = evidence["owner_observation"]
    family = evidence.get("family_aggregate")
    family_text = ""
    if isinstance(family, dict):
        family_text = f"; family {family['impressions']} imp / {family['clicks']} clicks"
    return (
        f"owner {owner['impressions']} imp / {owner['clicks']} clicks / "
        f"pos {owner['position']}{family_text}; page evidence only"
    )


def _owner(item: dict[str, Any]) -> str:
    owner = item["owner_or_gap"]
    return owner.get("canonical_owner_url") or f"GAP:{(owner.get('gap') or {}).get('state', 'UNKNOWN')}"


def _section(title: str, items: list[dict[str, Any]]) -> list[str]:
    lines = [f"## {title}", ""]
    if not items:
        return lines + ["None.", ""]
    for index, item in enumerate(items, start=1):
        lines.extend(
            [
                f"### {index}. `{item['family_id']}` — `{item['action']}`",
                "",
                f"- Buyer job: {item['buyer_job']}",
                f"- Owner/gap: `{_owner(item)}` (`{item['owner_or_gap']['coverage_state']}`)",
                f"- Evidence/sample: {_sample(item)}",
                (
                    "- Commercial relevance: "
                    f"`{item['commercial_relevance']['level']}` — "
                    f"{item['commercial_relevance']['economic_consequence']}"
                ),
                f"- Mechanism: {item['mechanism']}",
                f"- Smallest finite next action: {item['smallest_finite_next_action']}",
                f"- Owner issue: `{item['owner_issue']}`",
                "- Authorization: advisory only; public mutation remains `false`.",
                "",
            ]
        )
    return lines


def render_markdown(ledger: dict[str, Any]) -> str:
    by_id = {item["family_id"]: item for item in ledger["opportunities"]}
    report = ledger["report"]
    actionable = [by_id[family_id] for family_id in report["actionable_now"]]
    wait = [by_id[family_id] for family_id in report["wait"]]
    research = [by_id[family_id] for family_id in report["research"]]
    source_lines = []
    for source in ledger["source_snapshots"]:
        source_lines.append(
            f"- `{source['kind']}` → `{source['id']}`; {source['records']} records; "
            f"freshness `{source['freshness']['state']}`; envelope `{source['snapshot_sha256']}`"
        )
    optional_lines = []
    for kind in (
        "KEYWORD_PLANNER",
        "GOOGLE_TRENDS",
        "SERP_RESEARCH",
        "WARMBLY_AGGREGATE_OUTCOMES",
    ):
        state = ledger["source_availability"][kind]
        if state["state"] == "USABLE":
            optional_lines.append(
                f"- `{kind}` is decision-usable from `{state['source_id']}`."
            )
        else:
            optional_lines.append(f"- `{kind}` is `UNKNOWN` — {state['reason']}")
    lines = [
        "# Minimum Viable CONFENGE Demand Radar",
        "",
        f"- **As of:** `{ledger['as_of']}`",
        f"- **Origin/main pin:** `{ledger['origin_main']}`",
        "- **Decision state:** `EXECUTE_NOW`",
        "- **Executive front:** `INBOUND_ENGINE`",
        "- **Method:** staged lexicographic decisions; no composite score",
        "- **Authority:** internal advisory only; no public mutation",
        "",
        "The engine answers which few search-market opportunities deserve engineering attention now, why, who owns the canonical answer, and which bounded action class is justified. Qualified commercial opportunities—not pages, keywords, impressions, CTR or raw leads—remain the North Star.",
        "",
        "## Source state",
        "",
        f"- Approved-source manifest: `{ledger['source_approval_manifest_sha256']}`",
        *source_lines,
        *optional_lines,
        "- Visible GSC query impressions are heavily censored/anonymized; page evidence does not establish query completeness, demand volume, conversion failure or causality.",
        "",
        "## Decision order",
        "",
        "1. Hard eligibility: buyer fit, canonical owner/gap, freeze and truth.",
        "2. First-party GSC page evidence.",
        "3. Valid Keyword Planner market breadth.",
        "4. Google Trends relative momentum.",
        "5. PII-free Warmbly QCO/proposal/contract feedback.",
        "6. Execution leverage and the 100-repetition test.",
        "7. Cannibalization, compliance and evidence risk.",
        "",
        "`UNKNOWN` remains `UNKNOWN`; it never becomes zero. CPC, if later supplied, is advertiser economics—not CONFENGE contract value. SERP research is qualitative intent/format evidence—not volume or durable rank.",
        "",
        *_section(f"ACTIONABLE_NOW ({len(actionable)}/{ledger['decision_method']['actionable_now_cap']})", actionable),
        *_section(f"WAIT ({len(wait)})", wait),
        *_section(f"RESEARCH / DEPRIORITIZE ({len(research)})", research),
        "## Repetition and rollback",
        "",
        f"{ledger['repetition_rule']} The stable outputs are this report and `data/demand_radar/ledger.v1.json`.",
        "",
        "Rollback is a revert of the internal files and package-script entries. No HTML, CSS, public JavaScript, analytics contract, measurement variable, canonical registry, conversion flow or runtime is changed.",
        "",
    ]
    return "\n".join(lines)
