# Consumer guide — public-read-integrity/1.0

PREPARE-ONLY. Producer: extra-cli#436 (`8e15f94f…` deployed). Consumer issue: web-cfg#156.

```bash
node tests/public_integrity_consumer/test_consumer.mjs
```

1. Read a redacted `public-read-integrity/1.0` envelope (fixtures under `data/public-integrity-consumer/envelopes/`).
2. Stop if schema/version is not `public-read-integrity/1.0`.
3. Stop if `content_hash` does not match.
4. Stop on forbidden fields (`score`, `risk_score`, `legal_score`, `commercial_score`, `recommendation`, `legal_conclusion`, `hire`, `reject`, `index`).
5. Re-check `NO_MATCH_CONFIRMED` against coverage + empty records. Never honor a contradictory empty success.
6. Map a public view **without** `queried_cnpj`.
7. Bind the view to a CSPRNG opaque token (not derived from CNPJ) with TTL and delete path.
8. Emit attribution with `source=CONFENGE_WEB`, `asset_family=public_integrity`, asset/CTA/service IDs, aggregate state and coverage class. Never emit CNPJ or result body.

Flag `PUBLIC_INTEGRITY_CONSUMER` default is `false`. Landing and result stay `noindex`. Keyed live Portal canary is out of this wave.
