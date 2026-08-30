Parent: #493

## Decision state

**P2 / DEFER_UNTIL_FOUNDATION → EXECUTE_CANARY** · Front: INBOUND COMPOUNDING / trust · Time to evidence: article + trust canaries · Leverage: distribution, trust e customer.

**Visitor job:** estudar uma questão técnica, rastrear fonte e responsável, e decidir se precisa de apoio.  
**Hypothesis:** archetypes editoriais de leitura/prova aumentam autoridade sem transformar conteúdo em cards de marketing.  
**100 repetitions:** renderer/archetype melhora o acervo; art direction manual por artigo vira 100 unidades.

## Problem

O conteúdo é tecnicamente substantivo, mas o shell ainda parece content marketing: `.content-hero`, 7 `.criterion-card`, callouts/author box/aside cards, gradient e rounded surfaces. Trust usa retrato real, porém volta a 6–7 `.related-card` e hero genérico. Artigo e autoridade não têm archetypes declarados no gate.

## Contemporary evidence

- URLs: `/conteudos/documentos-reequilibrio-obra-publica/`, `/especialista/tiago-jun-sasaki/`, `/confianca/`.
- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844/1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: `article-mobile.png` (`6d9610…`), `article-desktop.png` (`4f70bb…`), `trust-mobile.png` (`849b47…`) e `trust-desktop.png` (`4c4c83…`) em `/tmp/confenge-design-audit-20260830/`.
- Article: 9 card-class, 39 rounded, 6 shadows, 5 gradients; trust: 7 card-class, 16 rounded, 4 shadows, 2 gradients.
- Selectors: `.article-layout`, `.answer-box`, `.criterion-card`, `.article-callout`, `.author-box`, `.aside-card`, `.profile-hero`, `.related-card`.
- Keep: official sources, plan/error sequence, author/provenance, real portrait, policy/limits.

## Desired perception

Publicação técnica e dossier de autoridade: leitura refinada, fonte e responsabilidade visíveis, sem “blog card” ou portrait landing.

## Design hypothesis

Criar dois archetypes relacionados: `technical_article` (measure, index, source, footnote, figure, decision) e `trust_dossier` (trajectory, responsibility, credentials, method, limits, correction). Regras/keylines substituem cards sem ação.

## Constraints

SEO/schema/Article/Person; editorial registry, source/freshness/corrections; no invented credential/case; #243/#328; accessibility/readability; JS-off; CWV; internal links and terminal action.

## Scope

- 2–3 compositions for one article and one trust page;
- replace criterion/related cards where no independent action/boundary;
- define reading measure, notes, sources, captions, figures and author/provenance placement;
- declare archetypes and renderer/gate contract;
- canary first, then decision to scale.

## Out of scope

Rewrite facts; publish credential/proof blocked in #243/#328; new content; delete internal links; magazine experiment; stock/AI portraits; sitewide content migration in one PR.

## Acceptance

- [ ] article and trust canaries share brand roles without same skeleton;
- [ ] criterion/related card has action/boundary or becomes open sequence/list/rule;
- [ ] reading measure, heading rhythm, source, footnote, caption and author roles are explicit;
- [ ] portrait remains real, correctly cropped/alt, with no false credential;
- [ ] source/freshness/corrections and limits remain visible, not decorative chips;
- [ ] counterfactual retains document/dossier identity without logo;
- [ ] terminal action remains natural and tracked;
- [ ] SEO/schema/editorial/visible parity gates pass;
- [ ] canary decides `REPEAT | CHANGE | STOP` before renderer rollout;
- [ ] review answers eight human-crafted questions.

## Before / After evidence

390×844, 768×1024, 1024×768, 1440×1000; top, mid-reading, source/footnote, author, related/next action, trust proof/limits. Same content/SHA states.

## Responsive

Reading order and measure reedited at 390; side rail becomes in-flow without losing source/CTA; table/figure not cardified solely for mobile.

## Accessibility

WCAG 2.2 AA, headings, landmark, link purpose, footnote navigation, alt/`alt=""`, zoom/reflow, focus, no tiny caption.

## Performance

No JS required for reading; imagery sized/optimized; CSS/font budgets and LCP/CLS stable.

## Analytics and data contracts

Preserve editorial/CTA events without PII. Facts/provenance owner unchanged; no Warmbly action state in public page.

## Rollback

Revert canary template/CSS; registry/content/URL/canonical unchanged.

## Dependencies

`depends_on: #494, #495, #496; reuses #243 and #328 as truth gates`  
`unblocks: #504 and content/trust renderer rollout`

## Perceptual leverage

`MEDIUM`

## Effort

`L`

## Human-crafted review

1. Conteúdo específico? 2. Cards necessários? 3. Visual informa? 4. Tipografia clara? 5. Ritmo de leitura? 6. CONFENGE sem logo? 7. Default IA? 8. Prompt result?

Sem afirmar teste humano inexistente.

## PR evidence and ADR

Visitor job, acquisition hypothesis, editorial/data owner, gates, analytics, rollback e ADR-STRAT-002.
