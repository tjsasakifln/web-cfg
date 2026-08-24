# Conversion layer (#88)

Shared intent → next action → persist-first handoff.

- Matrix: `docs/contracts/intent-action/intent-action-matrix.v1.json`
- Agenda activation gate (#248): `agenda-gate.cjs` — `DEFER` until an atomic,
  dated Warmbly #55 baseline; SLA remains `UNKNOWN`.
- Isolated intake: `netlify/functions/market-answer-intake.cjs`
- Adapter (does not edit PR #85 libs): `adapter.cjs`
- Tests: `tests/conversion/test_conversion.mjs` and
  `tests/conversion/test_agenda_gate.mjs`

```bash
npm run test:conversion
node scripts/conversion/dump-matrix.cjs
node scripts/conversion/run-intake.cjs --action xray --cnpj 11222333000181 --idempotency-key demo-1 --store-dir /tmp/conv-store
```

Canary page (noindex, `/piloto/`): `/piloto/conversao-xray/`. Flag: `data/conversion/canary-flag.json`.
