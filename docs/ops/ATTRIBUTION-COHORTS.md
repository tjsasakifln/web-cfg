# Attribution cohorts (Story 1.6)

**IDs:** DATA-11  
**ADR-007:** cohort/path/probability only — **never** join individual GSC query ↔ individual lead.

## Generate

```bash
CONFENGE_STORAGE_BACKEND=filesystem CONFENGE_STORAGE_DIR=/var/lib/confenge-web node scripts/revops/attribution_cohorts.mjs \
  --out data/revops/cohorts/attribution-cohorts-latest.json \
  --kind real

# Fixture path (CI)
node scripts/revops/attribution_cohorts.mjs --fixture \
  --out /tmp/cohorts.json
```

## Freshness

- Expected cadence: **daily** (ops/cron optional).
- Package includes `freshness.expected_cadence` and `generated_at`.
- Ops may read precomputed package instead of live O(n) memory joins.

## Contents

- `by_utm_source`, `by_journey`, `path_cohorts` (leads + events counts per path)
- Commercial default excludes non-`real` `record_kind` (ADR-004)
