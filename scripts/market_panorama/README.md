# Market-panorama family

Fail-closed consumer of the extra-cli `public-read-confenge-dossier/1.0`
projection. Renders a public market panorama of obras públicas: value bands per
category, competition structure and open bids, from contracts already
published by public bodies.

```bash
python3 -m scripts.market_panorama build
python3 -m scripts.market_panorama validate
python3 -m pytest scripts/market_panorama/tests -q
```

npm: `market-panorama:build`, `market-panorama:validate`, `test:market-panorama`.

## Where the data comes from

extra-cli writes a rendezvous, this repository reads it. Nothing here crawls,
scores, or invents a fact.

```
extra-cli  python3 -m scripts.dossier build  --cnpj … --out DIR
extra-cli  python3 -m scripts.dossier handoff --dir DIR
                    │
                    ▼
${CONFENGE_HANDOFF_DIR:-~/.local/share/confenge/handoffs}/confenge-dossier/official-live-01/
    payload.json        public-read-confenge-dossier/1.0 (de-identified)
    manifest.json       hashes, producer commit, index_authorization=false
    state.json          decision + reason codes
    READY.json | BLOCKED.json     (mutually exclusive)
    SHA256SUMS.txt      over every other file
                    │
                    ▼
web-cfg    python3 -m scripts.market_panorama build
```

Only the de-identified projection crosses. The private dossier that carries the
prospect identity never leaves extra-cli.

## Fail-closed ingest

`consume.load_cohort` returns an **empty cohort with reason codes**, never a
rendered page, when any of these holds:

| Reason code | Meaning |
| --- | --- |
| `no_official_handoff` | rendezvous absent, or neither READY nor BLOCKED |
| `handoff_blocked` | producer emitted BLOCKED.json |
| `sha256sums_invalid` | a digest, the file set, or the READY/BLOCKED xor failed |
| `payload_schema_not_accepted` | schema is not `public-read-confenge-dossier/1.0` |
| `payload_not_official_live` | `catalog_mode` is not `official_live` |
| `payload_not_data_ready` | producer says the data is not ready |
| `payload_not_publication_ready` | producer says it is not publishable |
| `payload_carries_identity` | an identity key or a third-party CNPJ is in the payload |
| `producer_claimed_index_authorization` | the producer tried to grant INDEX |

An empty cohort is a correct, honest outcome. It is what CI sees.

## INDEX is a decision of this repository

The producer never grants INDEX and the consumer refuses a pack that claims to.
`publication_readiness=DATA_READY` is necessary and not sufficient.

A page becomes `PUBLISHABLE_INDEX` only when `data/editorial/market-panorama/approvals.json`
holds an entry for its `panorama_id` with `approved: true` **and** a
`content_hash` equal to the current payload hash. New facts change the hash, so
an approval expires the moment the data moves. A fixture can never index,
whatever the ledger says.

`render.sync_family_crawler_rules` keeps `robots.txt` and `_headers` in step:
the family is `Disallow` and `X-Robots-Tag: noindex` by default, and only the
approved slugs get an `Allow` and an `index, follow` override written after the
family block, because Netlify applies the last matching rule.

## Bounded rendering

The producer caps its own sections (25 opportunities, 15 competitors) and
`consume.load_cohort` refuses any rendezvous file over 4 MiB, so a well-formed
pack is small. The renderer does not rely on that: `PRICE_CATEGORY_ROW_CAP` and
`OPPORTUNITY_ROW_CAP` in `render.py` limit how many rows a section may draw, so
a producer change that raises its own limits cannot ship a page nobody can open.

The cap is applied **after** an explicit ordering — categories by contracts in
the reference, opportunities by nearest closing date — so the rows that survive
are a decision, not the accident of the order the payload was serialised in.
When the cap bites, the page says `Mostrando N de M` and keeps the real total
visible. A truncated table that does not declare itself truncated reads as a
complete one, which is the kind of quiet claim this family does not make.

## Privacy

The subject of the page is a market recorte, not a company. The rendered page
carries UF, CNAE, buyer count and contract count; it names public bodies, and
it does not name the contractor or the competitors. `consume.identity_leaks`
refuses a payload carrying an identity key with a real value or any CNPJ other
than CONFENGE's own publisher number, which appears in the organization schema
of every page on this site.

## Source vs generated

| Kind | Path | Role |
| --- | --- | --- |
| Source | `scripts/market_panorama/*.py` | consume, gate, render |
| Source | `scripts/market_panorama/fixtures/` | labeled test-only payload, never live |
| Source | `data/editorial/market-panorama/approvals.json` | individual INDEX approvals |
| Source | `docs/contracts/public-read-confenge-dossier-v1.md` | consumer contract |
| Generated | `panorama-mercado-obras-publicas/**/index.html` | pages and hub |
| Generated | `docs/editorial/MARKET_PANORAMA_STATUS.json` | build report |
| Generated | the marked blocks in `robots.txt` and `_headers` | crawler rules |
