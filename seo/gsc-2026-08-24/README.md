# GSC redacted export — run 32683875926

This directory is the immutable, git-safe Search Analytics export pulled by the
`revops-scheduled` workflow on 2026-08-24 UTC. It sits alongside
`seo/gsc-2026-08-09`; the historical baseline was not overwritten.

- Property: `sc-domain:confenge.com.br`
- Provider window: 2026-07-24 through 2026-08-20
- Provider maximum observed date: 2026-08-18
- Property-local pull date: 2026-08-23 (`America/Sao_Paulo`); provider age at
  pull: 5 calendar days; lag to the requested window end: 2 calendar days
- Returned rows: 75; clicks: 0; impressions: 78
- Source: live Search Analytics API, not a fixture
- Query text: redacted to stable hashes before commit
- Limitation: Search Analytics returns top rows, not an exhaustive property
  census. A missing row remains `UNKNOWN`, never zero.

The workflow-level GSC gate is ready, but the BOFU product-decision gate remains
closed because the same-method SERP comparison required by issue #292 is not yet
available. See `data/bofu-dominance/remeasurements/2026-08-24/decision.json`.
