# Market Answer canary (#84)

One answer-first question:

> Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?

```bash
python3 -m scripts.market_answers build
python3 -m scripts.market_answers validate
python3 -m scripts.market_answers validate --fail-on-stale
python3 -m pytest tests/market_answers -q
```

Freshness uses a real UTC clock (`datetime.now(timezone.utc)`). Tests and replay inject `--now` / `MARKET_ANSWER_NOW`. Classes: `CURRENT | EXPIRING | STALE | UNKNOWN`. Operational re-evaluation: `.github/workflows/market-answer-freshness.yml`. See `docs/editorial/MARKET_ANSWER_FRESHNESS.md`.

- Adapter: `consume.py` (Goal 03 schema, fixture vs official_live)
- Score: `score.py` (`MARKET_ANSWER_VALUE_SCORE/1.0`)
- Gate: `gate.py` (fail-closed INDEX)
- Render: `render.py` (`inteligencia/valor-tipico-contratos-pavimentacao/`)
- Events: `events.py` + `assets/js/market-answer.js`
- Status: `docs/editorial/MARKET_ANSWER_CANARY_STATUS.{json,md}`

The labeled fixture is `official_live=false` /
`producer_status=CONTRACT_FIXTURE`. It cannot become `PUBLISHABLE_INDEX`.
Do not close #84.
