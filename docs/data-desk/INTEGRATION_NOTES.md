# Data Desk — integration notes

The approved SC Market Answer is the operational canary. The fixture
remains loadable via `--asset` and is not deleted.

## Public surface

Static files live under the exclusive namespace:

`/assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/`

- Path-scoped `X-Robots-Tag: noindex, follow` in `_headers`.
- Absent from every sitemap urlset.
- Every artifact points at the Market Answer canonical source.
- `.md` and `package.json` stay in `data/data-desk/packages/**` because
  the public-artifact assembler forbids those names. Public copies use
  `.txt` / `.json` / `.csv` / `.svg` / noindex `index.html`.

Do not add the kit to `sitemap.xml`. Do not add a generic `/api/data`
route. Do not edit the Market Answer page in this change set
(see `PATCH-NEEDED.md`).

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
human-send. Five named finalists are `PREPARED_NOT_SENT` / `UNKNOWN`.

## Ownership

Owned here: `scripts/data_desk/**`, `tests/data_desk/**`,
`data/data-desk/**`, `docs/data-desk/**`, `assets/data-desk/**`.

Not owned: `scripts/contract_analysis/**`, `scripts/market_answers/**`,
Goal 05/06 pages, PR #85 authority matrix, SmartLic redirects, shared
lead libs.
