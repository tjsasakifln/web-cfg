# Multi-vertical offer catalog (campaign 03 / #583)

Canonical contract: `CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904`.

This is not a second checkout catalog. Frozen B2G IDs, names and cents stay in:

- `data/commercial/deliverables-registry.v1.json`
- `data/commercial/offer-naming.v1.json`
- `data/offers/catalog.snapshot.json`

New nuclei are modeled here. B2G rows are expanded by reference.

Taxonomy: consume campaign 02 if present on one of the paths in `constants.cjs`; otherwise `data/offers/multivertical/taxonomy-fixture.v1.json` (replaceable).

```js
const catalog = require("./index.cjs");
const assembled = catalog.loadPinnedCatalog();
const pin = catalog.consumerPin(assembled);
const result = catalog.mapDemand(demand, { assembled, pin });
```

Missing or divergent contract/hash fails closed. Consumers must not invent offer IDs.
