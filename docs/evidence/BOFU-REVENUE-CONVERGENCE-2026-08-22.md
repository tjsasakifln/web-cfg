# WEB-CFG BOFU Revenue Convergence — evidence report

Date: `2026-08-22` (America/Sao_Paulo)

Repository: `tjsasakifln/web-cfg`

Decision state: `EXECUTE_NOW`

Executive front: `REVENUE / BOFU`

Leverage: `revenue + distribution + data + automation + trust`

Time to code evidence: this campaign. Time to production handoff evidence: first configured run with a real consented contact.

North Star: qualified commercial opportunity. Page count, issue count, impressions and isolated Lighthouse scores are not success criteria.

## Deterministic revision boundary

| Field | Value |
|---|---|
| Initial audited SHA | `14740dab6b21bde19ecc62396d89393c2c7adab6` |
| Main after prerequisite merges | `5248de757a387f11118c9a3dd61a3ffd3d24a497` |
| Final implementation SHA before this evidence-only commit | `8f774a5f` |
| Campaign PR | `#256` |
| Public canonical surface | `https://confenge.com.br` only |
| Runtime/data boundaries | `extra-cli` remains the facts/identity/provenance owner; Warmbly remains the commercial-action owner; web-cfg emits `CONFENGE_WEB` and stores no analytics PII |

The report commit is intentionally an evidence-only child of the implementation SHA. No other repository was changed.

## Portfolio convergence matrix

The campaign fetched/pruned remotes, refreshed `origin/main`, queried every open issue and PR, compared each relevant diff with current main, checked semantic overlap, and reran current gates. `#253` is deliberately not counted as BOFU progress.

| Issue / PR | Problem | Dependencies | Principal files | Freeze impact | Conversion / revenue impact | Mergeability | Action |
|---|---|---|---|---|---|---|---|
| PR #252 / issue #226 | Guard compared live disk with regenerated live state | committed hash baseline | frozen-spec hashing, tests, `hashes.json` | direct | prevents silent BOFU regression | clean, CI green | `MERGE_AFTER_REBASE`; merged as `5723cec9` |
| PR #254 / issue #228 | Five editable service pillars lacked local capture | existing `/.netlify/functions/lead` | five pillar HTML files, form tests | no frozen HTML | capture moved from 1/13 to 6/13 before Diretoria | rebased twice, CI green | `MERGE_AFTER_REBASE`; merged as `9c668729` |
| PR #255 / issue #230 code residual | Production proof was not bounded/reproducible | production secrets and consented human | revops proof, retry client, workflow/tests | none | makes the external blocker verifiable, never a fake delivery | rebased onto #254, CI green | `MERGE_AFTER_REBASE`; merged as `5248de75` |
| PR #190 / issues #60/#235 | Margin-defense provenance was stale | visible source/as_of parity | margin-defense HTML/test | editable route | trust at money surface | patch correct, branch stale | `SALVAGE_PATCH`; rebuilt in #256; old PR closed |
| PR #192 / issues #61/#246 | Article→pillar→offer path canary | current internal graph | article, pillar, visitor-path test | no frozen page mutation | makes offer discovery deterministic | patch correct, branch stale | `SALVAGE_PATCH`; rebuilt in #256; old PR closed |
| PR #205 / issues #74/#243 | Person sameAs/as_of absent | verifiable repository evidence only | specialist HTML, authority test | none | trust; no invented credential | patch correct, branch stale | `SALVAGE_PATCH`; rebuilt in #256; old PR closed |
| PR #199 / issue #64 | ICP mapping sent contract-pressure intent to expansion diagnosis | catalog and intent semantics | home data/HTML/tests | protected collateral risk | wrong next action could destroy qualified intent | Git-clean, semantically conflicting | `CLOSE`; closed |
| PR #193 / issue #149 | Large Node/Lighthouse migration | CI/Netlify authoritative Node 20 | package/workflows/tests | broad | not required to close BOFU leakage | stale and high-conflict | `CLOSE`; Node 20 suite is authoritative |
| PR #213 / issue #184 | Illustrative panel label | protected home styles/copy | home/CSS/test | rendering collateral | cosmetic, no funnel evidence | stale | `CLOSE`; closed |
| PR #210 / issue #127 | Three isolated noindex flips | human editorial evidence | editorial records/pages | sitemap/indexation | acquisition experiment, not graph reconciliation | stale/partial | `CLOSE`; closed, no mass flip |
| PR #206 / issue #83 | Contract-analysis acquisition canary | external source/editorial evidence | canary records/tests | none | upstream experiment | stale/outside path | `CLOSE`; closed |
| PR #201 / issue #65 | Radar citation enhancement | research evidence | Radar HTML/test | none | upstream authority | stale/outside path | `CLOSE`; closed |
| PR #196 / issue #62 | SmartLic HOLD projection | source-owned migration contract | migration fixtures/tests | none | legacy equity, not current BOFU | stale/separate boundary | `CLOSE`; closed; no SmartLic public surface added |
| PR #191 / issue #86 | llms.txt as_of | discovery evidence | `llms.txt`/test | none | upstream discovery only | stale/outside path | `CLOSE`; closed |
| PR #175 / issue #154 | Prepare-only compounding standard | future proof | 39 files | broad | no current qualified-opportunity proof | explicitly not merge-authorized | `CLOSE`; closed |
| PR #174 | Prepare-only integrity consumer | external integrity source | 50 files | broad | separate trust experiment | explicitly not merge-authorized | `CLOSE`; closed |
| PR #253 / issues #179/#180 | Raster title-card removal across 100 files | viewport/browser proof | 100 HTML/test files | touches pillar surface | valid UI residual, not BOFU path | clean but overbroad for this campaign | `SALVAGE_PATCH` in a separate campaign; #180 closed as exact duplicate of #179; not merged here |
| PR #256 | Current integrated campaign | #252/#254/#255 on main | 88 files before evidence | reviewed collateral recapture; six HTMLs unchanged | closes current capture, attribution, action and measurement gaps | rebuilt on current main | `MERGE_AFTER_REBASE` |

All other open issues were re-read. Campaign issues are enumerated below. Acquisition/authority experiments `#83, #84, #86, #89, #90, #91, #127, #128, #154, #155, #156` and unrelated UI/runtime work `#149, #179, #181–#188, #224` remain outside the critical path. Residual P2 work `#239, #247–#251` was not converted into new page families or duplicate issues.

## Issue disposition

Implemented and gate-covered in web-cfg:

- `#223, #226, #227, #228, #229, #231, #232, #233, #234, #235, #236, #237, #238, #240, #241, #242, #244, #245, #246`.
- `#179/#180`: duplicate disposition only; `#180` closed, no duplicated implementation.
- `#243`: partially implemented through the #205 sameAs/as_of authority patch. CREA, responsible professional credential and street address remain `UNKNOWN` because the repository has no authorized proof.
- `#230`: code residual implemented and fail-closed; production handoff remains `BLOCKED_EXTERNAL_ACTION`.

## Funnel changes and coverage

### Discovery → correct page → comprehension

- Reconstructed the article → pillar → offer path and added a live-repository canary.
- Added contextual entries to `/diagnostico-b2g-expansao/` from home, `/diretoria-b2g/`, `/bid-room-licitacoes-obras/` and the tools hub. No new public family was created.
- The paid expansion diagnostic and Diretoria B2G are represented in the BOFU intent ledger with primary queries, negatives, overlap, canonical owner, kill and next test. SERP state remains `UNKNOWN`; no position was invented.

### CTA → capture → persisted lead

| Measure | Before | After |
|---|---:|---:|
| Service routes recognized by the gate | 13 | 13 |
| Service routes with on-page capture | 1/13 (7.69%) | 7/13 (53.85%) |
| Editable routes required by #228 | 0/5 | 5/5 |
| Frozen routes without form | 6 ERROR-equivalent leaks in the old gate | 6 WARN until `2026-09-16`, ERROR afterward |
| Public indexable pages actually scanned | 55 in the old partial census | 65/65 |
| CTA inside `<main>` where commercially compatible | 49/55 in the old partial census | 56/56 (100%) |
| Trust/legal exemptions | implicit | 9 explicit profile exemptions |

The five #228 forms and the Diretoria B2G handraise reuse `/.netlify/functions/lead`, preserve WhatsApp, carry source/route/service attribution and required consent, and do not invent price or `offer_id` for unpriced services. The lead-function suite persists distinct QA receipts and fails closed without consent.

### Attribution → next action

- `canonical service routes ⊆ source_to_service.destinations`: `13/13` PASS.
- `source_to_service` has 14 destinations total, including the diagnostic tool; `/diagnostico-b2g-expansao/`, `/panorama-mercado-obras-publicas/` and `/casos/` are no longer unknown transitions.
- Intent→action contains 17 route rows and covers all 13 non-null `service_id` values.
- Every route has owner, channel, minimum fields, consent, fallback and kill gate; every SLA is `UNKNOWN`; `auto_send=true` count is `0`.
- WhatsApp retains direct operation and receives a short idempotent `CFG-WA-XXXXXXXX` protocol derived from the first-party event id. Analytics receives no contact text or PII.

### Offers and money surfaces

- Expansion diagnostic Offer schema is derived from the versioned catalog: active APPROVED → `InStock`; kill switch → `SoldOut`.
- Only the catalogued 10–15 business-day diagnostic SLA is rendered; the adversarial test rejects an invented deadline.
- `/diretoria-b2g/` has an on-page capacity-enquiry handraise using the catalog offer/terms IDs. It is not checkout; capacity is evaluated before charging.
- Each of the three tools exposes coherent positive and negative next actions after the result without turning the calculation into a lead gate.
- Visible authorship/FAQ and schema parity are checked on the money surfaces. Invisible cosmetic schema fails the fixture.
- Editable commercial WhatsApp CTAs use catalog messages; the guard derives all canonical service routes rather than using a hand-maintained page list.

### Measurement semantics

| Contract | Result |
|---|---|
| Site-emitted events | 59/59 have at least one real producer |
| Observed-only commercial outcomes | `qualified_lead` and `pipeline`; owned by Warmbly, not accepted from browser collect |
| Retired non-emitted names | `nurture_opt_in`, `return_visit` |
| PII analytics allowlist | empty |
| Missing analytics export | `UNKNOWN + ANALYTICS_EXPORT_ABSENT + as_of`; never numeric zero |
| Current qualified lead / pipeline | `UNKNOWN`; no fabricated denominator or outcome |

The versioned export contract makes the chain organic asset → service entry → CTA → lead → qualified pipeline technically computable once the authorized export exists.

## Indexability and sitemap reconciliation

- Indexable public URLs: `65`.
- URLs in the valid sitemap graph: `65`.
- `indexable_missing_from_sitemap`: `0`.
- Noindex URL treated as indexable: `0`.
- Empty referenced sitemap members: `0`; the two empty members were removed from `sitemap-index.xml` rather than filled with thin URLs.
- Meta robots parsing is attribute-order independent.

Invariant: `indexable => present_in_a_valid_sitemap` and `noindex => not treated as indexable`.

## Freeze evidence

| Check | Result |
|---|---|
| Frozen pillar HTML count | 6 |
| Six HTML hashes versus initial SHA | byte-identical |
| `html_mutation` | `false` |
| pre-date apply | refused |
| `EARLIEST_SAFE_ACTION_AT` | `2026-09-16` |
| committed-baseline `forbidden_drift` after reviewed recapture | `{}` |
| frozen test suite | `70 passed` |

Reviewed collateral recaptured intentionally: `script.js`, `js/modules/analytics.js`, `sitemap.xml`, `sitemap-index.xml`. The reason and implementation SHA are committed in `data/bofu-dominance/frozen-specs/hashes.json`. Rendering proof included byte identity of the six HTMLs, module parity, analytics/PII tests and the full Node 20 suite.

## Adversarial journey result

| # | Journey / invariant | Evidence | Result |
|---:|---|---|---|
| 1 | content → pillar → form → persisted lead | visitor-path + lead-function persisted receipt tests | PASS |
| 2 | content → pillar → WhatsApp → correlation | analytics unit and WhatsApp protocol contract | PASS |
| 3 | home → paid expansion diagnostic | contextual internal-entry test | PASS |
| 4 | Diretoria B2G → capacity enquiry | form contract + catalog fail-closed test | PASS |
| 5 | tool positive result → next action | tools suite | PASS |
| 6 | tool negative result → next action | tools suite | PASS |
| 7 | commercial route → source_to_service | attribution completeness | PASS, 13/13 |
| 8 | APPROVED offer → InStock | offers suite | PASS |
| 9 | kill switch → SoldOut | offers suite | PASS |
| 10 | noindex excluded | sitemap graph + SEO validator | PASS |
| 11 | indexable present in sitemap | sitemap graph | PASS, 65/65 |
| 12 | admitted site event has emitter | event dictionary | PASS, 59/59 |
| 13 | frozen pillar mutation fails CI | frozen fixture | PASS |
| 14 | nonexistent catalog deadline fails CI | offers adversarial fixture | PASS |
| 15 | invisible schema fails parity | visible-parity fixture | PASS |
| 16 | lead without consent fails closed | lead-function suite | PASS |
| 17 | missing webhook/secret fails closed | inbound/production-store/ops suites | PASS; production delivery not claimed |

## Test ledger

Authoritative runtime: Node `20.19.0`, matching `package.json`, CI and Netlify.

| Command | Result |
|---|---|
| `npm test` | PASS; complete repository suite reached `AFFECTED_SELECTOR_OK` |
| `npm run test:bofu-dominance` | PASS, 70 tests |
| `npm run test:inbound-gates` | PASS; 65-page conversion census |
| `npm run test:conversion` | PASS; 33 conversion checks + 77 offer checks + checkout prepare |
| `npm run test:analytics` | PASS; event/PII/attribution contracts |
| `npm run test:pseo-attribution` | PASS |
| `npm run test:offers` | PASS |
| `npm run test:checkout-negatives` | PASS |
| `npm run test:authority` | PASS |
| `npm run test:visible-parity` | PASS |
| `npm run test:cta-whatsapp` | PASS; 13 services, 263 HTML files audited, only five frozen warnings |
| `npm run test:sitemap-graph` | PASS, 21 tests |
| `npm run validate:seo` | PASS, `VALIDATION_OK` |
| `npm run organic:test` | PASS, 187 tests |
| `npm run test:lead-function` | PASS, 17 tests |
| `npm run test:inbound-handoff` | PASS |
| `npm run test:lead-store-production` | PASS; unavailable store returns 503, never memory success |
| `npm run test:ops-auth` | PASS; missing token returns 503 and bad token 401 |
| `npm run test:env-example` | PASS |
| `npm run test:workflow-gates` / `test:revops` / `test:schedules` | PASS |
| `npm run test:tools` / `test:knowledge-funnel` / `test:script-modules` | PASS |

The local browser geometry helper returned its documented soft `UI_GEOMETRY_UNAVAILABLE` because the host lacks `libnspr4.so`; it did not fail `npm test`. No threshold was lowered. The deploy preview and required BOFU/SEO/conversion gates ran independently.

## BLOCKED_EXTERNAL_ACTION — #230

Environment inspection in this session:

```text
CONFENGE_INBOUND_WEBHOOK_URL=MISSING
CONFENGE_INBOUND_WEBHOOK_SECRET=MISSING
OPS_TOKEN=MISSING
CONFENGE_AUTO_SEND_EVIDENCE=MISSING
consented_real_contact=MISSING
```

| Variable / proof | Where it must be defined | Verification command | Operational consequence while absent |
|---|---|---|---|
| `CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound` | Netlify production environment for web-cfg | `npm run probe:money-asset:prod` after all prerequisites exist | lead persists, but commercial webhook delivery cannot be claimed |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | Netlify production server environment and matching Warmbly HMAC secret | same production proof; never print the secret | handoff refuses/does not authenticate; no safe workaround |
| `OPS_TOKEN` | GitHub Actions secret `OPS_TOKEN` and the authorized operator shell | `OPS_TOKEN=... npm run revops:inbound-proof` | authenticated inbound/funnel counters remain unavailable |
| `CONFENGE_AUTO_SEND_EVIDENCE=OFF` | authorized proof shell after Warmbly confirms auto-send disabled | `OPS_TOKEN=... CONFENGE_AUTO_SEND_EVIDENCE=OFF npm run probe:money-asset:prod` | no claim that autonomous sends are disabled in production |
| real consented contact | real human action after consent; never a fixture | run the money-asset proof, then the person uses the second-reading action | end-to-end real commercial handoff remains unproved |

No secret was written to the repository. Synthetic/QA contacts remain excluded from commercial truth.

## Authority blockers

- Visible GitHub `sameAs` and `as_of` are present where supported.
- CREA number, responsible professional credential and street address remain `UNKNOWN`/not published.
- No Review, rating, Award, association or client proof was invented.

## Rollback

Revert PR `#256` as one campaign unit if a production regression is observed. Revert the prerequisite merge commits `5248de75`, `9c668729` and `5723cec9` only if their isolated guards/runtime cause the regression. No database migration, crawler, second identity model, new backend or destructive URL migration was introduced. The six frozen HTMLs need no rollback because they did not change.

## Final flags

```text
BOFU_CODE_READY=true
BOFU_PRODUCTION_HANDOFF_READY=false
BOFU_REVENUE_CONVERGENCE_READY=false
BLOCKER=#230
```

Final determination: `PARTIAL` — every canonical commercial service route now has a code-level, attributed and measurable action path, but production Warmbly handoff and qualified-pipeline reconciliation cannot be asserted until #230 receives real secrets, authenticated counters and one real consented contact.
