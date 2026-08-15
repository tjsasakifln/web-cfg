# Consumer contract — extra-cli #402

Status: **consumer-ready, live national producer absent.**
Owner (consumer): `web-cfg` / EDIÇÃO ZERO (`tjsasakifln/web-cfg#65`, PR #73).
Owner (producer): extra-cli PR [#402](https://github.com/tjsasakifln/extra-cli/pull/402) (merged).
Schema id: `public-read-research-flagship/1.0`
Schema version: `v1.1.0`
Consumer id: `web-cfg/flagship-research`

This repository consumes the SELECT-only export:

```bash
python3 -m scripts.public_read export-research --fixture PATH --out DIR
```

Artifact: `research-export.json`. National publish is allowed only when
`claim.national_claim_allowed` is `true`. That field is true only when
`nacional_completo` holds, freshness is within 48h, no series cell is
UNKNOWN, Extra 1093 is not the denominator, and no material reason_code
remains.

Until a live versioned export of this schema lands and passes that gate,
the edition stays on the checksummed 4-UF `data/pseo` snapshot as
**preview only**: `NEEDS_DATA`, `noindex,nofollow`, off sitemap.

Grain: `competence × geography_kind × geography_code × archetype_id`.
Value semantics: integral nominal BRL; P25/median/P75 nearest-rank;
never m² or deflated price.

The older note `consumer-contract-extra-cli-400.md` is superseded. extra-cli
issue #400 is the product ticket; #402 is the shipped contract.
