Parent: #493

## Decision state

**P2 / VALIDATE_CANARY** · Front: MARKET INTELLIGENCE MOAT / INBOUND COMPOUNDING · Time to evidence: um dataset/report canário · Leverage: data, distribution, trust e automation.

**Visitor job:** entender o que o dado prova, de onde veio, quão fresco é, quais limites tem e qual decisão apoia.  
**Hypothesis:** tratar source/method/freshness/uncertainty como composição torna a inteligência reconhecível e citável.  
**100 repetitions:** um data/publication contract com renderer melhora cada publicação; dashboards únicos e manuais não.

## Problem

`/radar/nacional-obras-publicas/` é a superfície mais específica atual: metodologia, tabelas, limites e downloads dominam. O residual é shell: `.content-hero.container`, system sans em 245/253 elementos e method/note boxes. Falta um archetype de publicação/dataset que preserve a força e evite futuros dashboards/cards genéricos.

## Contemporary evidence

- URL `/radar/nacional-obras-publicas/`; source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844/1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: `/tmp/confenge-design-audit-20260830/intelligence-mobile.png` (`a7acb2…`) e `intelligence-desktop.png` (`18c400…`).
- 7 sections, 12 rounded, 1 shadow, 1 gradient; 0 card-class.
- Selectors: `.content-hero.container`, `.method-box`, `.note-box`, tables, download buttons.
- Keep: version/status, methodology, demand source, planned cuts, limitations, citation, license and paid next action.
- Contracts: ADR-STRAT-003 where applicable; extra-cli is canonical owner via versioned SELECT-only contracts.

## Desired perception

Publicação técnica citável e dataset governado, não dashboard ou “data card” ornamental.

## Design hypothesis

Archetype `public_intelligence` com title/version/status, executive answer, methodology, data dictionary/unit, table/chart, source/freshness, limitation, citation/license e next action. Productive density for data; expressive opening only where useful.

## Constraints

No crawler/DataLake/identity; source/freshness/facts from extra-cli contract; editorial/data gates; canonical hygiene; no expansion by page count; accessibility of tables/charts; downloads/licenses; SEO/schema; conversion gate; analytics no PII.

## Scope

- prototype and implement one existing canary, no new dataset/page;
- define data/report archetype and meta roles;
- strengthen table/source/citation hierarchy and reduce generic hero/boxes;
- document chart/table/annotation rules and mobile alternatives;
- connect to public family registry and existing data/editorial gates.

## Out of scope

New crawler, API, dashboard, portal, dataset, data claim, chart without source, page family, SmartLic or second canonical identity.

## Acceptance

- [ ] source, contract/version, freshness/date, unit, method, limitation, citation/license and owner are first-class;
- [ ] any chart/table answers a named question and exposes source/context;
- [ ] no decorative KPI, invented metric, generic dashboard or technical-looking nodes;
- [ ] missing/stale/UNKNOWN is explicit and fail-closed;
- [ ] archetype differs from article and commercial page while sharing brand roles;
- [ ] mobile table/chart remains usable, semantic and non-misleading;
- [ ] download/citation and natural next action remain visible;
- [ ] extra-cli/ADR/public-family contracts and analytics pass;
- [ ] canary decision precedes scale;
- [ ] review answers eight human-crafted questions.

## Before / After evidence

390×844, 768×1024, 1024×768, 1440×1000; top/meta, method, table, limitation, download/citation, CTA; include fresh/stale/empty/UNKNOWN fixture when contract supports it.

## Responsive

Tables use semantic horizontal scroll or alternate representation with content parity; no chart legend below readable floor; touch/focus ≥44 px.

## Accessibility

Table headers/caption/scope, chart text alternative, color-independent states, keyboard, focus, contrast, zoom/reflow.

## Performance

No charting framework by default; SVG/HTML/table preferred when sufficient; payload/LCP/CLS within budgets.

## Analytics and data contracts

Only interaction/source/download/CTA events allowlisted, no PII. extra-cli remains facts/provenance owner; Warmbly action begins only after `CONFENGE_WEB` handoff.

## Rollback

Revert canary template/CSS while retaining same dataset/version/URL/download.

## Dependencies

`depends_on: #494, #495, #496, current extra-cli contract; ADR-STRAT-003 when family applies`  
`unblocks: #504 and public-intelligence archetype rollout`

## Perceptual leverage

`MEDIUM`

## Effort

`M`

## Human-crafted review

1. Específica ao dado? 2. Boxes necessárias? 3. Visual informa? 4. Tipografia clara? 5. Densidade/ritmo? 6. CONFENGE sem logo? 7. Dashboard default? 8. Prompt result?

Sem alegar usuário humano sem teste.

## PR evidence and ADR

Visitor job, acquisition/citation hypothesis, exact data contract/owner, gates, analytics, rollback, ADR-STRAT-002 e ADR-STRAT-003 quando afetada.
