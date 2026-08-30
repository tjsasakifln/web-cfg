Parent: #493

## Decision state

**P1 / VALIDATE → EXECUTE_CANARY** · Front: REVENUE NOW / INBOUND ENGINE · Time to evidence: prototype + uma money page canário · Leverage: revenue, conversion, trust e customer.

**Visitor job:** reconhecer o risco/decisão, ver prova proporcional e agir em até três segundos sem confundir conteúdo, oferta ou promessa.  
**Hypothesis:** art direction derivada do artefato de cada serviço diferencia a CONFENGE sem afastar CTA/preço/prova.  
**100 repetitions:** archetype + artifact contract melhora famílias; custom hero decorativo por rota cria 100 trabalhos.

## Problem

Money pages usam amplamente `.content-hero`: gradient, radial accent, H1/lead/CTA e capa retangular com sombra. `/reequilibrio-obras-publicas/` tem 4 gradients, 6 shadows e 25 rounded no desktop. A especificidade de causa, prova, cálculo e documentação aparece depois; a primeira dobra ainda é intercambiável.

## Contemporary evidence

- Canário proposto: `/reequilibrio-obras-publicas/`; comparação com `/medicoes-glosas-obras-publicas/` e `/auditoria-orcamento-licitacao/`.
- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844, 1366×768 e 1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: `/tmp/confenge-design-audit-20260830/money-mobile.png` (`ca9ab1…`) e `money-desktop.png` (`17a7c0…`).
- Selectors: `.content-hero.pillar-hero`, `.article-cover`, `.lead-inline`, `.pillar-overview`, `.two-column-content`, `.commercial-bridge`, `.content-cta`.
- Tells: generic hero/capa, eyebrow repetition, two-column skeleton, gradient CTA bands.
- Keep: #327 semantics, documents/risks/limits, next action, capture, sources, #328 truth.

## Desired perception

Uma mesa de decisão técnica sobre evento, nexo, prova e valor — não página de serviço com thumbnail premium.

## Design hypothesis

Abrir o canário com um artefato informacional do próprio reequilíbrio: cronologia causa→efeito, matriz documental, fragmento de memória de cálculo ou dossier index. O artefato deve ser real/sintético rotulado e explicar a decisão; CTA/prova permanecem próximos.

## Constraints

#327 e 3-second fold; #328 sem prova fabricada; public family/conversion gate; price capture; SEO/canonical/schema; content truth; 44 px; responsive; JS-off; CWV; analytics/Turnstile/privacy.

## Scope

- 2–3 prototypes para uma rota canário com o mesmo conteúdo/CTA;
- escolher um artefato com purpose/provenance/label e integrar à hierarquia;
- reduzir generic hero, cover, repeated eyebrow, rounded callouts e CTA gradient;
- medir canário antes de family rollout;
- definir variação limitada por archetype (event, calculation, document, timeline), não customização irrestrita.

## Out of scope

Reescrever tese comercial; alterar preço/escopo; publicar case; reorganizar SEO/URL; implementar todas as money pages; remover captura; usar imagem AI/stock ou decoração CAD.

## Acceptance

- [ ] 2–3 direções comparadas com 3-second fold, CTA, proof proximity, mobile e performance;
- [ ] canário preserva o que/para quem/prova/ação sem scroll em 390×844 e 1366×768;
- [ ] artefato responde pergunta real e tem purpose, origem/label, data/freshness quando aplicável, license e alt;
- [ ] hero não poderia ser de SaaS/consultoria genérica após counterfactual;
- [ ] nenhum claim/prova/preço muda sem contract owner;
- [ ] capture fail-closed, Turnstile, form completion e analytics passam;
- [ ] #327/#328 continuam autoridades; nenhuma percepção humana é inventada;
- [ ] canário recebe decisão `REPEAT | CHANGE | STOP` antes de scale;
- [ ] before/after, UI, design, SEO, a11y e performance gates passam;
- [ ] revisão human-crafted responde às oito perguntas.

## Before / After evidence

390×844, 768×1024, 1024×768, 1366×768, 1440×1000; hero, artifact, inline CTA, form, method/provenance, footer; same scroll/state/SHA, JS-on/off.

## Responsive

Artefato reeditado para 390, nunca thumbnail espremida; CTA ≥44 px; tables/timelines acessíveis; matriz #485 completa.

## Accessibility

Heading/reading order, table semantics, alt/caption, focus, contrast, reduced motion, zoom/reflow e form errors.

## Performance

Asset/font budgets, AVIF/WebP quando fotografia, dimensions, no CLS; Lighthouse mobile 3 runs sem regressão.

## Analytics and data contracts

Preservar CTA/asset/route IDs, `CONFENGE_WEB`, no PII/text. extra-cli owner de facts/provenance; Warmbly owner de action/outcome.

## Rollback

Revert do canário e promoção do SHA anterior; URL/canonical/content/data não migram.

## Dependencies

`depends_on: #494, #495, #496; reuses #327 and #328`  
`unblocks: #504 and money-family rollout`

## Perceptual leverage

`HIGH`

## Effort

`L`

## Human-crafted review

1. Específica ao evento? 2. Hierarquia sem card? 3. Artefato informa? 4. Tipografia clara? 5. Ritmo? 6. CONFENGE sem logo? 7. Default IA? 8. Prompt result?

Não afirmar percepção sem sessões reais.

## PR evidence and ADR

Visitor job, conversion hypothesis, data/proof owner, gates, analytics, rollback e ADR-STRAT-002.
