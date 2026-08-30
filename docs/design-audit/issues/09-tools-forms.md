Parent: #493

## Decision state

**P2 / VALIDATE_CANARY** · Front: INBOUND ENGINE / conversion utility · Time to evidence: um tool + um capture canário · Leverage: conversion, customer, automation e trust.

**Visitor job:** informar variáveis, entender premissas, obter resultado/diagnóstico, salvar ou imprimir e escolher o próximo passo.  
**Hypothesis:** linguagem produtiva de instrumento reduz aparência de mini-SaaS e aumenta confiança sem prejudicar completion.  
**100 repetitions:** states/field/result contract melhora ferramentas futuras; estilização manual de cada form não.

## Problem

A ferramenta do art. 125 já é boa referência: 0 gradients, 1 shadow, etapas, unidade, método e print/download. O residual é grande form panel arredondado. Formulários comerciais, por outro lado, vivem em longas landings e parecem forms SaaS. Falta um contract comum de instrument/workflow que separe narrativa expressiva de tarefa produtiva e cubra empty/error/result/print.

## Contemporary evidence

- URLs: `/ferramentas/limite-acrescimos-supressoes/`, `/diagnostico-b2g-360/` e home `#contato`.
- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844/1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: `tool-mobile.png` (`b36b63…`), `tool-desktop.png` (`2c2c36…`), `form-mobile.png` (`d84e0c…`) e `form-desktop.png` (`d3751d…`) em `/tmp/confenge-design-audit-20260830/`.
- Tool: `.tool-form.tool-workflow`, `.tool-money`, 15 rounded/1 shadow/0 gradient.
- Offer/form: 11 sections, 13 eyebrows, 35 uppercase, `.contact-form`, `.form-progress`, `.commercial-bridge`.
- Keep: local calculation/privacy, premise/method, focus/error, Turnstile, receipt, idempotency, `CONFENGE_WEB`, no file intake.

## Desired perception

Instrumento técnico/documento operacional: variáveis, unidade, premissa, cálculo, estado e resultado estáveis; capture parece triagem profissional, não onboarding SaaS.

## Design hypothesis

Archetype produtivo com `inputs → premise/method → compute/state → result → provenance/limit → next action`. Forms de lead usam o mesmo rigor, mas não fingem cálculo. Keylines e grouping substituem grande card.

## Constraints

Form completion, label/error/status/focus, 44 px, Turnstile, abuse guards, no PII analytics, no upload, privacy/retention, JS-off where supported, print/download, responsive, performance, conversion gate.

## Scope

- compare 2–3 productive compositions for one tool and one lead form;
- define field grouping, units, premise, progress, state, result, limitation, print/download and CTA roles;
- cover initial/invalid/loading/error/success/result states as applicable;
- reduce panel/radius/shadow without harming boundary/affordance;
- canary + completion/geometry evidence before rollout.

## Out of scope

Change formulas/business rules, collect new fields, upload, new calculator, portal/dashboard, SPA, gamification, animation, relax Turnstile/capture or change Warmbly.

## Acceptance

- [ ] tool and lead form share productive roles but do not claim same job;
- [ ] initial, invalid, loading, error, success and result/empty states are designed and tested where applicable;
- [ ] unit/premise/method/limit/provenance stay adjacent to value/result;
- [ ] form can be understood and completed in 390 px without card-within-card;
- [ ] focus, error summary, status, step transition and keyboard order remain correct;
- [ ] Turnstile, receipt, idempotency, source and no-upload/privacy contracts pass;
- [ ] print/download result remains legible and provenance included;
- [ ] no motion except state/continuity and reduced-motion fallback;
- [ ] canary measures completion/errors without PII and decides before rollout;
- [ ] review answers eight human-crafted questions.

## Before / After evidence

390×844, 768×1024, 1024×768, 1440×1000; each state, keyboard/focus, JS-off supported state, reduced-motion and print. Same input fixtures and result.

## Responsive

Mobile-first field order, labels visible, numeric input/unit atomic, buttons ≥44 px, no horizontal overflow; desktop density productive, not whitespace theater.

## Accessibility

WCAG 2.2 AA, labels/instructions/errors, `aria-live`, focus management, keyboard, reduced motion, color-independent states, zoom/reflow.

## Performance

No new framework/dependency; own JS/CSS budgets, input responsiveness, LCP/CLS and no layout shift during states.

## Analytics and data contracts

Events are categorical/allowlisted, no field value/text/PII. Lead payload and `CONFENGE_WEB` unchanged; Warmbly owns action/outcome.

## Rollback

Revert markup/CSS/JS canary; calculations, stored leads and APIs unchanged.

## Dependencies

`depends_on: #494, #495, #496, existing conversion/capture contracts`  
`unblocks: #504 and tools/forms rollout`

## Perceptual leverage

`MEDIUM`

## Effort

`L`

## Human-crafted review

1. Específica à tarefa? 2. Panel necessário? 3. Visual informa? 4. Tipografia clara? 5. Fluxo/ritmo? 6. CONFENGE sem logo? 7. Mini-SaaS default? 8. Prompt result?

Não declarar percepção humana sem sessão real.

## PR evidence and ADR

Visitor job, conversion hypothesis, formula/lead owner, gates, analytics, rollback e ADR-STRAT-002.
