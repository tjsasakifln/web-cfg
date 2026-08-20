# CONFENGE_COMPOUNDING_STANDARD/1.0

Internal growth-accounting standard. Not a public page, not a visitor-facing claim, not a scale authorization.

**Question this standard answers:** are proprietary assets increasing qualified organic demand and BOFU transfer faster than the stock and the cost of keeping them?

Until closed 28-day evidence exists, the honest state is `INSUFFICIENT_EVIDENCE`.

## Identity

| Field | Value |
| --- | --- |
| schema | `CONFENGE_COMPOUNDING_STANDARD/1.0` |
| schema_version | `1.0` |
| timezone | `America/Sao_Paulo` |
| cohort_days | `28` |
| cohort_origin | `2026-01-05` (closed, non-overlapping windows) |
| complete-day lag | local day must have ended + 2 days GSC freshness |
| North Star | inbound qualified pipeline / month **observed** |
| Primary series | non-branded clicks on approved indexable routes |
| Clock | frozen `as_of` only; wall clock forbidden |

## Non-negotiable equalities that are false

- Impression ≠ click
- Click ≠ lead
- Lead ≠ qualified pipeline
- Contracted revenue ≠ cash received
- UNKNOWN ≠ 0
- Page count ≠ success
- Isolated average position ≠ success
- Individual GSC query ≠ person/lead

## Source families (never mixed into the primary series)

`organic_non_branded` (primary), `organic_branded`, `paid`, `legacy_brand` (SmartLic), `outbound`, `partner`, `direct`.

Authority: extra-cli owns acquisition facts (SELECT-only contracts). Warmbly owns commercial action (`CONFENGE_WEB`). This package consumes versioned snapshots; it does not crawl, does not join query→lead, and does not invent outcomes.

## Closed 28-day cohorts

Windows are `[origin + i·28, origin + (i+1)·28)`. A cohort is complete only when all 28 local days are complete as of frozen `as_of`. Incomplete windows are reported as incomplete. They are never filled with synthetic zeros and never force-closed.

New URLs that appear mid-cohort are inventory (INPUT). They are not mature assets. Demand per mature asset uses **clicks of mature assets only** over the mature-asset count; mid-cohort clicks must not inflate that ratio.

A refresh with no new asset is a substantive change, not inventory growth.

## Complete-day / freshness / late arrivals

- Complete day: `date <= as_of_local_date - (1 + freshness_lag_days)`.
- Payload stale if `payload_observed_at` is more than 14 local days before `as_of`.
- Late arrivals must be `reconciled: true` or the build fails closed (`LATE_ARRIVAL_UNRECONCILED`).
- Backfill is allowed only under the same `definition_id`. Changed definitions do not reclassify past cohorts (`RETROACTIVE_REDEFINITION`).

## Components (always visible; no composite score)

**A. INPUT** — approved indexable assets, substantive changes, editorial hours, refresh cost, defects/corrections, stale rate.

**B. DISCOVERY** — non-branded impressions and clicks, aggregated query coverage, CTR, route/asset family. Eligibility/appearance is not collapsed into a single “indexed” vanity bit.

**C. QUALIFIED USE** — admitted engagement, method/evidence opened, utility completed, content→service events by contract #153. Denominators and attribution coverage stay visible.

**D. COMMERCIAL** — valid lead, qualified, meeting, proposal, qualified pipeline, won/lost/UNKNOWN, contracted vs received revenue. Warmbly #88 outcomes stay UNKNOWN until observed.

**E. MOAT** — citations, relevant referring domains, download/embed/reuse, return. Branded/direct are secondary and separated.

**F. EFFICIENCY** — clicks per active asset, pipeline per mature active asset, cost per result, maintenance/stale/defect rates.

## States

Classifier-emitted:

1. `INSUFFICIENT_EVIDENCE` — short series, missing denominator, incomplete window, tracking break, or UNKNOWN North Star.
2. `PLATEAU_OR_DECAY` — demand per asset, transfer, or outcome deteriorating with enough complete cohorts.
3. `LINEAR_CANDIDATE` — growth explained by a linear trend and/or more inventory; compounding/exponential gates fail.
4. `COMPOUNDING_CANDIDATE` — at least three consecutive complete cohorts with strictly increasing demand per mature asset; content→service, lead→qualified, and qualified→pipeline do not deteriorate; quality/stale/defect/cost inside versioned policy; no mixed incompatible sources.
5. `EXPONENTIAL_CANDIDATE` — ≥6 non-overlapping same-definition complete cohorts; `log(y+1) = α + r·t` with `r > 0` beats linear on **original-scale** rolling-origin RMSE (≥5% better) and AICc (ΔAICc ≥ 2), both pre-registered; clicks/active_asset not falling; demand grows faster than mature active-asset count; leave-one-asset-out preserves the statistical conclusion; no asset >60% of lift; paid/branded/legacy SmartLic excluded from the primary series; adversarial review records tracking breaks, seasonality, SERP, migration, and launches.

Human-only, **never auto-emitted**:

6. `SCALE_ALLOWED` — external human decision after evidence. The generator may store `human_decisions` but `current_state` is never `SCALE_ALLOWED`.

## Pre-registered statistics (before any live final cohort)

- Linear: `y = a + b·t`
- Log: `log(y+1) = α + r·t`, back-transform `ŷ = expm1(α + r·t)`
- Compare RMSE and Gaussian AICc on the **original y scale** (not on mixed scales)
- Rolling-origin: min train = 3 complete cohorts
- `k = 2` (intercept + slope) for both models
- Single-asset dominance threshold = 0.60 of total lift
- Stale-rate max = 0.20; defect-rate max = 0.10
- Cost must not grow faster than demand over the last three complete cohorts

## Fail-closed reason codes

Incomplete window, changed definition, incompatible source, missing denominator, invalid clock, unreconciled late arrival, aggregate without provenance, query-level PII, inferred outcome, mixed families, tracking break, single-asset dominance, commercial guardrail deterioration, cost exceeding demand, stale payload, defect spike, paid/branded/legacy/direct contamination, overlapping windows, retroactive redefinition, linear better than log, leave-one-out failure, page-count KPI, query→lead join, synthetic zero, wall clock.

## Version compatibility

`1.0` reports are valid only against `CONFENGE_COMPOUNDING_STANDARD/1.0`. A later definition is a new `definition_id`. Do not reinterpret historical cohorts under a new definition. SmartLic / legacy_brand series is an anti-baseline: it may be shown separated, never as CONFENGE compounding evidence.

## Public language

This standard does not authorize a public claim of “crescimento exponencial”. Candidate states are internal.

## New-page policy (spec only)

A new public page still requires a probable incremental-gain hypothesis and an explicit kill/consolidation plan. This campaign does **not** gate live HTML; the policy lives here so #154 is not silently dropped.

## Current live residual

web-cfg GSC snapshot (pages table): 373 impressions, 10 clicks, 29 commercial impressions, 0 commercial clicks. GSC sync blocked (missing credentials). Commercial outcomes UNKNOWN. Closed 28-day daily series: none. Current state: `INSUFFICIENT_EVIDENCE`.
