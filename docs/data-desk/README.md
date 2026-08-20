# CONFENGE Data Desk

Citation / download / request kit for issue #89. The operational canary
is the approved Santa Catarina Market Answer. The labeled fixture remains
on disk for tests and is not a public asset.

## Visitor job

A journalist, association, researcher or partner should be able to cite a
CONFENGE recorte with method, `as_of`, limitations and a visible source
link, or request a scoped cut without getting a raw dump or an automatic
promise.

## Decision state

VALIDATE. Time to evidence: generate the package twice, confirm the hash
is stable, then (later, human-gated) send five syndication targets via
#66. Leverage: distribution, trust, data.

## Operational asset

`data/data-desk/valor-tipico-contratos-pavimentacao-sc/asset.v1.json`

Canonical source (not this kit):

`https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/`

Public files (noindex,follow, off sitemap):

`https://confenge.com.br/assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/`

A Market Answer page link is PATCH-NEEDED and out of this change set.

## Commands

```bash
python3 -m scripts.data_desk generate
python3 -m scripts.data_desk generate --as-of 2026-08-17T11:29:23.193694+02:00
python3 -m scripts.data_desk generate --asset data/data-desk/fixture/asset.v1.json --out data/data-desk/packages/fixture-only
```

## What the generator emits

For the approved asset: Portuguese citation + short bibliographic form,
accessible SVG, aggregated CSV, method.json/md, coverage manifest,
limitations.md, PRESS-BRIEF.md, package.json with hashes,
request-contract.json, syndication.json (`auto_send=false`), tracker-free
embed, Dataset/DataDownload only because the CSV is a real published
file. PNG is omitted (no reproducible local converter).

Watermark: none on the real asset. Fixture stays `FIXTURE_ONLY`.

## Syndication

Five named finalists, status `PREPARED_NOT_SENT`, outcome `UNKNOWN`.
Nothing is sent. `auto_send` is false and must stay false.

## What this is not

- Not a generic public API, partner portal, or widget farm.
- Not pay-to-cite or a link scheme.
- Not a reason to close #89. Closing needs observed reuse that preserves
  provenance. External reuse remains UNKNOWN.
