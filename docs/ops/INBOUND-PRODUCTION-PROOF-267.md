# Inbound production proof — issue #267

**Contemporary state (2026-08-29):** `READY_MISSING_HUMAN_CANARY`

**Transport:** `TRANSPORT_READY`

**Human canary:** `REAL_CONSENTED_CANARY_MISSING`

**Decision:** `EXECUTE_NOW` · front `INBOUND ENGINE` · time to evidence `same-day`

**Leverage:** revenue, distribution, automation and trust

**Base/live SHA:** `72ed3831ba28c9400627cdc9599aa54e9329e178`

Production is `confenge.com.br` on nginx/Netcup. The protected `main` release
workflow builds the exact SHA through `site-ci` and pSEO gates, packages the
immutable artifact, stages it on Netcup and promotes the same SHA atomically.
The production store is the host-owned filesystem outside the release tree.
Production, storage authority and rollback all remain on the nginx/Netcup
plane; the legacy preview plane has none of those roles.

## Measured live result

The redacted, schema-closed evidence is
[`data/revops/inbound-proof-runs/inbound-issue-267-netcup-20260829.json`](https://github.com/tjsasakifln/web-cfg/blob/main/data/revops/inbound-proof-runs/inbound-issue-267-netcup-20260829.json).
It contains no raw receipt, contact field, credential or free-text lead value.

| Requirement | Result | Evidence |
| --- | --- | --- |
| live identity | PROVEN | nginx, `confenge-nginx-node/v2`, `netcup-production`, live SHA exactly `72ed3831…`; automatic release run `33256417759` succeeded |
| durable backend | PROVEN | `/ready` reports filesystem storage and `confenge-host-file-record/v1` |
| capture surface | PROVEN | current usable census is 21/21 ready: non-empty site key, widget and submit target; zero route blockers |
| historical 22nd route | SUPERSEDED | `/inteligencia/valor-tipico-contratos-pavimentacao/` is not a capture route after #461 removed its hidden metadata-only form; it links to a usable capture surface and must not inflate the census |
| synthetic persistence | PROVEN | authenticated non-human probe: first POST 201; retry 200 with the same receipt; synthetic count `5 → 6` |
| receipt/handoff | PROVEN | `WARMBLY_PRODUCTION_V1`, `READY`, `DELIVERED`, exactly one attempt, downstream 201/non-duplicate, matching receipt and no action ID |
| no dispatch | PROVEN | Warmbly health returned `auto_send=false`, `dispatch_attempted=false`; local notification and email both `skipped` |
| commercial isolation | PROVEN | real leads, pipeline and revenue stayed `0 → 0`; weekly excluded-non-real count moved `5 → 6` |
| real human canary | MISSING | no human identity or consent was fabricated |

### Why the capture denominator is 21, not 22

#465 initially froze 22 HTML files. A later protected-main change in #461
removed the market-answer canary's hidden metadata-only form because it was not
a visitor-usable terminal action. The contemporary test explicitly freezes 21
active capture routes. This proof audited all 22 historical paths: 21 are ready
and the removed path is `SUPERSEDED_NOT_CAPTURE`, not a broken capture route.
Reintroducing a hidden form merely to report 22/22 would weaken the conversion
gate and count work rather than utility.

## Probe safety contract

The production probe uses a server-only credential at least 32 characters long.
That credential, not the fixture name, establishes probe identity. The stored
record is forced to `record_kind=synthetic`, marked `authenticated_probe`, given
`next_action=exclude_from_commercial`, and retained outside all real-only
commercial totals. The existing intake validator's consent-shaped fixture is
not human consent and is not accepted as market evidence.

The reusable probe now fails before POST unless all of these are true:

- live build identity is present and, when supplied, equals `EXPECTED_SHA`;
- `LEAD_PROBE_SECRET` and `OPS_TOKEN` are present and sufficiently long;
- destination fingerprint is `WARMBLY_PRODUCTION_V1`;
- Warmbly health is `READY`, `auto_send=false` and
  `dispatch_attempted=false`;
- real-only funnel, weekly and system-health baselines are readable.

It emits only a SHA-256 receipt binding, booleans and aggregate deltas. Repeating
the proof exercises one idempotency key rather than manufacturing another
commercial unit; 100 repetitions strengthen the same fail-closed contract and
remain separately measurable as synthetic system health.

## Remaining human step — one submit click

No engineering command can manufacture the missing evidence. When the founder
chooses to act as the real canary with their own data and voluntary consent:

1. Open the canonical form on `https://confenge.com.br/`, enter the founder's
   own real contact context, solve Turnstile and review the consent text.
2. Click the submit button **once**. Do not retry, dispatch, requeue or contact
   anyone from automation.
3. Preserve the returned protocol privately and ask an operator to reconcile
   its hash with one Warmbly receipt/action while the safety gate remains off.

Until that voluntary click occurs, the honest final state is
`TRANSPORT_READY / REAL_CONSENTED_CANARY_MISSING`, never `PASS_10_10`.

## Ownership, analytics and rollback

- Visitor job: submit a consented request once and receive a durable protocol.
- Acquisition/conversion hypothesis: usable capture plus persist-first,
  idempotent Warmbly transport prevents intent loss without unsolicited action.
- Data contracts: `web-cfg` owns capture and the `CONFENGE_WEB` receipt; Warmbly
  owns commercial action/outcome; `extra-cli` remains SELECT-only authority for
  market facts, identity and provenance; Governance owns approvals/exceptions.
- Analytics: only aggregate public events; no probe PII. Synthetic records stay
  outside Qualified Commercial Opportunities and all real-only totals.
- Rollback: `/opt/confenge-web/bin/rollback FULL_SHA`, then verify build/runtime
  identity and `/ready`. Host-owned records survive release rollback. Never
  reclassify or replay the probe as real.
- Affected decision: ADR-STRAT-002 is preserved; no boundary change is proposed.

## Dated historical context — preserved, not executable

From 2026-08-24 through 2026-08-26, #267 investigated a stale Netlify production
plane and recorded skipped deploys there. On 2026-08-28 the authority moved to
nginx/Netcup under `RUNTIME-AUTHORITY`; on 2026-08-29 the automatic protected
`main` pipeline was proven live. Those comments remain historical evidence, but
their Netlify restore, retry, environment and rollback instructions are
superseded and must not be executed.
