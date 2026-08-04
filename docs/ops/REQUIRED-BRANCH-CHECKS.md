# Required branch checks for `main`

**Status: PENDING HUMAN** — this repository cannot prove that GitHub branch
protection was updated from the agent environment. Do not treat this file as
evidence that protection is already active.

## Why this exists

PR #6 (lighthouse 13.4.1) left `pSEO quality gates` red while `site-ci` could
still appear green (soft `npm ci || npm install`). The pSEO check was not a
required status check, so the PR merged with a broken central gate.

## GitHub UI path

1. Open `https://github.com/tjsasakifln/web-cfg`
2. **Settings** → **Branches** → branch protection rule for `main`
   - Direct: `https://github.com/tjsasakifln/web-cfg/settings/branches`
3. Edit the rule for `main` (or create one if missing)
4. Enable **Require status checks to pass before merging**
5. Enable **Require branches to be up to date before merging** (recommended)
6. Under **Status checks that are required**, add exactly the check names below
7. Save changes
8. Open a trivial PR and confirm both checks appear as required (not optional)

## Exact check names to require

These match the stable `name:` fields on the workflow jobs (not the workflow
file basename alone):

| Required | Workflow file | Job id | Check context name |
|----------|---------------|--------|--------------------|
| **Yes** | `.github/workflows/site-ci.yml` | `gates` | **`site-ci`** |
| **Yes** | `.github/workflows/pseo.yml` | `pseo` | **`pSEO quality gates`** |
| Optional / policy | `.github/workflows/codeql.yml` | `analyze` | `Analyze` (or matrix variant) |

CodeQL currently uses `continue-on-error: true` until code scanning is enabled
in org/repo **Settings → Code security**. Do not rely on CodeQL alone to block
insecure merges while it is soft-fail; keep `site-ci` + `pSEO quality gates`
as the hard merge blockers.

## Repo-controlled guarantees (already in workflows)

After the gate-hardening PR:

- Both workflows run on **pull_request** targeting `main` and **push** to `main`
- Install is hard **`npm ci`** (no `|| npm install` soft fallback)
- No `continue-on-error: true` on site-ci / pSEO central jobs
- Shape asserted by `python3 scripts/site/test_workflow_gates.py` (also via
  `npm run test:workflow-gates`)

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

A PR that breaks workflow shape or reintroduces soft install will fail
`test:workflow-gates` inside site-ci / npm test once that script is wired.

## What is not claimed

- Branch protection API/UI was **not** modified by automation in this workstream
unless a human confirms in a later commit/note with screenshot or API evidence
- Netlify deploy previews and production smoke are separate from merge checks


## Protection update (2026-08-04)

Required contexts on main (API): `site-ci`, `pSEO quality gates`.
