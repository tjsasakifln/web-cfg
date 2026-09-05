# ADR-STRAT-002 — CONFENGE como superfície pública canônica

- **Status:** Accepted (amended 2026-09-05)
- **Date:** 2026-08-14
- **Amended:** 2026-09-05
- **Decision owner:** CONFENGE
- **Supersedes:** SmartLic `ADR-STRAT-001` and SmartLic issue #1262
- **Amendment authority:** [#577](https://github.com/tjsasakifln/web-cfg/issues/577), [#578](https://github.com/tjsasakifln/web-cfg/issues/578), [#583](https://github.com/tjsasakifln/web-cfg/issues/583) and ADR-STRAT-004
- **Taxonomy contract:** `CONFENGE_CORPORATE_TAXONOMY/1.0.0` in `data/corporate/taxonomy.v1.json`

## Amendment 2026-09-05 (current)

On 2026-09-04 the founder recorded that CONFENGE is the umbrella public brand
for **Engenharia, Perícias e Inteligência Técnica** (Engineering, Expert
Evidence and Technical Intelligence). `confenge.com.br` remains the only public
brand, domain and canonical visitor surface. No sub-brand, second domain or
independent public runtime is authorized.

B2G / obras públicas is a **protected specialist vertical**, not the corporate
category and not a deprecated leftover. Current B2G URLs, offers, proof, index
and conversion stay in force until a later campaign mutates those families
URL-by-URL.

The architecture reads one versioned commercial constitution. The five nuclei
are internal operational groupings; the public entry point is a versioned
situation/intent matrix. Neither is a Python/JS constant. Consumers pin contract
and content hashes. Missing or divergent version/hash fails closed.

### Five internal operational nuclei

| ID | Operational label | Current publication state |
|---|---|---|
| `expert_evidence_assistance` | Perícias e Assistência Técnica | draft |
| `property_valuation` | Avaliações de Imóveis | draft |
| `building_engineering_documentation` | Engenharia de Edificações e Documentação | draft |
| `occupational_safety` | Segurança do Trabalho | draft |
| `public_works_b2g` | Obras Públicas e B2G | published, protected vertical |

Each nucleus carries ownership, limits, conflict, sensitivity, field rule,
proof classes, references and measurement. Its label is not required public
copy and does not decide a route. `CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0` maps a
recognizable situation to a canonical service family, finite offer IDs or
`NEEDS_CONTEXT`/GAP. Audience examples never become route truth.

### Owner planes (unchanged split, named explicitly)

| Plane | Canonical owner | Responsibility |
|---|---|---|
| Public inbound | `web-cfg` / `confenge.com.br` | pages, tools, datasets, SEO, capture, visitor journey, public analytics |
| Truth | `extra-cli` | acquisition, normalization, identity, provenance and versioned public-read contracts when data acquisition is required |
| Policy | Governance / Control Center | policy, approval, exception and kill switch |
| Action | `warmbly` | commercial orchestration, cadence, opportunity state, dispatch, proposal, billing and outcomes |
| Accepted context | Meetcfg | consumer of context already accepted by the commercial owner |

`web-cfg` does not own CRM, dispatch, cadence, opportunity state, proposal or
billing. If a commercial function would still be required after replacing the
public site, it does not belong here.

### North Star

Qualified Commercial Opportunities remain the corporate North Star. QCO is
segmented by `nucleus_id` and connected to downstream proposal and revenue.
Page count, raw leads, impressions, commits and closed issues are not success
metrics.

### Coexistence and non-cannibalization of B2G

- Do not rewrite, redirect or noindex B2G routes to make room for new nuclei.
- Do not dilute B2G equity, catalog 54/54 or conversion gates as “strategy”.
- Shared chrome and service pages start from buyer situations. Nucleus names may
  be secondary organization only when useful. This ADR does not change home,
  navigation, footer or forms.
- New nuclei reuse the same taxonomy, family registry, capture contract and
  conversion gate. The 100th offer or route does not get special-case code.

### Rules for adding a nucleus, offer, route, location or proof

1. **Nucleus:** founder decision, ADR amendment, taxonomy version bump, unique
   ASCII id, every required field, no sub-brand.
2. **Offer:** catalog owner references an existing `nucleus_id`; missing
   nucleus fails closed. Taxonomy stores `offer_id` only.
3. **Route:** `public-family-registry.json` remains fail-closed (visitor job,
   terminal action and gate coverage). MV-09 must bind each new route to an
   existing `intent_family`, resolve its canonical service family and retain an
   operational `nucleus_id` only as ownership metadata. This campaign does not
   edit that shared registry.
4. **Location:** distinct visitor utility; no doorway pages; geography is a
   field rule, not a nucleus.
5. **Proof:** source, date and permission class. Invented credentials, cases,
   rankings or seals fail closed.
6. **National service:** commercial availability may be national, but technical
   acceptance confirms scope, location, field/logistics, professional and PJ
   formalities, proven attribution, registration or visa and ART when applicable.

### What this amendment does not change

- Single public brand/domain/surface on `confenge.com.br`.
- No SmartLic product, brand, handoff, CTA or independent public runtime.
- `web-cfg` consumes SELECT-only contracts from `extra-cli`.
- Warmbly receives normalized source `CONFENGE_WEB`.
- Programmatic expansion still requires utility, provenance, canonical
  hygiene, editorial/data gates and monitoring.
- URL-level MIGRATE/REDIRECT/RETIRE; no blanket home redirects.
- Truthfulness, privacy, security, professional-scope, provenance and
  rollback controls remain mandatory.

## Historical decision 2026-08-14 (preserved)

The 2026-08-14 decision remains in force for the public-surface, plane-ownership
and SmartLic-retirement clauses above. The **category thesis** of that date —
CONFENGE as a B2G-only acquisition asset — is superseded by this amendment.
B2G continues as the first shipped inbound vertical (`#60`) and as nucleus
`public_works_b2g`.

<!-- SUPERSEDED_THESIS_START -->

### Original context (2026-08-14)

A estratégia anterior distribuía descoberta pública, inteligência e conversão entre marcas e domínios. Isso fragmentava autoridade, jornada, observabilidade e investimento. A nova ambição é fazer de `confenge.com.br` o principal ativo brasileiro de aquisição B2G para obras públicas, com utilidade real e inteligência pública defensável.

### Original decision (2026-08-14)

`confenge.com.br` is the only public brand, domain and canonical surface.

| Plane | Canonical owner | Responsibility |
|---|---|---|
| Truth | `extra-cli` | acquisition, normalization, identity, provenance and versioned public-read contracts |
| Public | `web-cfg` / `confenge.com.br` | pages, tools, datasets, SEO, capture and visitor journey |
| Action | `warmbly` | commercial orchestration, next action and revenue operations |
| Legacy donor | `SmartLic` | selective asset harvest, redirects and historical evidence until archive |

There is no steady-state SmartLic product, brand, sub-brand, co-brand, “powered by” layer, visitor handoff or independent public runtime. Visitors remain in CONFENGE throughout discovery, evaluation and conversion.

Public intelligence is an acquisition product, not a content volume program. Every surface must provide a useful answer, visible source/provenance, freshness, a natural next step and measurable demand or commercial learning.

<!-- SUPERSEDED_THESIS_END -->

## Growth model

Work is classified into three motors:

1. **Revenue Now:** commercial execution in Warmbly and immediate high-intent conversion.
2. **Inbound Core:** technical quality, crawlability, conversion, measurement and the shipped verticals, starting with the protected B2G vertical and expanding through the taxonomy.
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
- The public runtime host for `confenge.com.br` is the nginx/Netcup VPS plane recorded in [RUNTIME-AUTHORITY.md](RUNTIME-AUTHORITY.md) (`confenge-nginx-node/v2`). Netlify is a leftover/preview plane, not production.
- Navigation, footer, home, forms and rendered schema continue to describe the current B2G surface until later campaigns consume the taxonomy. Tests that assert that current HTML remain `KEEP_VERTICAL`.

## Rejected alternatives

- Maintaining SmartLic as an independent product or brand.
- Sending CONFENGE visitors to a SmartLic experience.
- Replicating ingestion or canonical data in the web repository.
- Publishing pages at scale primarily for rankings without differentiated user value.
- Making B2G the only corporate category (superseded 2026-09-04).
- Deprecating or cannibalizing the B2G vertical to advertise four new nuclei.
- Moving CRM, dispatch, cadence, proposal or billing into `web-cfg`.
- Introducing a sub-brand or second public domain per nucleus.

## Execution anchors

- [Runtime authority map](RUNTIME-AUTHORITY.md)
- [Corporate taxonomy](../../data/corporate/taxonomy.v1.json)
- [Commercial constitution and finite portfolio](ADR-STRAT-004-commercial-constitution-and-finite-portfolio.md)
- [B2G exclusive-hardcode inventory](B2G-EXCLUSIVE-HARDCODE-INVENTORY.md)
- [#577 — umbrella positioning epic](https://github.com/tjsasakifln/web-cfg/issues/577)
- [#578 — architectural generalization](https://github.com/tjsasakifln/web-cfg/issues/578)
- [#61 — central epic](https://github.com/tjsasakifln/web-cfg/issues/61)
- [#60 — first public B2G vertical](https://github.com/tjsasakifln/web-cfg/issues/60)
- [#62 — equity migration](https://github.com/tjsasakifln/web-cfg/issues/62)
- [#63 — asset harvest and portfolio](https://github.com/tjsasakifln/web-cfg/issues/63)
