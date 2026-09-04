# AGENTS.md — public-surface guardrails

Read [ADR-STRAT-002](docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md), [RUNTIME-AUTHORITY](docs/architecture/RUNTIME-AUTHORITY.md), [MARKET-CAPTURE-OS](docs/strategy/MARKET-CAPTURE-OS.md) and the [corporate taxonomy](data/corporate/taxonomy.v1.json) (`CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`) before changing public architecture, market strategy, data contracts, SEO templates or conversion flows.

## Non-negotiable boundaries

- `confenge.com.br` is the only public brand, domain and canonical visitor surface.
- CONFENGE is the umbrella brand for Engenharia, Perícias e Inteligência Técnica. B2G / obras públicas is a protected specialist vertical (`public_works_b2g`), not the corporate category and not deprecated.
- Nuclei, visitor jobs and terminal actions are read from the versioned taxonomy. Do not duplicate that content as Python/JS constants or invent a second identity model.
- New public pages, tools and datasets belong in this repository.
- Do not introduce SmartLic branding, navigation, handoff, CTA, independent runtime or public canonical URL. Do not introduce a sub-brand or second domain per nucleus.
- `extra-cli` owns acquisition, canonical facts, identity and provenance. Consume versioned SELECT-only contracts; do not build a crawler, parallel DataLake or second identity model here.
- `warmbly` owns commercial action, cadence, opportunity state, dispatch, proposal, billing and outcomes. Emit normalized source `CONFENGE_WEB`, attribution and next-action context without leaking PII into analytics. Do not build CRM or sales-ops in this repository.
- Governance owns policy, approval, exception and kill switch. Meetcfg consumes accepted context; it is not a second public surface.
- Programmatic expansion requires distinct user utility, provenance/freshness, canonical hygiene, editorial/data gates and monitoring. Page count is not a success metric.
- The conversion gate is fail-closed. Every indexable public route must belong to a family declared in `data/organic/public-family-registry.json` (visitor job, profile, terminal action, gate coverage) and, once goal 97 applies the field, an existing taxonomy `nucleus_id`. The declaration is checked against the rendered HTML, and any route that displays a price must capture the lead. Commercial debt exceptions are route-exact, dated, owned by an issue and reported on every `npm run inbound:gates`; permanent trust/legal exemptions require an explicit reason and may not hide a priced offer.
- Preserve reversible migration and explicit URL-level MIGRATE/REDIRECT/RETIRE decisions. Never blanket-redirect legacy URLs to the home page. Do not cannibalize B2G routes to advertise new nuclei.

## Pull-request evidence

State the visitor job, acquisition/conversion hypothesis, data owner/contract, quality-gate result, analytics, rollback and affected ADR. If a change crosses a boundary, update the ADR before implementation.

## Market-capture gate

P0/P1 work must name its decision state (EXECUTE_NOW/VALIDATE/DEFER/SUNSET/SUPERSEDED), executive front, time to evidence and at least one leverage type: revenue, distribution, data, automation, trust or customer. Ask whether 100 repetitions improve the system or merely create 100 units of work. Qualified commercial opportunities—segmented by nucleus and connected to proposal and revenue—not development volume, raw leads, messages or page count, are the corporate North Star.
