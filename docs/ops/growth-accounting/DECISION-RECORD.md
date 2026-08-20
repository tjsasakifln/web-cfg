# Decision record — CONFENGE_COMPOUNDING_STANDARD/1.0

| Field | Value |
| --- | --- |
| Campaign | `CONFENGE-WEB-COMPOUNDING-STANDARD-V1-01` |
| Issue | [web-cfg #154](https://github.com/tjsasakifln/web-cfg/issues/154) |
| Decision state | **VALIDATE** |
| Executive front | Growth accounting / BOFU learning (not public HTML) |
| Time to first evidence | 28 days (one closed cohort) |
| Time to exponential eligibility | 168 days (six non-overlapping 28-day cohorts) unless an integral same-definition backfill exists |
| Leverage | distribution + data + revenue (measurement before scale) |
| ADR boundary | ADR-STRAT-002 / RUNTIME-AUTHORITY / MARKET-CAPTURE-OS unchanged. No public surface, no SmartLic brand, no extra-cli crawler, no Warmbly action. |

## Decision

Adopt `CONFENGE_COMPOUNDING_STANDARD/1.0` as the internal classifier for whether proprietary assets compound qualified organic demand. Ship the deterministic generator now. Do not call the current GSC snapshot compounding or exponential.

## Why VALIDATE, not EXECUTE_NOW scale

The live evidence is a single incomplete GSC snapshot (373 impressions / 10 clicks / 0 commercial clicks) plus blocked GSC sync and UNKNOWN Warmbly outcomes. Six non-overlapping 28-day CONFENGE cohorts do not exist. Scale authorization is a human decision (`SCALE_ALLOWED`) and is not emitted by this generator.

## Explicit non-decisions

- No merge, no deploy, no public HTML, no sitemap/robots, no offer/checkout change.
- No auto `SCALE_ALLOWED`.
- No query-level GSC → lead join.
- No treating page count, impressions, or average position as success.
- Incremental-gain / kill plans for new pages remain spec policy; this campaign does not enforce them on live HTML.

## Rollback

Delete or revert `scripts/growth_accounting/**`, `tests/growth_accounting/**`, `data/growth-accounting/**`, `docs/ops/growth-accounting/**`, and the optional `package.json` script lines. No public artifact is affected.
