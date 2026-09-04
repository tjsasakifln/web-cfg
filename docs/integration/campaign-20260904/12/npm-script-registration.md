# Integration fragment — campaign 12 npm script registration

Owner: campaign `12` (`feat/campaign-20260904-multivertical-proof-copy-qa-v3`).
Consumer: goal 97. This campaign does not edit `package.json`.

## target_path

`package.json`

## operation

`add_scripts` (merge keys; do not replace the file).

## stable_key

`scripts.test:multivertical-proof-qa`

## proposed_keys

```json
{
  "test:multivertical-proof-qa": "node tests/commercial/test_multivertical_proof_qa.mjs",
  "report:multivertical-proof-qa": "node scripts/commercial/multivertical_proof_qa.mjs --fixtures-only"
}
```

Optional later inclusion, still owned by goal 97:

- append `&& npm run test:multivertical-proof-qa` to `scripts.test:commercial-contracts` and to `scripts.test`.

## executable_now

```bash
node tests/commercial/test_multivertical_proof_qa.mjs
node scripts/commercial/multivertical_proof_qa.mjs --fixtures-only
```

`--ref <sha>` reads contract, fixtures and client registry via `git show <sha>:path`. Missing path fails closed (`PROOF_QA_MISSING_AT_REF`); working-tree bytes are never labeled `HEAD` or `main`.

## dependency

- `data/commercial/proof-role-contract.v2.json`
- `data/commercial/proof-qa-fixtures.v2.json`
- `scripts/commercial/multivertical_proof_qa.mjs`
- `tests/commercial/test_multivertical_proof_qa.mjs`
- existing `scripts/commercial/value_first_copy_audit.mjs` (classify/extract only; not mutated)

## test

`node tests/commercial/test_multivertical_proof_qa.mjs` exits 0.

## rollback

Remove the two script keys. Revert campaign 12 files. Do not weaken `NO_APPROVED_CLIENT_PROOF` or enable CI blocking as part of rollback.
