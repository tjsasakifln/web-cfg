# Third-party conversion measurement decision

- **Issue:** [#247](https://github.com/tjsasakifln/web-cfg/issues/247)
- **Decision state:** `EXECUTE`
- **Decision date:** 2026-10-25
- **Review date:** 2027-01-25
- **Owner:** CONFENGE
- **Scope:** optional site measurement only
- **Machine-readable authority:**
  [`data/ops/third-party-conversion-decision.v1.json`](../../data/ops/third-party-conversion-decision.v1.json)

## Decision

Use the existing confirmed Google Analytics 4 web stream for
`confenge.com.br`, and only that stream. Browser export is off by default and
begins only after the visitor explicitly accepts optional measurement. The
choice is revocable, no queued first-party event is replayed retroactively, and
the first-party `/api/web/collect` pipeline remains required and independent.

The machine record is the only authority for the provider, measurement ID,
property, stream, consent storage key, setter and dedicated queue. Property and
stream identifiers are operational configuration, not visitor-facing copy.

## Data boundary

The CONFENGE exporter explicitly supplies only allowlisted event names, the
canonical page location without query or fragment, an empty referrer and the
constant page title `CONFENGE`; it supplies no other app event property. The
Google protocol can still add measurement/client identifiers and automatic
technical fields such as language, screen/device and session metadata. The app does
not supply contact fields, free text, raw URLs or referrers, query strings,
fragments, or internal lead, receipt, correlation, event, session, CTA, asset
or service identifiers. Google signals and advertising features stay disabled.

The first-party collector remains source `CONFENGE_WEB`, with
`aggregate_allowlist_empty`. Refusing GA4 does not disable that separate
collector. The existing first-party master opt-out also denies GA4.

## Paid advertising remains blocked

This authorization does not approve Google Ads, remarketing, marketing
personalization, issue #87 execution, a media hypothesis, a spend cap or paid
spend. Issue #87 remains `VALIDATE`; Ads and server-side forwarding remain
forbidden. A later advertising proposal needs its own explicit authority.

## Consent and rollback

The privacy notice explains optional Google measurement, approximate device and
location processing, refusal and withdrawal. Withdrawal stops future export; it
does not fabricate deletion or retroactive anonymity for processing already
performed under consent.

Rollback removes the GA4 loader/exporter, updates `analytics_storage` to
`denied`, keeps `/api/web/collect`, and runs `npm run test:analytics`.

This decision does not change ADR-STRAT-002 boundaries.
