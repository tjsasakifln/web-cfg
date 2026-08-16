# INTEGRATION_NOTES — extra-cli Goals 03 / 05 / 07

Consumer: `tjsasakifln/web-cfg` #84, family `scripts/market_answers`.
Date: 2026-08-16.

This canary does **not** wait for extra-cli #400 / #415 / #302 live
`official_live`. Those issues remain OPEN. Do not treat this preview as
DATA_READY-for-index.

## Goal 03 — Public Market Answer payload

Expected schema: `public-read-market-answer/1.0`
(`docs/contracts/market-answer/public-read-market-answer-v1.json`).

Named consumer: `web-cfg / market-answer / valor-típico-contratos-pavimentacao`.

When extra-cli exports the official pack, drop it at
`data/extra-cli/public-read-market-answer/1.0/export.json` with
`official_live=true`, authorized claim, coverage/freshness, producer SHA and
content hash. Re-run:

```bash
python3 -m scripts.market_answers build
python3 -m scripts.market_answers validate
```

A fixture sitting in the live path is not promoted. `claimed_live` on a
fixture is a consume error.

## Goal 05 — Peer groups / personalization plane

extra-cli #415 (`comparable-contracts/1.0`) is the statistical engine for
“o que é normal?”. This canary copies `peer_group` as written. Current
fixture status: `HOLD_FOR_DATA` / `official_peer_group_absent`.

B2G X-Ray (`web-cfg / b2g-xray`) is **not** built here. The page only models
the CTA “Veja sua empresa neste mercado” and emits `xray_start`. No CNPJ
profiles, no combinatorial URLs.

## Goal 07 — Ask / living intelligence / denominator honesty

Ask CONFENGE and living-intelligence diffs stay DEFER. This slice does not
open a public ask box or watchlist.

extra-cli #302 (national publishing-org denominator) is still the authority
for any Brasil/nacional claim. The canary forbids national claim without
`coverage.status=SUFFICIENT`. Fixture coverage is `INSUFFICIENT`.

## Honest state of this branch

- extra-cli #400/#415/#302 live official market-answer payload: **absent**
- recommendation: **GO_NOINDEX** (experience testable, index blocked)
- do not close web-cfg #84
