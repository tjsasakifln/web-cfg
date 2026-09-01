"""Human reports for the BOFU-CORE ledger."""

from __future__ import annotations

from typing import Any

from scripts.bofu_dominance.core.constants import CAMPAIGN, MAX_NEXT_ACTIONS, SLOT


def render_report(status: dict[str, Any]) -> str:
    families = status["families"]
    counts = status.get("state_counts") or {}
    live = status["gsc_live"]
    lines = [
        f"# BOFU intent dominance — {SLOT}",
        "",
        f"**Campaign:** `{status.get('campaign') or CAMPAIGN}`",
        f"**As of:** {status['as_of']}",
        f"**Git head (origin/main pin):** `{status.get('origin_main')}`",
        f"**Decision state:** VALIDATE (ledger) / EXECUTE_NOW (honesty gates)",
        f"**Leverage:** distribution, data, trust",
        f"**Time to evidence:** this PR for the ledger; `gsc_live_state` is `{status['gsc_live_state']}`",
        f"**North Star:** inbound qualified pipeline / month — not page count",
        "",
        "## Visitor job",
        "",
        "An operator deciding BOFU work needs one ledger that says, for each",
        "commercial family: which job, which canonical URL, which state, what",
        "evidence exists, what overlaps, and what is the next test or kill —",
        "without converting historical CSV or SERP samples into live rank.",
        "",
        "## GSC live",
        "",
        f"- `gsc_live_state`: `{status['gsc_live_state']}`",
        f"- recommendation: `{live.get('recommendation')}`",
        f"- Actions run: `{live.get('actions_run_id')}`",
        f"- rows (top-set only): `{live.get('rows')}` as_of `{live.get('as_of')}`",
        f"- core ready_for_product_decisions: `{live.get('ready_for_product_decisions')}`",
        f"- committed main last_sync: `{live.get('committed_main_last_sync')}`",
        "",
        (
            "Credentials are proven by isolated job `gsc` on run "
            f"`{live.get('actions_run_id')}`."
            if status.get("gsc_live_state") == "LIVE_JOB_OK"
            else "Live GSC remains blocked until a successful isolated `gsc` job is recorded."
        ),
        "The 2026-08-09 CSV, redacted snapshots and SERP samples are **not** this",
        "live pull. Top-rows-only, date gaps, mixed device and non-BR geo do not",
        "authorize TOP* or HTML. Merged PR #159 is historical implementation, not",
        "an operational owner or rank claim. Absence from returned top rows is not ranking zero.",
        "",
        "## Coverage",
        "",
        f"- families: **{status['family_count']}** (100% owner/state/reason)",
        f"- state counts: {', '.join(f'`{k}`={v}' for k, v in sorted(counts.items()))}",
        f"- P0/P1 census missing: {status['census_summary']['p0_p1_missing_census'] or 'none'}",
        f"- official SERP position claimed: `{status['census_summary']['official_position_claimed']}`",
        "",
        "## Families",
        "",
        "| ID | P | State | Owner | Issue | Reason | Edit now |",
        "|---|---|---|---|---:|---|---|",
    ]
    for item in families:
        rec = item["recommendation"]
        owner = item.get("owner") or "—"
        lines.append(
            "| `{id}` | {p} | `{state}` | `{owner}` | {issue} | {reason} | {edit} |".format(
                id=item["id"],
                p=item["priority"],
                state=item["state"],
                owner=owner,
                issue=item.get("active_issue") or "—",
                reason=item["reason"],
                edit="no" if not rec.get("authorizes_html_edit") else "YES",
            )
        )
    lines.extend(
        [
            "",
            "Frozen families stay FROZEN even when live top-rows show Spain/Chile",
            "impressions or mixed devices. That is not a BR TOP* and not edit-now.",
            "",
            "## Dependency graph",
            "",
            "Issues #61, #128, historical #151–#155, open #156 and PRs #157–#159 remain provenance nodes.",
            "",
            "- **#128** owns the six frozen pillars.",
            "- The `web-cfg/attribution-contract` owns origin→service; closed #153 is historical.",
            "- Closed #155 is a historical no-demand-evidence gap; open #156 is externally blocked.",
            "- Closed-unmerged PR #157 remains a canary reference, not a BOFU family.",
            "- Merged PR #158 is historical Data Desk implementation; this ledger is not a second registry.",
            (
                "- Merged **PR #159** is the historical observability implementation. "
                f"`gsc_live_state` is `{status['gsc_live_state']}`; "
                "top-row evidence still does not authorize rank or demand claims."
            ),
            "",
            "## SERP census",
            "",
            "Up to four queries per P0/P1 family. Organic URLs are a **web_search_api",
            "sample** with `ranking_context=UNKNOWN`, `personalization=UNKNOWN`,",
            "`geo=UNKNOWN`, `device=UNKNOWN`. Local pack, paid and SERP features are",
            "separated as `UNKNOWN` — they were not observed as distinct objects.",
            "No evasive scraping. No single-query official position.",
            "",
            "Notable sample facts (not ranks):",
            "",
            "- `aditivos obras públicas` collides with *concrete admixture* intent.",
            "- `glosa de medição obra pública` showed the owned article `/conteudos/glosa-de-medicao-obra-publica/`, not the pillar.",
            "- `diagnóstico pré-licitação` and `diagnóstico B2G 360°` showed CONFENGE service URLs in this sample.",
            "- `bdi diferenciado obra pública` showed `/auditoria-orcamento-licitacao/` in this sample.",
            "- `prontidão licitação` / CEIS-CNEP samples did not show a CONFENGE landing (GATED).",
            "",
            "## What this slot does not do",
            "",
            "- Recreate the Organic Opportunity Engine.",
            "- Edit HTML, analytics, sitemaps, offers or package files.",
            "- Convert historical GSC, redacted snapshots or SERP samples into live rank.",
            "- Open a second Data Desk target registry.",
            "- Treat historical PRs or closed issues as current operational owners.",
            "",
            "## Rollback",
            "",
            "Revert this PR. No public HTML changed.",
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def render_next_actions(status: dict[str, Any]) -> str:
    actions = status["next_actions"]
    if len(actions) > MAX_NEXT_ACTIONS:
        raise ValueError("next actions exceed cap")
    lines = [
        "# Next actions — BOFU-CORE",
        "",
        f"Maximum five. Frozen state **refuses** edit-now. Count: {len(actions)}.",
        "",
    ]
    for index, item in enumerate(actions, start=1):
        lines.append(f"## {index}. `{item['id']}` — {item['action']}")
        lines.append("")
        lines.append(item["summary"])
        lines.append("")
        lines.append(f"- authorizes_html_edit: `{item.get('authorizes_html_edit')}`")
        if item.get("earliest_safe_action_at"):
            lines.append(f"- earliest_safe_action_at: `{item['earliest_safe_action_at']}`")
        if item.get("refs"):
            lines.append(f"- refs: {', '.join(item['refs'])}")
        lines.append("")
    lines.extend(
        [
            "## Stop",
            "",
            "- Do not edit #128 HTML before 2026-09-16.",
            "- Do not publish a #155/#156 landing from this slot.",
            "- Do not treat top-row GSC evidence as comparable demand or rank.",
            "",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"
