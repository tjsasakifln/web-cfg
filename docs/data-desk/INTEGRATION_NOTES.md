# Data Desk — integration notes

Prepare-only. No public page is added in this change set.

## Public surface (proposal only)

When an approved asset replaces the fixture:

1. Choose a public permalink under `https://confenge.com.br/` that is not
   `/internal/`.
2. Add that single URL to the matching sitemap urlset (see
   `docs/discovery/INTEGRATION_NOTES.md`).
3. Point `public_canonical` at that URL in the asset JSON. Do not keep
   `FIXTURE_ONLY`.
4. Emit Dataset / DataDownload on that page only if the package still
   contains a real aggregated distribution. Never attach Dataset to an
   offer or author page just to look “citable”.
5. Embed snippet may be copied by third parties. Keep `data-tracker="none"`
   as the default. Do not inject GTM, pixels or third-party analytics
   into the embed.

Do not add the fixture to `sitemap.xml`. Do not give it a public
canonical. Do not open a generic `/api/data` route.

## Forms

The data-request contract is JSON in the package. A future HTML form
belongs on an approved Data Desk page and must reuse this contract
(consent, minimized PII, prazo UNKNOWN, correlation id). That HTML is
out of this goal so we do not edit Goal 05/06 pages.

Lead handoff, if any request later becomes a qualified opportunity, stays
on the existing Warmbly path with source `CONFENGE_WEB`. Do not invent a
second identity model.

## Syndication

`auto_send` is false and must stay false. Actual outreach is #66
human-send. This package only prepares five unnamed slots.

## Ownership

Owned here: `scripts/data_desk/**`, `tests/data_desk/**`,
`data/data-desk/**`, `docs/data-desk/**`.

Not owned: `scripts/contract_analysis/**`, `scripts/market_answers/**`,
Goal 05/06 pages, PR #85 authority matrix, SmartLic redirects, shared
lead libs.
