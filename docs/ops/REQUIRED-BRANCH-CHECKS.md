# Required branch checks for `main`

**Status: APPLIED (API)** — 2026-08-04

Live branch protection (GitHub API) on `main`:

- `strict: true`
- required contexts: **`site-ci`**, **`pSEO quality gates`**

Human should still **confirm once in the UI** that the same two names appear under Settings → Branches. That UI glance is the only remaining human step for protection — not a pending API change.

Related report: `docs/ops/RESTORE-GREEN-MAIN-REPORT.md`.

## Why this exists

PR #6 (`lighthouse` 13.4.1) left `pSEO quality gates` red while `site-ci` could still appear green (soft `npm ci || npm install`). The pSEO check was not required, so a broken central gate could merge.

## GitHub UI path (verify, not re-apply)

1. `https://github.com/tjsasakifln/web-cfg/settings/branches`
2. Rule for `main` → **Require status checks to pass before merging**
3. **Require branches to be up to date before merging** (recommended; API uses strict)
4. Status checks required must be exactly:

| Required | Workflow file | Job id | Check context name |
|----------|---------------|--------|--------------------|
| **Yes** | `.github/workflows/site-ci.yml` | `gates` | **`site-ci`** |
| **Yes** | `.github/workflows/pseo.yml` | `pseo` | **`pSEO quality gates`** |
| No (soft) | `.github/workflows/codeql.yml` | `analyze` | `Analyze` (matrix) |

CodeQL uses `continue-on-error: true` until code scanning is enabled under **Settings → Code security**. Do not rely on CodeQL alone as a merge blocker.

## Repo-controlled guarantees (on `main`)

- Both workflows run on **pull_request** → `main` and **push** → `main`
- Install is hard **`npm ci`** (no `|| npm install`)
- No `continue-on-error: true` on site-ci / pSEO central fail paths
- Shape asserted by `python3 scripts/site/test_workflow_gates.py` / `npm run test:workflow-gates`

## Controlled red/green proof (local)

```bash
# Green (config healthy)
python3 scripts/site/test_workflow_gates.py

# Deliberate red
WORKFLOW_GATE_FORCE_FAIL=1 python3 scripts/site/test_workflow_gates.py
# → exit 1

# Restore green
python3 scripts/site/test_workflow_gates.py
```

## Protection update log

| When | What |
|------|------|
| 2026-08-04 | API set required checks during restore; finalized to **`site-ci`** + **`pSEO quality gates`** (strict) after PR #42 landed |
| 2026-08-04 | PR #41–#44 merged; production `build-info.json` commit matches `main` tip after #44 |

## What is not claimed

- Screenshot of the GitHub UI (only API read-back was proved in this workstream)
- CodeQL as a hard required check
- That future Dependabot PRs will stay green without Node/engine alignment


## Product quality bar inside `site-ci` (Story 1.3 / UX-02)

GitHub required contexts remain **`site-ci`** + **`pSEO quality gates`**. The following are **non-bypass product gates** executed inside `site-ci` (merge cannot skip them without failing the job):

| npm script | Role |
|------------|------|
| `test:design` | Design + visitor redesign gates (forbidden_patterns, journeys) |
| `test:copy` | Public copy / jargon bar |
| `test:brand` | Brand shell / logo contract |
| `test:form-funnel` | Multi-step form structural + analytics scrub |
| `test:lead-function` | Persist-first lead API |
| `test:lead-store-production` | Production fail-closed store (Story 1.1) |
| `test:ops-auth` | Ops unauth matrix (Story 1.2) |
| `test:inbound-gates` | Inbound SEO honesty |
| `organic:test` | SINAPI snippet + BOFU commercial-bridge evaluators against live HTML |
| `test:diagnose-margin` | Money-asset SELECT-only consume, UNKNOWN honesty, lead/event path |

**Gates are law:** do not weaken `forbidden_patterns` or design/copy scripts without an ADR note under `_reversa_sdd/adrs/` or `docs/`.

Developer note also in `docs/DESIGN-SYSTEM.md` §Gates.
