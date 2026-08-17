# Offers / manual-first contracting (#88)

Isolated from Market Answers. Not a billing engine.

- Registry: `registry.cjs` (frozen #88 / Governance#1 fixture-local)
- Flags default off: `data/offers/flags.json`
- Public serializer cannot emit Extra R$10k
- Eligibility / capacity / terms: persist-first on the existing lead store
- Sandbox adapter: fixtures only, no Asaas network, no stored key

```bash
node tests/offers/test_offers.mjs
node scripts/offers/render.cjs
```
