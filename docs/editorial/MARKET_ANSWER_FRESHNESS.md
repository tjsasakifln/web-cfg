# Freshness: public Market Answer and private GSC (#151, #413)

Two independent contracts share freshness terminology but do not share a data
plane.

## Public paving-ticket canary

The public canary is evaluated during build/CI against a real UTC instant:

```bash
python3 -m scripts.market_answers validate
python3 -m scripts.market_answers validate --fail-on-stale
python3 -m scripts.market_answers build --report-only
```

- Production clock: `datetime.now(timezone.utc)`.
- Replay: `--now 2026-08-17T12:00:00Z` or `MARKET_ANSWER_NOW`.
- Classes: `CURRENT | EXPIRING | STALE | UNKNOWN`.
- `STALE` and `UNKNOWN` never yield `PUBLISHABLE_INDEX`.
- Bumping only `generated_at` or a last-known-good hash does not renew freshness.

If `extra-cli` has not shipped a renewed payload plus matching hashed approval,
the canary stays `noindex` and outside `sitemap-inteligencia.xml`. Do not invent
facts or freeze the clock.

## Private GSC durable consumer

`.github/workflows/market-answer-freshness.yml` is the scheduled, authenticated
and read-only proof for #413. It does not rebuild the public canary and does not
sync GSC. The producer runs separately in `revops-scheduled.yml`; green requires
the deployed private consumer on Netcup to return a versioned durable snapshot
whose producer/consumer manifest hash and `as_of` match exactly.

The verifier emits only schema, status, safe timestamps and hashes. Absence,
partial response, timeout, hash mismatch, unversioned compatibility state or an
expired snapshot exits non-zero as `UNKNOWN`/`STALE`. See
`docs/ops/GSC-INSIGHTS-SINGLE-SOURCE.md` for the complete contract and rollback.
