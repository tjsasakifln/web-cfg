# UI/UX remediation: editorial + tools (shared system)

## Business goal
Turn editorial pages and interactive tools into inbound assets that solve part of the visitor's problem, demonstrate technical rigor for B2G contractors, and convert material cases to CONFENGE contact without AI-sounding copy or SaaS chrome.

## What changed (shared system)

### 1. Copy gate
- `scripts/site/lint_editorial_copy.py` scans editorial JSON sources, nurture tracks, and tool HTML for unauthorized em dash (`—`) and high-confidence AI patterns.
- Wired as `npm run lint:editorial-copy` and into `test:copy`.
- Report: `docs/editorial/COPY-LINT-REPORT.json`.

### 2. Editorial interaction model
- Explicit `interaction_type`: `article | operational_guide | checklist | calculator | diagnostic`.
- `resolve_interaction_type()` in `scripts/editorial/render.py` — no longer treats every `guia-*` page as checklist.
- Structured checklist via `checklist_items` + `scripts/editorial/checklist_ui.py` (tri-state Atendido/Pendente/N/A; blockers as negative signals).
- Brazilian dates in hero meta (`Publicado em 2 de agosto de 2026`).

### 3. Tools design system
- `styles-tools.css` scoped components (`.tool-shell`, `.tool-form`, `.tool-result`, `.tool-limit-panel`, …).
- No per-page `#0b5fff` inline styles.
- `assets/js/tools-common.js`: BRL helpers, versioned localStorage, copy/download/report, analytics without PII.
- `assets/js/tool-compute.js` (+ `.cjs`): pure compute for limits, reequilibrio weights, event matrix hypotheses, aditivo readiness.

### 4. Pilot tools
| URL | Change |
|-----|--------|
| `/ferramentas/` | CollectionPage/ItemList hub cards, nav Ferramentas, no WebApplication |
| `/ferramentas/limite-acrescimos-supressoes/` | Independent acréscimo/supressão panels, BRL parse, precise non-legal wording |
| `/ferramentas/checklist-reequilibrio/` | Weighted categories; central blockers block high readiness |
| `/ferramentas/matriz-atraso-obra/` | Dynamic events; hypothesis-only (no count-based verdict) |
| `/guias-contratos-obras/checklist-pedido-aditivo/` | Tri-state structured checklist, blockers ≠ progress |

### 5. Nav
- `data/site/brand.json`: Ferramentas in desktop navigation.

## Component matrix (old → new)

| Old | New |
|-----|-----|
| Inline `<style>` + `#0b5fff` | `styles-tools.css` tokens (green/navy) |
| `tool-card*` unstyled | Styled `.tool-card` list |
| `guia-*` ⇒ checklist | `interaction_type` + optional `checklist_items` |
| Binary checkboxes progress | Tri-state + weighted readiness |
| `computeChecklistScore` average | `computeReequilibrio` with blockers |
| `computeMatrizAtraso` count verdict | `computeMatrizEventos` hypotheses |
| `num()` silent 0 | `parseBRL` reject invalid |
| "OK" green legal | "Dentro do limite numérico calculado…" |
| "Quando a CONFENGE agrega valor" spam | One contextual CTA after result |
| Hub `WebApplication` | `CollectionPage` + `ItemList` |

## AI copy rewrites (sample)
| Before | After |
|--------|-------|
| Pedido incompleto vira diligência eterna… | Pedido incompleto gera diligência prolongada… |
| O que faltar vira risco explícito — não surpresa… | Marque cada requisito e revise as pendências… |
| resultado acionável | resultado útil no navegador |
| ordem de ataque | ordem recomendada de correção |
| engenharia + prova | documentação técnica e prova contemporânea |
| Análise inicial — … | Análise inicial: … |

## Tests (shipped entry points)
- `npm run test:tool-compute` — BRL, 25/50 limits, independent balances, reequilibrio blockers, matrix hypothesis, aditivo readiness
- `npm run test:tools` — structure, no blue, hub schema, styles-tools
- `npm run test:tool-events` — event name literals + page bindings
- `npm run lint:editorial-copy` — zero unauthorized em dash in sources
- `pytest scripts/editorial/tests/test_markdown_checklist.py` — interaction_type semantics

## Remaining limits (honest)
- The browser E2E was rerun against `_site` at 320, 360, 390, 430, 768, 1024 and 1440 px. The committed report has zero failures, zero overflow and zero critical/serious axe findings.
- Source titles from official Planalto/AGU records may still contain em dashes in the Fontes section (external titles, not CONFENGE prose).
- Wave 1 pages remain non-indexable until named human approval (governance unchanged).
- Interactive inputs require JavaScript. Without it, every client-only form stays visibly disabled and uses POST to the same route, so values and free text cannot leak into a query string.

## Future (out of scope)
- Template generator for new tools from JSON config only.
- Deeper literary pass on all 120+ conteudos HTML pages.
- Server-side tool state (explicitly not desired).

## Evidence
- E2E/a11y: `docs/uiux-tools-remediation/evidence/e2e-report.json`, `axe-report.json`
- Screenshots after: `docs/uiux-tools-remediation/evidence/screenshots/after/`
- Copy lint: `docs/editorial/COPY-LINT-REPORT.json`
- Findings / matrix / rewrites: sibling markdown files in this folder

## Run verification
```bash
npm run test:tool-compute
npm run test:tools
npm run test:tool-events
npm run lint:editorial-copy
npm run build:site
PUBLIC_ARTIFACT_REQUIRED=1 npm run test:tools-uiux-e2e
npm run editorial:build
```
