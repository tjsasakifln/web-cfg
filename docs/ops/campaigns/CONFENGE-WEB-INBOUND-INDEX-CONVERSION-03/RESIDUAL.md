# RESIDUAL — CONFENGE-WEB-INBOUND-INDEX-CONVERSION-03

| Item | Class | Note |
|---|---|---|
| Production index proof | `LIVE_PROVEN` | Two probes on `6cc46a1a` / deploy `6a8351c558fa180008f11b16`: 200, index,follow, sitemap loc, Santa Catarina copy. |
| Discovery / GSC | `DISCOVERY_PENDING` | Do not close #84. |
| Real lead / outcome | `UNKNOWN` | #60/#64 stay open. No synthetic lead treated as real. |
| HMAC Netlify sender | `BLOCKED` | Token absent this session. Does not block code/merge. |
| extra-cli #302 country-wide | `UNKNOWN` | Still required for any national claim. Not a SC blocker. |
| extra-cli #415 comparables | `UNKNOWN` | Remain NOT_COMPARABLE. |
| Asaas production | `NO_GO` | Flags off. No product/customer/subscription/payment. |
| Extra R$10k public | `NO_GO` | Private exception only. |
| Terms legal validation | `UNKNOWN` | Snapshot is preview, not counsel-approved. |
| Warmbly #47 live ingest | `UNKNOWN` | Local event contract only; feature-gated. |
| INBOUND NOW / receita | `NO_GO` | Fixtures are not pipeline. |

## Runbook if deploy is blocked

1. Merge to `main` when CI is green.
2. Existing Netlify production build: GitHub `main` → `npm run build:site` (see `netlify.toml`).
3. Do not paste tokens in logs or PRs.
4. Probe twice: `curl -sSI https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/` and `npm run test:production-cutover`.
5. Confirm `/.well-known/build-info.json` (or equivalent) commit, robots `index,follow`, sitemap loc, Santa Catarina copy.
