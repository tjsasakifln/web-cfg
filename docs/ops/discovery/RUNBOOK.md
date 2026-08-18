# Discovery live operations — read-only routine

Manual, idempotent commands for the #84 SC Market Answer canary. This
campaign does **not** add cron or a GitHub workflow. Schedule the same
commands externally if a daily cadence is needed.

**Declaration:** read-only; no synthetic search/click; no tracking mutation;
no IndexNow submission.

## Asset

- `asset_id`: `valor-tipico-contratos-pavimentacao`
- Canonical: `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/`
- Technical status (publication): `LIVE_PROVEN` (issue #84, PR #113)
- Discovery / lead / revenue: remain `UNKNOWN` until a real export is imported

## Named states

The report emits independently checkable `TRUE` / `FALSE` / `UNKNOWN` /
`BLOCKED` (credential-gated GSC only) values. They are not interchangeable:

| State | TRUE only when | Never inferred from |
| --- | --- | --- |
| `HTTP_OK` | terminal public GET is 200/203 | 3xx hop counted as the page |
| `CRAWL_ALLOWED` | robots.txt fetched and does not block the path | meta `index` |
| `SITEMAP_LISTED` | URL is a loc in a fetched sitemap | robots Allow |
| `CANONICAL_VALID` | declared canonical matches the registered URL | HTTP 200 alone |
| `DISCOVERED` | GSC export/inspection shows the URL is known | HTTP + robots + sitemap, or `site:` |
| `INDEXED` | explicit GSC index/coverage verdict | `site:`, impressions, or publication |
| `IMPRESSION` | GSC impressions > 0 (`FALSE` only if proven zero) | missing export |
| `CLICK` | GSC clicks > 0 (`FALSE` only if proven zero) | missing export |
| `LEAD` | persisted lead with gclid/query correlation | opaque `lead_id` |
| `REVENUE` | reconciled commercial/financial event | estimates |

Missing GSC credentials or exports stay `UNKNOWN` or `BLOCKED`. Absence is
not `FALSE` and is not proof that discovery is absent. `site:` is a weak
signal and never `INDEXED=TRUE`.

## Daily routine

1. **Technical probe (GET/HEAD only)**

   ```bash
   python3 -m scripts.discovery probe \
     --asset-id valor-tipico-contratos-pavimentacao \
     --json \
     --out data/discovery/snapshots/probe-latest.json
   ```

   Appends one hashed record to `data/discovery/snapshots/observations.ndjson`.
   Replay of an identical record is a no-op.

2. **Import GSC when an export exists**

   ```bash
   python3 -m scripts.discovery import-gsc \
     --file /path/to/gsc-export.csv \
     --asset-id valor-tipico-contratos-pavimentacao \
     --timezone America/Sao_Paulo \
     --period-start 2026-08-01 \
     --period-end 2026-08-07
   ```

   Re-importing the same file later in the day is a fact-key replay even
   without `--as-of`. The report does not sum the same query×page×date twice.

   If no export is available, do **not** invent zeros. The report emits
   `GSC_DATA_NOT_PROVIDED`.

3. **Import referrals / outcomes when an export exists**

   ```bash
   python3 -m scripts.discovery import-referral \
     --file /path/to/referral-export.json \
     --asset-id valor-tipico-contratos-pavimentacao
   ```

   Name, email, phone, CNPJ and form content are refused. A lead without a
   correlation id is stored unattributed (`LEAD_UNATTRIBUTED_NO_CORRELATION`).

4. **Generate the report**

   ```bash
   python3 -m scripts.discovery report --as-of 2026-08-17T18:25:58Z
   npm run discovery:report
   ```

5. **Compare with baseline**

   The report prints baseline (first stored probe / `observation_start_at`)
   and deltas only when windows and filters are compatible. Absence is not
   zero. Position carries a statistical warning.

6. **Record on issues #84 and #86**

   Paste the probe `record_hash` / `snapshot_sha256`, reason codes, and
   which levels remain `UNKNOWN`. Do not close either issue on technical
   probe alone.

7. **Investigate when**

   - unexpected external redirect
   - robots blocking or divergent canonical
   - sitemap loc missing
   - HTTP timeout / 429 / 5xx
   - content hash change
   - incompatible GSC windows
   - PII in an export (refuse, do not store)

## IndexNow

Still prepare-only:

```bash
python3 -m scripts.discovery indexnow \
  --url https://confenge.com.br/radar/nacional-obras-publicas/
```

`--send` is refused. A receipt is not indexation.

## What this does not do

- No browser automation, no Google/Bing query, no click or impression generation
- No new tracking, consent, analytics, sitemap, robots or page mutation
- No revenue estimate, SEO score, or causality claim
