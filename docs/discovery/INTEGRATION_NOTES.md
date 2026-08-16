# Discovery observatory — integration notes

Prepare-only. Public-surface changes are **proposals**, not applied diffs.

## robots.txt (proposal)

Current `robots.txt` allows `/` and disallows `/ops/`, `/.netlify/`, `/piloto/`.

If a future approved Data Desk permalink is ever published under a private
prefix, add:

```
Disallow: /internal/
```

Do not add that rule until a public file actually lives there. This goal
does not write a public HTML page for the fixture.

Do not add `llms.txt` as a discovery strategy. The existing root `llms.txt`
is legacy and out of this goal — do not delete it here.

Authorized crawlers (`Googlebot`, `Bingbot`, `OAI-SearchBot`) stay allowed
on public indexable URLs. Do not add bot-specific `Allow`/`Disallow` pairs
that would serve different content.

## sitemap (proposal)

Keep noindex canaries (#83 contract analysis, #84 Market Answer) **out** of
every urlset. `sitemap-inteligencia.xml` is currently empty; do not add
Market Answer URLs until their publication gate flips `index_intent` to
`INDEX` and robots drop `noindex`.

The fixture permalink `/internal/data-desk/fixture-only/` must never appear
in `sitemap.xml`, `sitemap-editorial.xml`, `sitemap-inteligencia.xml` or
`sitemap-jurisprudencia.xml`.

When an approved Data Desk asset replaces the fixture, add **only** that
approved canonical to the matching urlset. Isolated, one-URL change.

## schema.org (proposal)

Do not emit `Dataset` / `DataDownload` on pages that do not describe a
real dataset with a real distribution. The Radar flagship already has a
Dataset block because it publishes a recorte; leave that page to its
owners.

For a future approved Data Desk surface, attach Dataset JSON-LD only when
the package `has_dataset` is true and `contentUrl` points at a real file.
Do not emit `DataCatalog` for a single asset.

Article / Organization / Breadcrumb remain owned by #74 and the page
goals. This observatory only *reads* them and flags mismatches.

## IndexNow

Existing live sender: `scripts/site/indexnow_submit.mjs` (explicit
`npm run indexnow:submit`). This goal does **not** invoke it.

New prepare-only entry: `python3 -m scripts.discovery indexnow`.
Default dry-run. `--send` raises. Allowlist:
`data/discovery/indexnow-allowlist.v1.json`.

A receipt is not indexation. Do not treat HTTP 200/202, if a human later
sends, as INDEX/APPEARANCE.

## Analytics / attribution

Downstream fields stay `UNKNOWN` until a real observed overlay is wired
from GSC / site analytics / Warmbly. Do not collapse referral into lead.

## Forbidden trees

This change set does not edit `scripts/contract_analysis/**`,
`scripts/market_answers/**`, Goal 05/06 pages, the PR #85 authority
matrix, SmartLic redirects, or shared lead libs.
