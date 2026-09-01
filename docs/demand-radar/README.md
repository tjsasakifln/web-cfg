# CONFENGE Demand Radar — internal operating contract

## Mission and boundary

The Minimum Viable CONFENGE Demand Radar is a deterministic internal decision engine. It answers:

> What are the top few search-market opportunities worth engineering attention now, why, what is the canonical owner, and what action class is justified?

It is not a dashboard, crawler, CMS, CRM, keyword farm or public experience. It performs no network collection, analytics mutation, outreach, page generation, public build or issue creation. Every recommendation is advisory and has `authorizes_public_mutation=false`.

The operator job is to choose a small, evidence-bounded engineering queue without confusing page/search observations with query completeness, causal conversion performance or commercial outcomes.

## Executive gate

- Decision state: `EXECUTE_NOW` for the internal ledger; every suggested public action still needs separate authorization.
- Executive front: `INBOUND_ENGINE`.
- Time to evidence: one accepted normalized snapshot cycle.
- Leverage: data and automation in the shared ledger; distribution/trust/revenue only through separately approved follow-on work.
- North Star: qualified commercial opportunities attributable from high-intent demand through `CONFENGE_WEB` to proposal, contract and margin.
- Not success by itself: pages, keywords, traffic, impressions, CTR, raw leads, issues or PR count.
- Repetition test: 100 observations enrich this ledger and its decision history. They do not create 100 pages or 100 issues.

## Authority reconciliation on 2026-08-31

Contemporary `origin/main` was `81c600b7c26dcc606d3a03e648ecd9820d9c1c37` after `git fetch origin --prune`.

| Authority | Current state at capture | Radar use |
|---|---|---|
| PR #545, head `283a877…` | open, clean, all checks passing | Canonical derived BOFU buyer-job/owner projection. The normalized snapshot pins its exact path, revision and SHA; it does not replace the registry. |
| PR #554, head `e264570…` | open, clean, all checks passing | Confirms the accepted release-bound GSC/funnel boundary and `UNKNOWN` semantics. The radar consumes page evidence, never mutates its measurement ledger. |
| PR #552, head `c39d379…` | open, clean, all checks passing | Technical eligibility only. Technical probe status is not market demand. |
| PR #553, head `f9861ca…` | open, clean, all checks passing | Foundation/exact-SHA audit context only; its pre-commercial evidence is historical. |
| PR #555, head `0316c70…` | open, clean, all checks passing | Future commercial-truth projection once integrated; not copied or represented as current main. |
| Issue #550 | open, `VALIDATE` | Separate bounded PII-free CTA/validation observability residual. No radar coupling or measurement-variable mutation. |
| PR #536 | HOLD / required home-LCP check failed | Unrelated runtime/privacy lane. The radar does not touch it, rerun/waive its gate or modify the home. |

Canonical ownership remains in `data/bofu-dominance/core/intent-registry.v2.json` and the derived `buyer-decision-map.v1.json` from #545. Public family and conversion ownership remain in `data/organic/public-family-registry.json`. Acquisition, identity and provenance remain in `extra-cli`; Warmbly owns QCO, proposal, contract and commercial action. The radar stores only provenance-pinned aggregate observations and derived advisory decisions.

## Snapshot envelope

Each file under `data/demand_radar/snapshots/**` has schema `confenge-demand-radar-snapshot/v1` and exactly these top-level fields:

- `source`: source ID/kind, one observation date or date range, geography, language, aggregate privacy class, authority/repository/path/revision/content SHA, freshness and an explicit `UNKNOWN` rule;
- `records`: normalized family-level observations, with no raw query, lead, account or contact identifiers;
- `records_sha256`: SHA-256 of canonical JSON for `records` (UTF-8, sorted keys, compact separators);
- `snapshot_sha256`: SHA-256 of the complete canonical envelope except this seal, so provenance/freshness changes cannot pass without resealing;
- `schema_version`.

The schema is exact and typed per source kind: unknown fields, nested shape drift, raw-query/contact-like keys, e-mail/phone/CPF/CNPJ-like values, non-finite numbers and an incompatible privacy class fail closed. The engine also rejects invalid as-of dates, future evidence, expired/stale/unknown freshness, non-`BRA`/`pt-BR` market scope, contradictory owner states, observed GSC on an owner gap, and a GSC owner path that differs from the canonical owner URL. The campaign-accepted historical GSC snapshot is the sole explicit historical-freshness exception.

Every snapshot must also have an exact envelope-bound entry in `data/demand_radar/approved-sources.v1.json`. The sealed manifest repeats the reviewed source kind, repository, path, revision, original-content SHA and normalized-envelope SHA. A mismatch, missing approval or extra approval fails closed. `ACCEPTED_HISTORICAL` is usable only when that exact approved entry explicitly permits it; this binds the exception to the accepted GSC envelope instead of trusting a self-declared freshness label.

The engine requires a canonical BOFU owner projection and GSC overlay. It accepts these optional source kinds:

| Kind | Valid evidence | Never means |
|---|---|---|
| `GOOGLE_TRENDS` | relative momentum, seasonality and geography | absolute volume |
| `KEYWORD_PLANNER` | approximate market breadth, competition and bid band | exact demand or CONFENGE contract value |
| `SERP_RESEARCH` | qualitative intent and result-format evidence | volume or durable rank |
| `WARMBLY_AGGREGATE_OUTCOMES` | PII-free QCO/proposal/contract counts, preserving unknown fields | causal attribution, CRM ownership or invented zero |

Multiple dated snapshots may coexist. The active source per kind is selected deterministically by report as-of date, freshness, market scope, effective date and source ID; every valid snapshot remains summarized in the one ledger. A newer unusable required snapshot fails closed instead of silently falling back. Future or unusable optional snapshots are reported as ignored/`UNKNOWN`. Evidence for a family absent from the canonical owner projection is recorded as ignored and cannot create a buyer job, owner, page or action.

## Decision method

The engine never multiplies metrics or inserts numeric floors. It applies this order:

1. hard eligibility: buyer fit, canonical owner/gap, freeze and truth;
2. first-party GSC page evidence;
3. valid Planner market breadth;
4. Trends momentum modifier;
5. aggregate QCO/proposal/contract feedback;
6. execution leverage and repetition behavior;
7. cannibalization, compliance and evidence risk.

Sorting is a lexicographic tuple of those observed facts/categories. `UNKNOWN` remains `UNKNOWN`. The report contains no composite score. An active freeze always produces `WAIT_MEASUREMENT`, even when the page has stronger exposure than an actionable owner.

Allowed actions are exactly:

- `WAIT_MEASUREMENT`
- `IMPROVE_SERP_SNIPPET`
- `IMPROVE_CANONICAL_OWNER`
- `FIX_COMMERCIAL_BRIDGE`
- `BUILD_UTILITY_CANDIDATE`
- `BUILD_ORIGINAL_DATA_ASSET_CANDIDATE`
- `CREATE_CANONICAL_OWNER_CANDIDATE`
- `CONSOLIDATE`
- `DEPRIORITIZE`
- `RESEARCH_REQUIRED`

At most five opportunities appear in `ACTIONABLE_NOW`. Overflow stays in the shared ledger and moves to research; it does not open work automatically. WAIT and RESEARCH/DEPRIORITIZE remain separate.

## Runbook

From the repository root:

```sh
npm run test:demand-radar
npm run demand-radar:build
npm run demand-radar:check
```

`build` rewrites only the stable internal outputs:

- `data/demand_radar/ledger.v1.json`
- `docs/demand-radar/REPORT.md`

`build` without `--origin-main` records the contemporary full `origin/main` SHA.
`check` without that override instead rebuilds against the full SHA already sealed
in the ledger, so a later movement of `origin/main` does not make a valid
historical observation stale. Pass `--origin-main <full-sha>` only to verify an
explicit candidate; a different SHA correctly reports stale generated output.

For a future observation, add a sealed normalized snapshot under the dated input directory, add its exact reviewed entry to the sealed approved-source manifest, keep source provenance immutable, update the explicit `--as-of` date in the package commands through review, rebuild, and inspect the changed ledger/report. Do not add a public route or one issue per observation.

## Pull-request evidence

- Visitor job: an internal operator chooses the few evidence-bounded search-market opportunities worth engineering attention.
- Acquisition/conversion hypothesis: concentrate existing first-party search exposure on its canonical owner and validate the smallest owner/bridge mechanism before public work, then observe `CONFENGE_WEB` progression without causal overclaiming.
- Data owner/contract: #545 owner projection; #554 accepted page overlay semantics; future `extra-cli` SELECT-only truth and Warmbly aggregate outcomes remain external-owner inputs.
- Quality gate: focused pytest, deterministic generated-output check, existing BOFU tests, query-ownership/inbound gates and affected-test selector.
- Analytics: no analytics or measurement-variable mutation. Optional Warmbly data is aggregate/no-PII only.
- Rollback: revert the internal paths and package-script entries. There is no runtime/data migration or public artifact.
- Affected ADR: conforms to ADR-STRAT-002 and RUNTIME-AUTHORITY; no ADR change because no public/runtime ownership changes.
