# Handoff — PR #524 GitHub Actions pins

CAMPAIGN_ID=01
SOURCE_PR=524
SOURCE_BRANCH=dependabot/github_actions/github-actions-f5d76be6fc
SOURCE_COMMIT=909ca8a1ee40d76b89bea4c6034b1e6e91d5c07e
SOURCE_TREE=a8ea0d119266099af099b1dfe9418814dc0a7be1
AUDITED_MAIN_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb
DECISION=DEPENDABOT_REFRESH_OR_CLOSE
DO_NOT_IMPLEMENT_ON_CAMPAIGN_01=YES

## Intent

Do not accumulate an ownerless Dependabot PR. Do not merge `#524`. The required
checks on this head are red, and `actions/download-artifact` v7 → v8.0.1 is a
major bump unproven on current main.

## Proposed pins (from the source PR; not applied here)

| target_path | operation | stable_key | from (main) | to (PR #524) |
| --- | --- | --- | --- | --- |
| .github/workflows/codeql.yml | pin-refresh | codeql-action-v4 | github/codeql-action/init@db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28 | github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938 |
| .github/workflows/codeql.yml | pin-refresh | codeql-action-analyze-v4 | github/codeql-action/analyze@db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28 | github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938 |
| .github/workflows/netcup-release.yml | major-unproven | download-artifact-v8 | actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7 | actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1 |

`site-ci.yml` and `pseo.yml` are untouched by `#524`. The 2026-09-04 failures
(`Lighthouse local (_site)`, `Full test suite`) ran on the stale PR tree, not
on a current-main replay of these two files.

## Dependency

Goal 97 owns shared workflow pins. Replay onto current main; do not reuse the
Dependabot branch.

## Test

On a branch based on current `origin/main` that contains only the chosen pins:

- `npm run test:workflow-gates`
- `npm ci --engine-strict`
- GitHub conclusions for `site-ci` and `pSEO quality gates` (required)
- netcup-release dry path if download-artifact v8 is included: artifact name
  `site-ci-public-${{ github.sha }}` must still download

## Rollback

Revert the two workflow files. `#524` itself is not merged.

## Destination

goal 97. Not campaign 01 (unproven major + red checks on the source head).
