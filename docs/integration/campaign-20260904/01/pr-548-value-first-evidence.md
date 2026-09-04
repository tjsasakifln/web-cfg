# Handoff — PR #548 value-first evidence (not HTML)

CAMPAIGN_ID=01
SOURCE_PR=548
SOURCE_BRANCH=feat/issue-528-money-pages-value-first-v2
SOURCE_COMMIT=4c827c5fbf737c25d475ebca2b56a8e0a5cad7c3
SOURCE_TREE=1093b4fff883a813021d3ce6f88dc932e8d74a63
AUDITED_MAIN_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
DECISION=SUPERSEDED_CLOSE
HTML_MERGE=REJECTED
DO_NOT_IMPLEMENT_ON_CAMPAIGN_01=YES

## Intent

Preserve the unique QA screenshot tree so issue `#528` can compare value-first
folds after `#577`/`#582`. Do not merge PR `#548`. Do not port money-page HTML,
nav, or the contract-defense renderer from this head — two-dot vs current main
would strip `cta-form-next-state` wiring already on main.

## Already on main (byte-identical)

- `data/site/brand.json`
- `data/commercial/value-first-copy-contract.v1.json`
- `scripts/site/render_nav_hubs.py`

H1s on the eight money pages already match current main. Main HTML is larger.

## Residual paths (evidence only)

| target_path | operation | stable_key |
| --- | --- | --- |
| docs/qa/issue-528-money-pages-value-first/ | preserve-tree | issue-528-qa-evidence |

Read from `SOURCE_TREE`. Do not copy onto this campaign branch.

## Dependency

Issue `#528` remains open. Copy/HTML owners are `#577`/`#582`. B2G stays a
protected vertical; this is not permission to drop B2G value-first copy, only
to refuse the fossil HTML.

## Test

Do not apply. If a later campaign ports copy (not this HTML), re-run
`npm run test:value-first-copy` and first-fold contracts on current main.

## Rollback

n/a — not applied.

## Destination

issue `#528` after `#577`/`#582`. Goal 97 may attach the screenshot tree; it
must not merge the PR as a unit.
