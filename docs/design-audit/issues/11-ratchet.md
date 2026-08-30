Parent: #493

## Decision state

**P2 / EXECUTE_AFTER_CANARIES** · Front: SCALE / quality · Time to evidence: failing fixtures + screenshot matrix · Leverage: automation, trust e distribution.

**Visitor job:** receive a coherent, specific surface after every future change.  
**Hypothesis:** objective drift detection prevents regression to the average template without pretending to automate taste.  
**100 repetitions:** exactly the point: each build reuses the gate; it must not require 100 manual pixel audits.

## Problem

Existing gates protect typography floors, geometry, responsive, copy and some forbidden patterns, but not cumulative anti-generic drift. Only home/entregas declare archetypes. Visual screenshots are evidence files, not a consistent diff/rejection contract. Source still contains dormant blur, generic reveal/lift, arbitrary geometry and template hero. Aesthetic judgment cannot become a fake score, but objective regression can fail closed.

## Contemporary evidence

- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…`; o delta é o quality gate mesclado pelo PR #483 e não altera arquivos visuais públicos.
- Existing: `test:design`, `test:visual-structure`, `test:ui`, `test:responsive-matrix`, screenshots/frozen specs.
- Screenshot seed contemporâneo: 18 capturas live, 9 rotas × 390×844/1440×1000, em `/tmp/confenge-design-audit-20260830/` com SHA-256 no audit; é evidência de pesquisa, não baseline CI aprovado.
- Gaps: new font-family/radius/shadow/gradient/reveal/card/archetype/asset can enter without purpose declaration; full-page capture can leave reveal content invisible unless scroll is exercised.
- Source: 183 radius, 90 shadow, 61 gradients/radials, 12 translateY, 0 transition:all; `.js .reveal`, `.button:hover`, `archetype_gated_surfaces` = 2.
- Do not duplicate #407/#485 geometry or existing visual structure tests; extend their contract.
- O PR #483, já mesclado em `b4cafc4…`, entrega o scorecard geral de 14 dimensões. Esta issue se limita à camada visual de declaração/diff anti-generic e deve integrar, não bifurcar, esse contrato de qualidade.

## Desired perception

Design quality accumulates: new surfaces must explain their structure and evidence instead of silently drifting toward generic UI.

## Design hypothesis

A two-layer ratchet: deterministic lint/contract for objective declarations plus reproducible screenshot matrix/diff for human/adversarial review. Exceptions are route-exact, reasoned, dated when temporary and visible in reports.

## Constraints

No aesthetic score; no blanket ban; stable CI; no flaky pixel perfection; preserve performance; before/after same browser/viewports/state; review functional integrity; exception governance; existing gates remain strong.

## Scope

- detect new font-family outside contract;
- new radius/shadow/gradient/glow/blur token or raw value without role/exception;
- `transition: all`, generic reveal, unsupported animation/lift;
- generic card pattern/duplicate geometry and undeclared archetype;
- imagery without purpose/provenance/license/alt policy;
- screenshot matrix for representative archetypes/states, including scrolled JS-on, JS-off and reduced motion;
- visual diff report and adversarial review questions; failing fixtures for every deterministic rule.

## Out of scope

“AI design score”, automatic taste approval, pixel-identical responsive pages, banning all gradients/radii/serif/motion, replacing human review, scanning third-party confidential assets.

## Acceptance

- [ ] each deterministic rule has one failing fixture and one justified passing exception;
- [ ] baseline is contemporary, SHA-pinned and limited to representative archetypes/states;
- [ ] diff uses same viewport/browser/state and ignores only documented nondeterminism;
- [ ] capture scrolls/activates relevant observer or proves no hidden content; includes JS-off/reduced-motion;
- [ ] new archetype, font, geometry, motion or asset requires declaration/purpose;
- [ ] report lists route-exact exceptions, reason, owner and expiry/terminal condition when temporary;
- [ ] no numeric “taste” or “anti-AI” score exists;
- [ ] qualitative eight-question review records evidence/divergence, not fictitious user perception;
- [ ] CI time/flakiness budget and cache strategy are measured;
- [ ] gate cannot be weakened without ADR/named review and before/after proof.

## Before / After evidence

Matrix minimum: home/commercial, entregas, money, article, tool/form, public intelligence, trust at 390×844, 768×1024, 1024×768 and 1440×1000; focused state subsets documented. Produce machine JSON + human HTML/Markdown report.

## Responsive

Use existing critical 320–1920 geometry gate; screenshot matrix is smallest representative subset and cannot replace layout tests.

## Accessibility

Diff review includes focus, contrast-sensitive changes, reduced motion, JS-off, zoom/reflow representative states and no hidden content.

## Performance

CI runtime/flakiness budget; image diffs cached; no production JS/CSS added solely for tests.

## Analytics and data contracts

No production event/PII/data mutation. Gate can validate allowlisted purpose metadata but never upload private captures.

## Rollback

Revert gate/baseline commit independently; production artifact remains unchanged. Baseline update requires reason and linked visual evidence.

## Dependencies

`depends_on: #494, #495, #496 and approved canaries/evidence from #497, #498, #499, #500, #501, #502, #503; coordinates_with: merged PR #483`  
`unblocks: safe sitewide scale and future public families`

## Perceptual leverage

`HIGH`

## Effort

`M`

## Human-crafted review

1. Específica ao conteúdo? 2. Card necessário? 3. Visual informa? 4. Tipografia clara? 5. Ritmo? 6. CONFENGE sem logo? 7. Default de IA? 8. Prompt result?

O gate registra respostas; não afirma que “uma pessoa percebeu”.

## PR evidence and ADR

Visitor job, prevention hypothesis, design contract owner, quality results, analytics no-change, rollback e ADR-STRAT-002. Weakening requires explicit affected ADR or equivalent governance decision.
