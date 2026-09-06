# Catálogo multivertical finito (MV-01 / #583)

Canonical contract: `CONFENGE_OFFER_CATALOG/2.0.0`.

This is not a second checkout catalog. Frozen B2G IDs, names and cents stay in:

- `data/commercial/deliverables-registry.v1.json`
- `data/commercial/offer-naming.v1.json`
- `data/offers/catalog.snapshot.json`

New nuclei are modeled here. B2G rows are expanded by reference.

Taxonomia: consuma primeiro a autoridade canônica em `data/corporate/taxonomy.v1.json`. A fixture em `data/offers/multivertical/taxonomy-fixture.v1.json` existe apenas para testes isolados; não é fallback de produção nem fonte de verdade pública.

```js
const catalog = require("./index.cjs");
const pin = catalog.loadCommittedConsumerPin();
const assembled = catalog.loadPinnedCatalog({ consumerPin: pin });
const result = catalog.mapDemand(demand, { assembled, pin });
```

O pin é autoridade externa commitada; nunca deve ser derivado do mesmo payload
que está sendo validado. Contrato ou hash ausente/divergente falha fechado.
Consumidores não inventam IDs de oferta.
