# Campaign 12 handoff

`CAMPAIGN_ID=12`
`REPOSITORY=tjsasakifln/web-cfg`
`BRANCH=feat/campaign-20260904-multivertical-proof-copy-qa-v3`
`WORKTREE=/home/tjsasakifln/code/confenge/.worktrees/web-cfg/c20260904-12-proof-qa`
`BASE_SHA=89b081a8676d8a0b30747dfcb1477f21d9ac4dfb`

## Decision state

`EXECUTE_NOW` for contract/tooling/fixtures/report-only QA.
`BLOCKED_EXTERNAL` remains for #328 client proof.
`DEFERRED` for live HTML claim adjacency (#531 residual) and public credential copy (#581).
Ratchet: `ITERATE`. Corpus: `AWAITING_HUMAN_ANNOTATION`.

## WRITE_SET

- `data/commercial/proof-role-contract.v2.json`
- `data/commercial/proof-qa-fixtures.v2.json`
- `scripts/commercial/multivertical_proof_qa.mjs`
- `tests/commercial/test_multivertical_proof_qa.mjs`
- `docs/commercial/multivertical-proof-qa-annotation-protocol.md`
- `docs/integration/campaign-20260904/12/npm-script-registration.md`
- `docs/integration/campaign-20260904/12/handoff.md`

## DO_NOT_TOUCH_SET

Public HTML/copy, credentials, taxonomy, offer registry, `package.json`, lockfiles, `.github/**`, Makefile, global scripts, CI, `value-first-copy-contract.v1.json`, `real-proof-registry.v1.json`, `permissioned-proof-registry.json`.

## Consumed contracts

- `data/commercial/value-first-copy-contract.v1.json` (eight roles, frozen baseline; not mutated)
- `data/site/permissioned-proof-registry.json` (`NO_APPROVED_CLIENT_PROOF`)
- `data/organic/public-family-registry.json` (route census reuse)

## Goal 99 command

```bash
node scripts/commercial/multivertical_proof_qa.mjs --fixtures-only
```
