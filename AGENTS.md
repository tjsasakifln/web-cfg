# AGENTS.md — public-surface guardrails

Read [ADR-STRAT-002](docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md), [RUNTIME-AUTHORITY](docs/architecture/RUNTIME-AUTHORITY.md) and [MARKET-CAPTURE-OS](docs/strategy/MARKET-CAPTURE-OS.md) before changing public architecture, market strategy, data contracts, SEO templates or conversion flows.

## Non-negotiable boundaries

- `confenge.com.br` is the only public brand, domain and canonical visitor surface.
- New public pages, tools and datasets belong in this repository.
- Do not introduce SmartLic branding, navigation, handoff, CTA, independent runtime or public canonical URL.
- `extra-cli` owns acquisition, canonical facts, identity and provenance. Consume versioned SELECT-only contracts; do not build a crawler, parallel DataLake or second identity model here.
- `warmbly` owns commercial action. Emit normalized source `CONFENGE_WEB`, attribution and next-action context without leaking PII into analytics.
- Programmatic expansion requires distinct user utility, provenance/freshness, canonical hygiene, editorial/data gates and monitoring. Page count is not a success metric.
- The conversion gate is fail-closed. Every indexable public route must belong to a family declared in `data/organic/public-family-registry.json` (visitor job, profile, terminal action, gate coverage). The declaration is checked against the rendered HTML, and any route that displays a price must capture the lead. Commercial debt exceptions are route-exact, dated, owned by an issue and reported on every `npm run inbound:gates`; permanent trust/legal exemptions require an explicit reason and may not hide a priced offer.
- Preserve reversible migration and explicit URL-level MIGRATE/REDIRECT/RETIRE decisions. Never blanket-redirect legacy URLs to the home page.

## Pull-request evidence

State the visitor job, acquisition/conversion hypothesis, data owner/contract, quality-gate result, analytics, rollback and affected ADR. If a change crosses a boundary, update the ADR before implementation.

## Market-capture gate

P0/P1 work must name its decision state (EXECUTE_NOW/VALIDATE/DEFER/SUNSET/SUPERSEDED), executive front, time to evidence and at least one leverage type: revenue, distribution, data, automation, trust or customer. Ask whether 100 repetitions improve the system or merely create 100 units of work. Qualified commercial opportunities—not development volume, raw leads, messages or page count—are the corporate North Star.

## ICP language contract

Every issue that can affect a visitor-facing surface must separate internal coordination language from public copy. Internal terms may remain in architecture, analytics, data contracts and implementation notes, but they are never default wording for a visitor.

Before implementation, the issue must state in direct Brazilian Portuguese:

1. who is arriving and the concrete situation they recognize;
2. the problem in the buyer's own professional vocabulary;
3. what CONFENGE helps decide, produce, review or organize;
4. the evidence and limit that make the claim defensible; and
5. the next step in terms of what happens after the action.

Do not expose `ICP`, `lead`, `CTA`, `handoff`, `pipeline`, `QCO`, `TOFU`, `MOFU`, `BOFU`, `white-label`, “capacidade elástica”, “demanda elástica”, `SKU`, `fail-closed`, `rollback`, executive-front names, repository names or system names as value propositions, navigation, labels, buttons, form guidance, confirmation messages or public metadata. Translate the underlying concept into the customer's situation and desired result. Examples include “apoio para completar uma disciplina do projeto”, “revisão técnica independente”, “compatibilização entre projetos” and “entenda quais informações precisamos para avaliar sua demanda”.

Purely technical issues must explicitly state that they do not authorize visible copy. If their scope grows to touch visitor-facing text, add the full language contract before implementation. Run `python scripts/site/test_public_plain_language.py` for every public-copy change and include the changed public strings plus their situation/problem/deliverable/limit/next-step mapping in review evidence.
