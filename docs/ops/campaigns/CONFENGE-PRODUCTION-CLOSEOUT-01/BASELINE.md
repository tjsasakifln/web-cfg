# CONFENGE-PRODUCTION-CLOSEOUT-01 — web-cfg baseline

Approval: `OWNER_CONDITIONAL_PREAPPROVAL_CONFENGE_PRODUCTION_CLOSEOUT_01`

## Git / deploy

| Field | Value |
|---|---|
| origin/main | `909621a058b6cdd2402a8eb5192e4c645b45bd97` |
| Live production | SAME SHA |
| Deploy ID | `6a8288253ff743000806c523` |
| build_time | `2026-08-17T04:04:03Z` |
| artifact_hash | `f28cf8242e7eff5483062cf1716e8e0ca6e61b6823f6fa46d8bba360922f491e` |
| manifest_hash | `7af29bc628151a7c5439a66c80797a50d2117c8c49cb595a7771685ab3b6a59a` |
| Canonical | `https://confenge.com.br` (www → apex 301, Netlify) |

Lane C deploy-of-main is already LIVE_PROVEN. Do not redeploy the same SHA for theater.

## Open PRs

| PR | State | Decision |
|---|---|---|
| #104 `feat/web-011-margin-defense-dod` | MERGEABLE, unique DoD auditor | Rebase + suite; merge if green |
| #102 `feat/web-032-paid-search-canary` | CONFLICTING, paid search no-spend | DEFER/SUPERSEDED — do not merge |
| #93 #92 dependabot | MERGEABLE | Out of path; leave |

## Critical issues (keep open)

#60 #62 #83 #84 #88 remain OPEN. Owner canary cannot close #60/#88.

## Robots

`Disallow: /analises-contratos-publicos/` — contract-analysis family stays noindex until official_live INDEX canary.

## Credentials

| Item | State |
|---|---|
| Netlify CLI / NETLIFY_AUTH_TOKEN | AUSENTE |
| GH token | PRESENTE |
| Inbound webhook secret on Netlify | UNKNOWN (cannot read; do not invent) |
