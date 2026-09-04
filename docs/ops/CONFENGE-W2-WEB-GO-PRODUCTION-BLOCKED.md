# CONFENGE-W2-WEB-GO-PRODUCTION — waiting on extra-cli W2 (2026-09-03)

**Campaign state: `CAMPAIGN_STATE=WAITING_ON_EXTRA_W2`. Not closed, not Wave 3. Same Wave 2
campaign, resumed from this file the moment extra-cli W2 publishes its final export HEAD.**

## Closeout flags

```
EXTRA_LI_FOUNDATION_EXISTS=YES        (extra-cli PR #538, confenge-live-intelligence-01, mergeable — W1 engine foundation)
EXTRA_OFFICIAL_LIVE_WEB_EXPORT_EXISTS=NO
DEPENDENCY_EXTRA_OFFICIAL_LIVE_EXPORT=WAITING
LOCAL_IMPLEMENTATION_COMPLETE=YES
LOCAL_WEB_WORK_COMPLETE=YES
FIXTURE_ONLY_PRODUCTION=NO
PR573_MERGED=NO
PRODUCTION_SHA_MATCH=NO
REAL_EXTRA_EXPORT_CONSUMED=NO
COMPANY_MONITOR_IDENTITY_READY=NO
MONITORING_HANDOFF_REAL=NO
LIVE_SURFACES_HTTP_200=NO
LIVE_DISTRIBUTION_PATH=NO
CNPJ_OR_SHARE_TOKEN_LEAK=NO  (no leak found in existing W1 code; unverified end-to-end since nothing new shipped)
LIVE_INBOUND_PRODUCT_READY=NO
CAMPAIGN_READY=NO
WAVE3_REQUIRED=NO
```

## The dependency (owned by extra-cli W2, not web-cfg)

extra-cli PR #538 shipped the Live Intelligence **engine foundation** (W1) — mergeable, real code,
not a placeholder. What's missing is the **final W2 web export**: a real `official_live=true`
producer output. Verified in producer code that this export does not exist yet:

- `extra-cli/scripts/confenge_live_intelligence/producer.py` and `schema.py` never emit an
  `official_live` field today. That concept exists elsewhere in extra-cli (an unrelated feature,
  `market-answer/*`, verified via `docs/ops/campaigns/CONFENGE-PRODUCTION-CLOSEOUT-01/`) but not
  yet in this engine's own output.
- The producer's own manifest self-labels `"status": "DECLARED_NOT_YET_SHIPPED_BY_PRODUCER"`.
- The producer CLI (`python3 -m scripts.confenge_live_intelligence.cli build`) defaults to
  `postgresql://test:test@127.0.0.1:5433/extra_test`, a fixture database. Running it against that
  DSN and labeling the output "real" would be the exact renamed-fixture failure the goal forbids.
- Proving the isolated export against real PostgreSQL infrastructure (including whatever DSN
  access it needs) is explicitly the extra-cli W2 campaign's own responsibility to resolve — not
  a decision or blocker owned by this session or this repo. web-cfg does not gate on how extra-cli
  gets that proof done, only on the export existing.

`web-cfg`'s consumer side (`scripts/live_intelligence/consume.py`) is correctly built to accept a
real export the moment one exists: `negotiate_schema` (consume.py:172-186) is the single schema
authority, and it structurally rejects fixture schema as live (consume.py:146-186, 207-211,
348-351). This part of the /goal is already satisfied by W1 and needs no rework.

## Minimum contract extra-cli W2 must publish

web-cfg's consumer will accept the export as soon as it satisfies all of the following — this is
the acceptance checklist for W2, not a wishlist:

- Schema `CONFENGE_LIVE_INTELLIGENCE/1.x` (accepted today by `negotiate_schema`, consume.py:172-186)
- `official_live=true` on the emitted payload/manifest
- A verifiable manifest (content hash of the manifest itself, not just per-record hashes)
- `source_as_of` and `generated_at` timestamps (freshness watermark + export time)
- `coverage` (contract counts, source counts — matching the shape already declared in
  `docs/contracts/confenge-live-intelligence-v1.json`)
- `provenance` / `fonte` per record (source system, source id)
- `content_hash` per opportunity and per company record (canonical JSON + SHA256, matching the
  hash discipline already proven byte-compatible in extra-cli's own tests)
- Opportunities keyed by an official `opportunity_id`
- Full CNPJ lookup resolving to a root-level profile — i.e. any establishment CNPJ under a given
  root (e.g. two branches of the same company) must resolve to the **same single canonical
  root record**, not separate per-branch records. This is a consistency-resolution property to
  prove, not a request to un-consolidate the producer's root-level policy.
- A stable canonical business reference, defined and owned by the producer, that web-cfg consumes
  as an opaque key — web-cfg does not define or invent this reference itself
- No raw CNPJ required anywhere in the public bundle (already enforced consumer-side today:
  `raw_cnpj_in_payload: false`, contract line 73)
- An unambiguous `data_state` of `DATA_READY` / `DATA_HOLD` / `DATA_REJECT` per record

## Premise corrections from the original diagnosis

- **`company_ref` is not "invent nothing."** It does not mean web-cfg defines an identity model —
  that stays banned by AGENTS.md. It means: extra-cli W2 is responsible for emitting a stable
  canonical business reference (see contract list above), and web-cfg's job is to *consume* that
  reference as an opaque key, the same way it already consumes `company_root8`/`company_digest`
  today. No new identity concept gets defined in this repo.
- **Root-level consolidation is correct and stays.** `producer.py:254-322` (`project_companies`)
  correctly groups all CNPJs sharing a root8 into one company record; that policy is not being
  challenged. The two-branch test referenced in the original goal is a resolution-consistency
  proof (branch A CNPJ and branch B CNPJ both resolve to the same root profile), not a request
  for separate per-branch records — no schema change needed on that front.

## What is NOT wrong and does not need touching

- `data/live_intelligence/live/*.json` is honestly labeled (`catalog_mode: "fixture"`,
  `source_kind: "test_only_fixture"`, `index_eligible: false`) — this is not a mislabeled fixture,
  it's a correctly-gated placeholder.
- CNPJ handling in `netlify/functions/live-intelligence-analyze.cjs` and
  `assets/js/live-intelligence.js` already keeps raw CNPJ and share tokens out of
  URLs/logs/analytics (verified allowlists at lines 112-155 of the function; forbidden-field
  assertion at 186-204). No leak found in the current W1 code.
- The three index bars blocking Surface A indexation
  (`producer_status_not_official_live`, `catalog_mode_fixture`, `fixture_schema`) are gates
  working as designed, not a wiring bug. "Corrija o wiring" has no legitimate target while the
  producer has not shipped `official_live=true` data — loosening these gates would violate the
  fail-closed conversion-gate rule in `AGENTS.md`.

## PR #573

Left open, unmerged, still fixture-backed W1. Merging it now would satisfy `PR573_MERGED=YES` on
paper while contradicting the goal's own instruction ("Não termine com 'deployable'") and merging
a different thing than what was authorized (a PR that consumes the real export). Stays open until
resumption.

## Resumption trigger — same Wave 2, no new story

When extra-cli's W2 campaign publishes its final export HEAD (satisfying the minimum contract
above), **resume this exact campaign against that SHA** and run the rest of the original mission
in order. Do not open a new story/wave for the resumption:

1. Point `web-cfg`'s `scripts/live_intelligence/consume.py` at the real export
   (`negotiate_schema` already accepts it; no consumer code change needed beyond the source path).
2. Wire the producer's canonical business reference through as an opaque key (company identity
   handoff) — consume only, per the correction above.
3. Index bars clear automatically once `catalog_mode != fixture` and schema is live.
4. Add the live-intelligence family to `data/organic/public-family-registry.json` (visitor job,
   profile, terminal action, gate coverage) for `/oportunidades/<id>/` and/or `/analise-cnpj/`.
5. Run `npm run inbound:gates`, pSEO/privacy gates; fix anything the registry declaration surfaces.
6. Update and merge PR #573 against the real-export-backed state.
7. Run the Netcup deploy flow; verify `web_cfg_sha` on `.well-known/pseo-build.json` matches HEAD.
8. HTTP-verify `/analise-cnpj/`, a shareable result, ≥1 real `/oportunidades/<id>/`, and a
   consented lead → Warmbly handoff; confirm noindex headers and absence of CNPJ/token leaks.

The trigger condition (extra-cli W2 export meeting the minimum contract above) is owned by the
extra-cli W2 campaign, including how it proves the export against real PostgreSQL infrastructure.
That proof method is not this session's decision to make or gate on.
