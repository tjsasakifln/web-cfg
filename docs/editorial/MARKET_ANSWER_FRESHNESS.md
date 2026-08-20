# Market Answer freshness (#151)

The paving-ticket canary is evaluated against a real UTC instant.

```bash
python3 -m scripts.market_answers validate
python3 -m scripts.market_answers validate --fail-on-stale
python3 -m scripts.market_answers build --report-only
```

- Production clock: `datetime.now(timezone.utc)`.
- Replay: `--now 2026-08-17T12:00:00Z` or `MARKET_ANSWER_NOW`.
- Classes: `CURRENT | EXPIRING | STALE | UNKNOWN`.
- Telemetry: `evaluated_at`, `age_seconds`, `expires_at`, reason codes. No PII.
- `EXPIRING` is still before `expires_at` and may INDEX when every other INDEX condition holds.
- `STALE` and `UNKNOWN` never yield `PUBLISHABLE_INDEX`.
- Bumping only `generated_at` does not renew freshness.
- Last-known-good hashes do not extend INDEX after expiry.
- Operational trigger: `.github/workflows/market-answer-freshness.yml` (every 6 hours). A stale/unknown result is a failed job, not a silent green INDEX.

If extra-cli has not shipped a renewed payload plus a matching hashed approval, the canary stays `noindex` and off `sitemap-inteligencia.xml`. Do not invent facts or freeze the clock.
