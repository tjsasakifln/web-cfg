# ADR-STRAT-002 — CONFENGE como superfície pública canônica

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decision owner:** CONFENGE
- **Supersedes:** SmartLic `ADR-STRAT-001` and SmartLic issue #1262

## Context

A estratégia anterior distribuía descoberta pública, inteligência e conversão entre marcas e domínios. Isso fragmentava autoridade, jornada, observabilidade e investimento. A nova ambição é fazer de `confenge.com.br` o principal ativo brasileiro de aquisição B2G para obras públicas, com utilidade real e inteligência pública defensável.

## Decision

`confenge.com.br` is the only public brand, domain and canonical surface.

| Plane | Canonical owner | Responsibility |
|---|---|---|
| Truth | `extra-cli` | acquisition, normalization, identity, provenance and versioned public-read contracts |
| Public | `web-cfg` / `confenge.com.br` | pages, tools, datasets, SEO, capture and visitor journey |
| Action | `warmbly` | commercial orchestration, next action and revenue operations |
| Legacy donor | `SmartLic` | selective asset harvest, redirects and historical evidence until archive |

There is no steady-state SmartLic product, brand, sub-brand, co-brand, “powered by” layer, visitor handoff or independent public runtime. Visitors remain in CONFENGE throughout discovery, evaluation and conversion.

Public intelligence is an acquisition product, not a content volume program. Every surface must provide a useful answer, visible source/provenance, freshness, a natural next step and measurable demand or commercial learning.

## Growth model

Work is classified into three motors:

1. **Revenue Now:** commercial execution in Warmbly and immediate high-intent conversion.
2. **Inbound Core:** technical quality, crawlability, conversion, measurement and the first canonical vertical.
3. **Inbound Compounding:** reusable data assets, tools, reports and programmatic surfaces that become more valuable with coverage and citation.

Priority is assessed with a shared model: `(demand × commercial relevance × reuse × defensibility × conversion potential) / (effort × dependency risk)`.

## Consequences

- New public capabilities are implemented only in `web-cfg`.
- `web-cfg` consumes versioned, SELECT-only contracts from `extra-cli`; it does not create a crawler, second DataLake or competing identity model.
- Warmbly receives normalized source `CONFENGE_WEB` plus attribution and next-action context.
- SmartLic work is limited to inventory, migration, redirects, reversible bridge operations and decommissioning.
- Programmatic SEO expansion is blocked without unique utility, editorial/data gates, canonical hygiene, provenance and monitoring.
- Legacy URLs are mapped individually to migrate, redirect or retire; blanket redirects to the home page are prohibited.
- Existing implementation role names may remain temporarily for compatibility but do not define architectural ownership.

## Rejected alternatives

- Maintaining SmartLic as an independent product or brand.
- Sending CONFENGE visitors to a SmartLic experience.
- Replicating ingestion or canonical data in the web repository.
- Publishing pages at scale primarily for rankings without differentiated user value.

## Execution anchors

- [Runtime authority map](RUNTIME-AUTHORITY.md)
- [#61 — central epic](https://github.com/tjsasakifln/web-cfg/issues/61)
- [#60 — first public B2G vertical](https://github.com/tjsasakifln/web-cfg/issues/60)
- [#62 — equity migration](https://github.com/tjsasakifln/web-cfg/issues/62)
- [#63 — asset harvest and portfolio](https://github.com/tjsasakifln/web-cfg/issues/63)
