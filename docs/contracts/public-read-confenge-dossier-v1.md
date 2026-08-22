# Consumer contract — `public-read-confenge-dossier/1.0`

Producer: extra-cli `scripts/dossier/` (`python3 -m scripts.dossier handoff`).
Producer-side contract: `extra-cli/docs/contracts/confenge-dossier-v1.md`.
Consumer: `web-cfg` market-panorama family (`scripts/market_panorama/`).
Rendezvous: `${CONFENGE_HANDOFF_DIR:-$HOME/.local/share/confenge/handoffs}/confenge-dossier/official-live-01/`.

This repository consumes a versioned, de-identified projection. It does not
crawl, does not copy a DataLake, does not rescore and does not invent evidence.

## What arrives

| File | Role |
| --- | --- |
| `payload.json` | the projection, schema `public-read-confenge-dossier/1.0` |
| `manifest.json` | hashes, `producer_commit`, `index_authorization: false` |
| `state.json` | handoff decision and reason codes |
| `READY.json` xor `BLOCKED.json` | the only live-ingest signal |
| `SHA256SUMS.txt` | digests over every other file |

Payload fields this consumer reads: `schema`, `contract_version`,
`catalog_mode`, `data_state`, `publication_readiness`, `as_of`, `content_hash`,
`source_dossier_hash`, `subject_profile`, `reason_codes`, `limitations`, and
the `price_panel`, `competitors` and `open_opportunities` sections.

## What the consumer promises

- **UNKNOWN is never treated as zero.** A missing value renders as `UNKNOWN`.
- **No inference.** The page never states a right, an imbalance, a loss, or
  that an adjustment is due. It reproduces the producer's declared limitations
  and reason codes verbatim.
- **No identification.** The contractor and the competitors are not named. Only
  public bodies are. A payload that carries an identity key with a real value,
  or any CNPJ other than CONFENGE's own, is refused whole.
- **The producer never grants INDEX.** A manifest asserting
  `index_authorization` or `publication_authorization` is refused as malformed.
- **`DATA_READY` is not permission to index.** It only permits a `noindex`
  draft. INDEX requires an individual approval here, bound to the payload
  `content_hash`; when new facts change the hash the approval expires.
- **An out-of-range panel yields no position.** Where the producer marked a
  category `OUT_OF_PANEL_RANGE`, the page states that no percentile position is
  declared instead of rendering one.

## What the consumer owns

Editorial INDEX, sitemap membership, crawler rules, SEO and CTA. All of it is
decided in this repository, per page, and recorded in
`data/editorial/market-panorama/approvals.json`.

## Compatibility

`additive_nullable_within_v1`. A new nullable field inside `1.0` is ingested and
ignored until this consumer renders it. A changed meaning requires a new
version and an updated contract on both sides.
