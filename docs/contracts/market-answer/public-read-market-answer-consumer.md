# Consumer guide — Market Answer Goal 03

```bash
python3 -m scripts.market_answers build
python3 -m scripts.market_answers validate
python3 -m pytest tests/market_answers -q
```

1. Read the payload via `scripts.market_answers.consume.load_payload`.
2. Stop if the schema is not `public-read-market-answer/1.0`.
3. Stop if `claimed_live` is set on a CONTRACT_FIXTURE.
4. Stop if `grain` is custo/km or any unit-price stand-in.
5. Copy producer facts. Do not recompute quartiles. Do not invent km.
6. Run `evaluate()` — INDEX is a pure function of record + payload + approval hash.
7. Render the first fold from the same adapted payload the gate saw.
8. Emit no-PII events. Source `CONFENGE_WEB`. Page view is not a lead.

Default input today: `data/editorial/market-answers/fixtures/contract-fixture.v1.json`.

Well-known live path (empty until extra-cli ships it):
`data/extra-cli/public-read-market-answer/1.0/export.json`.
