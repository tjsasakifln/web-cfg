# public-integrity consumer (PREPARE-ONLY)

Fail-closed consumer of extra-cli `public-read-integrity/1.0` (CEIS/CNEP).

```bash
node tests/public_integrity_consumer/test_consumer.mjs
```

- Flag `PUBLIC_INTEGRITY_CONSUMER` default **false**.
- Fixtures under `data/public-integrity-consumer/envelopes/` are the only data proof in this wave.
- Public output never copies `queried_cnpj`.
- `NO_MATCH_CONFIRMED` only when both contracted sources complete empty.

Do not run a keyed live Portal canary from this repository. See
`docs/ops/campaigns/CONFENGE-WEB-PUBLIC-INTEGRITY-CONSUMER-PREPARE-01/KEYED_LIVE_CANARY.md`.
