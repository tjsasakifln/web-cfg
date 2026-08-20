# Organic demand-control loop

Campaign: `CONFENGE-WEB-SEO-DEMAND-CONTROL-02`  
Decision state: **VALIDATE** for live Search Analytics (blocked without secrets); **EXECUTE_NOW** for the measurement layer.  
Leverage: data, distribution, trust.  
North Star: inbound qualified pipeline / month. This slice does not invent traffic, indexation, leads or revenue.

This is the operational control on top of the existing Search Demand Observatory, Organic Opportunity Engine and Search/AI Discovery observatory. It is not a second collector, not a second demand graph, and not a content factory.

## Daily questions

1. What is eligible for discovery?
2. What actually appeared in search?
3. Where is observed non-brand demand?
4. Where is wrong landing, cannibalization, striking distance or CTR gap with enough evidence?
5. What is the next organic action of highest expected value?
6. Which experiments should only be observed?

## Commands

```bash
python3 scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke
python3 scripts/revops/search_demand_observatory.py sync --days 28 --reprocess-days 3 --allow-missing-creds
python3 scripts/revops/search_demand_observatory.py baseline --dry-run
python3 scripts/revops/search_demand_observatory.py baseline
python3 -m scripts.discovery report --json
npm run organic:test
python3 scripts/revops/test_search_demand.py
```

## Snapshot labels (exactly one)

| `source_kind` | Meaning | `ready_for_product_decisions` |
|---|---|---|
| `search_analytics_api` | Live Search Analytics pull | true only when current |
| `search_analytics_top_row_truncation` | Live pull hit rowLimit / safety page cap | true for the returned set; coverage incomplete |
| `historical_csv_export` | GSC UI CSV | false |
| `fixture` | Committed pipeline fixture | false |
| `absence` | No payload | false |
| `credential_failure` | Missing/empty `GSC_CREDENTIALS_JSON` (or OAuth pair) and/or `GSC_SITE_URL` | false |

Absence is `ABSENT` / `UNKNOWN` with `value` null. It is never numeric zero. A query missing from the top rows is not zero impressions.

## External secret blocker

The scheduled `gsc` job records a blocked `last_sync.json` when secrets are empty. It does not invent metrics.

- Secrets: `GSC_CREDENTIALS_JSON` (service account JSON) **or** `GSC_CLIENT_SECRETS_JSON` + `GSC_TOKEN_JSON`, plus `GSC_SITE_URL`
- Scope: `https://www.googleapis.com/auth/webmasters.readonly`
- One human action: set those GitHub Actions secrets and grant the service account Search Console read on `sc-domain:confenge.com.br`

## Next-action queue

At most three recommendations. It does not authorize HTML, title, meta, H1, CTA, internal-link or robots edits. Active experiments (#126 SINAPI, #127 noindex canary, #128 BOFU pillars, #60 utility, #83, #84, #89, checkout, SmartLic) are observe-only.

## Artifacts

- `data/organic/demand-control-baseline.json`
- `data/organic/demand-control-queue.json`
- `docs/ops/ORGANIC-DEMAND-CONTROL-REPORT.md`
