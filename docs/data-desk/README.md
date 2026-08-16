# CONFENGE Data Desk

Prepare-only citation / download / request kit for issue #89. Default
asset is a labeled fixture. Swapping an approved asset is a registry
change, not a redesign.

## Visitor job

A journalist, association, researcher or partner should be able — once an
approved asset exists — to cite a CONFENGE recorte with method, `as_of`,
limitations and a visible source link, or request a scoped cut without
getting a raw dump or an automatic promise.

## Decision state

VALIDATE. Time to evidence: generate the package twice, confirm the hash
is stable, then (later, human-gated) name five syndication targets via
#66. Leverage: distribution, trust, data.

## What the generator emits

For `data/data-desk/fixture/asset.v1.json`:

- citation text and permalink (no public canonical)
- accessible SVG when provided
- aggregated CSV when provided (not a raw/sensitive dump)
- method / schema / data version, `as_of`, coverage, limitations
- correction link, creator, publisher, license, usage, identifier
- Dataset / DataDownload **only** when a real dataset file exists
- optional embed with visible Source/canonical and no tracker
- one-page press/research brief
- data-request contract (`FULFILLED | DECLINED | NEEDS_SCOPE | UNKNOWN`)
- five-slot syndication manifest with `auto_send=false`

Watermark: `FIXTURE_ONLY`. Not in any sitemap. Not distributed.

## Commands

```bash
python3 -m scripts.data_desk generate
python3 -m scripts.data_desk generate --out /tmp/data-desk-preview --as-of 2026-08-16
```

## Data request

Intake is a contract, not an API. Required: finalidade, organization,
role, consent, prazo=`UNKNOWN`, correlation id, attribution. Forbidden:
CPF, RG, personal phone, home address, raw documents. No automatic
promise.

## Syndication

Five later-nameable slots (`target-1` … `target-5`). Nothing is sent.
Naming a target is a human edit of `syndication.json` plus #66.

## What this is not

- Not a generic public API, partner portal, or widget farm.
- Not pay-to-cite or a link scheme.
- Not a reason to close #89. Closing needs an approved asset and real
  reuse that preserves provenance.
