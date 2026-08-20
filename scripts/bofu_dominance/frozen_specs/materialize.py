"""Write exclusive-tree snapshots, hashes and hash-bound patches. Does not write pillar HTML."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.bofu_dominance.frozen_specs.constants import (
    CAMPAIGN,
    CORRESPONDING_ISSUE,
    DATA_DIR,
    DOCS_DIR,
    EARLIEST_SAFE_ACTION_AT,
    PILLAR_SLUGS,
    ROOT,
    html_path,
    spec_path,
)
from scripts.bofu_dominance.frozen_specs.hashing import content_sha256, forbidden_path_hashes
from scripts.bofu_dominance.frozen_specs.patch import write_patch_file
from scripts.bofu_dominance.frozen_specs.snapshot import snapshot_pillar, write_snapshots_json
from scripts.bofu_dominance.frozen_specs.spec_templates import TEMPLATES


def _replacements() -> dict[str, list[dict[str, str]]]:
    doc = json.loads((DATA_DIR / "proposed-replacements.json").read_text(encoding="utf-8"))
    return {
        slug: [{"before": r["before"], "after": r["after"]} for r in items]
        for slug, items in doc["pillars"].items()
    }


def _md_list(items: list[Any]) -> str:
    lines = []
    for item in items:
        if isinstance(item, dict):
            url = item.get("url") or item.get("query") or item.get("block") or ""
            extra = item.get("kind") or item.get("gsc") or item.get("why") or item.get("note") or ""
            lines.append(f"- `{url}` — {extra}".strip(" —"))
        else:
            lines.append(f"- {item}")
    return "\n".join(lines)


def _write_spec_markdown(spec: dict[str, Any]) -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    snap = spec["snapshot"]
    gsc = spec["gsc_precondition"]
    body = f"""# Frozen spec: {spec['path']}

**Campaign:** {spec['campaign']}  
**Mode:** PREPARE-ONLY. `html_mutation=false`. Do not apply the `.patch.txt` before the gate.  
**Corresponding issue:** #{spec['corresponding_issue']} (`{spec['issue_128_baseline']['state']}`)  
**`earliest_safe_action_at`:** `{spec['earliest_safe_action_at']}`  
**Decision state:** P1 / VALIDATE / INBOUND ENGINE. Leverage: revenue + distribution.

## Visitor job

{spec['visitor_job']}

## HTML snapshot (live, hash-bound)

| Field | Value |
|---|---|
| title | {snap['title']} |
| meta | {snap['meta_description']} |
| H1 | {snap['h1']} |
| canonical | {snap['canonical'] or '*(empty)*'} |
| robots | {snap['robots']} |
| schema | {', '.join(snap['schema_types'])} |
| og:title | {snap['og_title']} |
| content_sha256 | `{snap['content_sha256']}` |
| hero CTA | {snap['cta']['hero_text']} → `{snap['cta']['hero_href']}` |
| when-not-to-hire | {snap['cta']['when_not_to_hire']} |

## Demand-control / #128 / extra-cli

- PR #159: `authorizes_html_edit={spec['demand_control_citation']['authorizes_html_edit']}`, `source_kind={spec['demand_control_citation']['source_kind']}`, BOFU `observe_only`, `earliest_safe_action_at={spec['demand_control_citation']['earliest_safe_action_at']}`.
- Issue #128: commercial click share `{spec['issue_128_baseline']['commercial_click_share']}`, GSC row {spec['issue_128_baseline']['gsc_row']}, state `{spec['issue_128_baseline']['state']}`.
- extra-cli PR #435 COMPARABLE `publication_authorization=false`; PR #437 PARTIAL `national_claim_authorized=false`. Factual inputs only.

## GSC precondition

- `gsc_live_available`: `{gsc['gsc_live_available']}`
- Other-evidence decision: `{gsc['other_evidence_decision']['decision']}`
- Invented live metrics: `{gsc['other_evidence_decision']['invented_live_metrics']}`

## SERP census ({spec['serp_census']['family']})

Rank status: **{spec['serp_census']['rank_status']}**. {spec['serp_census']['note']}

Competitors:

{_md_list(spec['serp_census']['competitors'])}

Intent gaps:

{_md_list(spec['serp_census']['intent_gaps'])}

## Query ownership / negatives / cannibalization

Owned: {_md_list(spec['query_ownership'].get('owned') or [])}

Negatives:

{_md_list(spec['negative_queries'])}

Cannibalization: `{spec['cannibalization']['status']}`

{_md_list(spec['cannibalization'].get('siblings') or [])}

## Before → after by block

{_md_list(spec['before_after_blocks'])}

Exact replacements: `data/bofu-dominance/frozen-specs/patches/{spec['slug']}.patch.txt` (hash-bound; never `git apply` in this campaign).

## Evidence / proof needed

{_md_list(spec['evidence_proof_needed'])}

## Success / kill / revert

- Success: {spec['success_metrics']['service_url_clicks']}
- Kill: {spec['kill_metrics']['bridges_and_snippet_shipped_service_clicks_still_zero']}
- Revert: {spec['revert_metrics']['trigger']}

ADR: [ADR-STRAT-002](../../../architecture/ADR-STRAT-002-confenge-canonical-public-surface.md).
"""
    (DOCS_DIR / f"{spec['slug']}.md").write_text(body, encoding="utf-8")


def _write_index_markdown(spec_files: list[str]) -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Frozen BOFU pillar specs (PREPARE-ONLY)",
        "",
        "Campaign `CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01`. Exclusive trees only.",
        "This campaign **must not** mutate pillar HTML, `script.js`, CSS, analytics, sitemap, robots, redirects, content-service-map or offer code.",
        "",
        f"- `earliest_safe_action_at`: `{EARLIEST_SAFE_ACTION_AT.isoformat()}`",
        f"- corresponding issue: #{CORRESPONDING_ISSUE} `LANDED_AWAITING_LIVE_EVIDENCE`",
        "- PR #159: `authorizes_html_edit=false`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`",
        "- extra-cli #435 COMPARABLE / #437 PARTIAL: `publication_authorization=false` / `national_claim_authorized=false`",
        "",
        "## Specs",
        "",
    ]
    for slug in PILLAR_SLUGS:
        lines.append(f"- [{slug}]({slug}.md) — `/{slug}/`")
    lines += [
        "",
        "## Apply gate",
        "",
        "Application is refused while `now < 2026-09-16` **and** issue #128 is not evidentially closed.",
        "Shipped entry: `python3 -m scripts.bofu_dominance.frozen_specs` (mutate always false here).",
        "",
    ]
    (DOCS_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")


def materialize(*, root: Path | None = None) -> dict[str, object]:
    base = root or ROOT
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    snaps = write_snapshots_json(DATA_DIR / "snapshots.json", base)
    hashes = {p["slug"]: p["content_sha256"] for p in snaps["pillars"]}
    hashes_doc = {
        "schema": "bofu_frozen_hashes/v1",
        "campaign": CAMPAIGN,
        "html_mutation": False,
        "pillars": hashes,
        "forbidden": forbidden_path_hashes(base),
    }
    (DATA_DIR / "hashes.json").write_text(
        json.dumps(hashes_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    repl = _replacements()
    patch_files = []
    spec_files = []
    for slug in PILLAR_SLUGS:
        dest = write_patch_file(slug, repl[slug], base)
        patch_files.append(str(dest.relative_to(ROOT)))
        live = content_sha256(html_path(slug, base))
        parsed_hash = None
        for line in dest.read_text(encoding="utf-8").splitlines():
            if line.startswith("content_sha256:"):
                parsed_hash = line.split(":", 1)[1].strip()
        if parsed_hash != live:
            raise RuntimeError(f"patch hash mismatch for {slug}")
        spec = dict(TEMPLATES[slug])
        spec["snapshot"] = snapshot_pillar(slug, base)
        target = spec_path(slug)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        spec_files.append(str(target.relative_to(ROOT)))
        _write_spec_markdown(spec)
    _write_index_markdown(spec_files)
    specs = [json.loads((ROOT / p).read_text(encoding="utf-8")) for p in spec_files]
    census = {
        "schema": "bofu_frozen_serp_census/v1",
        "as_of": "2026-08-19",
        "rank_invention": False,
        "families": {
            s["slug"]: {
                "family": s["serp_census"]["family"],
                "rank_status": s["serp_census"]["rank_status"],
                "note": s["serp_census"]["note"],
                "competitors": s["serp_census"]["competitors"],
                "intent_gaps": s["serp_census"]["intent_gaps"],
            }
            for s in specs
        },
    }
    own = {
        "schema": "bofu_frozen_query_ownership/v1",
        "as_of": "2026-08-19",
        "pillars": {
            s["slug"]: {
                "query_ownership": s["query_ownership"],
                "negative_queries": s["negative_queries"],
                "cannibalization": s["cannibalization"],
            }
            for s in specs
        },
    }
    (DATA_DIR / "serp-census.json").write_text(
        json.dumps(census, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (DATA_DIR / "query-ownership.json").write_text(
        json.dumps(own, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "html_mutation": False,
        "snapshots": str((DATA_DIR / "snapshots.json").relative_to(ROOT)),
        "hashes": str((DATA_DIR / "hashes.json").relative_to(ROOT)),
        "patches": patch_files,
        "specs": spec_files,
        "earliest_safe_action_at": EARLIEST_SAFE_ACTION_AT.isoformat(),
        "corresponding_issue": CORRESPONDING_ISSUE,
        "docs_dir": str(DOCS_DIR.relative_to(ROOT)),
    }


if __name__ == "__main__":
    print(json.dumps(materialize(), indent=2, ensure_ascii=False))
