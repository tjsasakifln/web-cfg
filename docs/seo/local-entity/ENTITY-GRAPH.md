# Entity graph classification

Machine record: `data/local-entity/entity-graph.json`.

Source: committed `especialista/tiago-jun-sasaki/index.html` JSON-LD, `data/site/proof.json`, `data/site/brand.json` contact.

| Field | Campaign status | Note |
|---|---|---|
| Organization `@id` | SELF_DECLARED | `https://confenge.com.br/#organization` |
| Person `@id` | SELF_DECLARED | `https://confenge.com.br/#tiago` |
| credentials / alumniOf USP | SELF_DECLARED | proof.json circular VERIFIED remapped |
| credentials / CREA | NOT_PUBLIC | not a public proof record |
| worksFor | SELF_DECLARED | Person → Organization `@id` |
| knowsAbout | SELF_DECLARED | published library topics |
| sameAs | UNKNOWN | no classified public profiles; do not invent |
| contact (email, phone, CNPJ) | SELF_DECLARED | already on the specialist page |
| extra personal email | NOT_PUBLIC | must not appear in outputs |
| areaServed Country Brasil | SELF_DECLARED | atendimento nacional |
| city areaServed | UNKNOWN | DDD 48 ≠ city claim |
| streetAddress | NOT_PUBLIC | no public street NAP |

No LocalBusiness, PostalAddress, Review or AggregateRating node is published on the specialist page. Adding one in this PR would fail the honesty gate.

The canonical home is also audited node-by-node as a read-only input. New identity facts remain
deferred until a versioned SELECT-only identity projection from `extra-cli` carries provenance and
freshness; this package does not promote owned copy into an independent canonical identity source.
