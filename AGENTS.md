# AGENTS.md — public-surface guardrails

Read [ADR-STRAT-002](docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md) and [MARKET-CAPTURE-OS](docs/strategy/MARKET-CAPTURE-OS.md) before changing public architecture, market strategy, data contracts, SEO templates or conversion flows.

## Non-negotiable boundaries

- `confenge.com.br` is the only public brand, domain and canonical visitor surface.
- New public pages, tools and datasets belong in this repository.
- Do not introduce SmartLic branding, navigation, handoff, CTA, independent runtime or public canonical URL.
- `extra-cli` owns acquisition, canonical facts, identity and provenance. Consume versioned SELECT-only contracts; do not build a crawler, parallel DataLake or second identity model here.
- `warmbly` owns commercial action. Emit normalized source `CONFENGE_WEB`, attribution and next-action context without leaking PII into analytics.
- Programmatic expansion requires distinct user utility, provenance/freshness, canonical hygiene, editorial/data gates and monitoring. Page count is not a success metric.
- Preserve reversible migration and explicit URL-level MIGRATE/REDIRECT/RETIRE decisions. Never blanket-redirect legacy URLs to the home page.

## Pull-request evidence

State the visitor job, acquisition/conversion hypothesis, data owner/contract, quality-gate result, analytics, rollback and affected ADR. If a change crosses a boundary, update the ADR before implementation.

## Market-capture gate

P0/P1 work must name its decision state (EXECUTE_NOW/VALIDATE/DEFER/SUNSET/SUPERSEDED), executive front, time to evidence and at least one leverage type: revenue, distribution, data, automation, trust or customer. Ask whether 100 repetitions improve the system or merely create 100 units of work. Qualified commercial opportunities—not development volume, raw leads, messages or page count—are the corporate North Star.
