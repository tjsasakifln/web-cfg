# Third-party conversion measurement decision

- **Issue:** [#247](https://github.com/tjsasakifln/web-cfg/issues/247)
- **Decision state:** `DEFER`
- **Decision date:** 2026-08-23
- **Review date:** 2026-09-20
- **Owner:** CONFENGE
- **Executive front:** INBOUND ENGINE
- **Leverage:** distribution + trust
- **Time to evidence:** 28 days after an explicitly authorized canary starts
- **Machine-readable authority:**
  [`data/ops/third-party-conversion-decision.v1.json`](../../data/ops/third-party-conversion-decision.v1.json)

## Decision

Do not install a browser analytics tag or forward first-party events to an
analytics vendor. The existing `/.netlify/functions/collect` path remains the
measurement authority for the public site. Its `CONFENGE_WEB` events retain the
`aggregate_allowlist_empty` policy; analytics receive no lead identity or other
PII.

The previous optional Plausible environment switch is removed. External export
cannot be enabled by changing production environment variables alone.

## Visitor job and hypothesis

The visitor needs to understand and use CONFENGE without being observed by an
unannounced vendor. A third-party destination is justified only when there is a
specific, approved paid-search experiment that needs conversion feedback. An
available vendor dashboard is not evidence of that need.

## Promotion gate

Promotion requires one new reviewed PR that changes the machine decision to
`EXECUTE` and proves every condition below in the same revision:

1. issue #87 is `EXECUTE`, with an in-repository versioned acquisition
   hypothesis;
2. a positive BRL spend cap and its in-repository human approval are
   referenced;
3. consent defaults to denied and the visitor explicitly opts in before any
   browser or server-side export;
4. the versioned consent contract supports withdrawal and has an enforcement
   test proving that denied consent exports zero events;
5. exactly one provider is named and matches the reviewed runtime; its
   authorization owner and valid, unexpired ISO-date window are recorded;
6. `npm run test:analytics` continues to prove an empty PII allowlist.

The measurable revisit trigger is the first of:

- 2026-09-20; or
- all four readiness facts becoming true: #87 = `EXECUTE`, hypothesis reference
  present, approved spend cap greater than zero, and versioned consent contract
  plus enforcement test present.

Reaching the review date causes a decision review, not automatic installation.

## Analytics, data owner and rollback

- Public event owner: `web-cfg`, source `CONFENGE_WEB`.
- Commercial outcome owner: Warmbly; `qualified_lead` and `pipeline` remain
  observed-only and are not invented by the public collector.
- No external analytics destination receives events in `DEFER`.
- Rollback after any future canary: remove the external loader/exporter and its
  runtime configuration, retain `/.netlify/functions/collect`, then run
  `npm run test:analytics`.

This decision does not change ADR-STRAT-002 boundaries.
