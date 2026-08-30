Parent: #493

## Decision state

**P1 / EXECUTE_CANARY** após constitution · Front: INBOUND ENGINE · Time to evidence: inventário + canário renderizado no PR · Leverage: trust, automation e distribution.

**Visitor job:** distinguir hierarquia, comparação, ação e estado sem atravessar uma coleção de caixas “premium”.  
**Hypothesis:** regras, keylines, columns e contrastes podem substituir elevação decorativa e tornar o site mais específico.  
**100 repetitions:** tokens/roles e lint reduzem custo marginal; remover uma sombra manualmente em 100 seletores não melhora o sistema.

## Problem

O CSS contém 183 `border-radius`, 90 `box-shadow` e 61 gradients/radials. Nem todos são live ou errados, mas `styles.css` concentra 122/73/42 e mistura componentes atuais, regras mortas e geometria arbitrária. No render, `/entregas/` chega a 58 elementos arredondados e 13 sombras; home, 43 e 5. Cardification ainda resolve agrupamentos que poderiam ser lista, regra, tabela ou sequência.

## Contemporary evidence

- Source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844 e 1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshot corpus: `/tmp/confenge-design-audit-20260830/`, 18 capturas SHA-256 inventariadas no audit; exemplos home `46970e…`/`01b712…` e entregas `387415…`/`6377b6…`.
- Selectors: `.button-primary`, `.contact-form`, `.content-hero`, `.article-cover`, `.criterion-card`, `.related-card`, `.vitrine-item`, `.commercial-bridge`, `.simple-card`, `.mobile-nav`.
- Tell: radius/shadow/gradient sem papel uniforme, hover shadow expansion, CSS dormant; `test_css_tokens_mirror_system` registrado no PR #445 conferia nomes, não valores.
- Keep: focus ring, input boundary, mobile menu elevation, true interactive state.

## Desired perception

Estrutura técnica plana e precisa, com contenção apenas quando existe fronteira, ação independente, comparação ou estado.

## Design hypothesis

Definir papéis de surface (`document`, `instrument`, `decision`, `interactive`, `overlay`) e resolver primeiro com rule/keyline/column/whitespace. Radius e shadow são consequência do papel, não default de component library.

## Constraints

Preservar focus, affordance, 44 px, form completion, sticky/mobile menu, contrast, responsive, print, JS-off, layout gates, CSS budget, URLs, conversion e screenshot baselines congelados.

## Scope

- inventário computado por selector e surface role, separado de CSS morto;
- política taxativa para border/rule/radius/shadow/gradient/glow/blur e exception record;
- remover ou consolidar valores arbitrários e regras não computadas em um canário;
- substituir cardification por lista/regra/tabela/sequence onde não há fronteira real;
- consertar token/value mirror e detectar segunda geometria equivalente;
- recapturar frozen specs conforme contrato.

## Out of scope

Restyle completo de páginas; remover boundary de form/menu; proibir todo radius/gradient; mudar copy/IA; rewrite framework; relaxar gate para fazer screenshot passar.

## Acceptance

- [ ] inventário distingue computed/live, dormant e necessário por papel;
- [ ] cada surface/radius/shadow/gradient/blur do canário tem role ou é removido;
- [ ] no mínimo um conjunto de cards sem ação/fronteira vira estrutura aberta e mantém scanning;
- [ ] mobile menu, focus, fields e overlays preservam affordance/elevação funcional;
- [ ] tokens JSON/CSS comparam nome **e valor**, sem aliases ambíguos;
- [ ] nenhum novo arbitrary value ou duplicate geometry entra;
- [ ] hover lift/shadow expansion decorativo sai do canário;
- [ ] before/after prova igual conteúdo, CTA, states e responsive;
- [ ] CSS raw/gzip não aumenta sem exceção; idealmente cai;
- [ ] revisão human-crafted responde às oito perguntas.

## Before / After evidence

Screenshots do mesmo canário/scroll/state em 390×844, 768×1024, 1024×768, 1440×1000; manifest com computed selectors/counts e SHA. Incluir foco, hover, open menu e form error/success quando tocados.

## Responsive

Matriz existente 320–1920 e 390/768/1024/1440 obrigatórios; tabela/wrapper não pode virar card por conveniência sem justificativa.

## Accessibility

WCAG 2.2 AA; foco não depende de shadow removida; contrast, hit area, field boundary, overlay, keyboard e reduced motion sem regressão.

## Performance

Medir CSS raw/gzip, style recalculation, LCP/CLS e screenshot runtime. Sem novas bibliotecas ou imagens.

## Analytics and data contracts

Nenhuma mudança de event/PII/form payload/extra-cli/Warmbly/`CONFENGE_WEB`.

## Rollback

Revert atômico dos tokens/CSS e restore dos hashes frozen; sem mudança de conteúdo ou dado.

## Dependencies

`depends_on: #494`  
`unblocks: #497, #498, #499, #500, #501, #502, #503, #504`

## Perceptual leverage

`HIGH`

## Effort

`L`

## Human-crafted review

1. Específica ao conteúdo? 2. Hierarquia sem card? 3. Visual informa? 4. Decisão tipográfica clara? 5. Ritmo vs stack? 6. CONFENGE sem logo? 7. Default de IA? 8. Prompt result?

Registrar evidência; não alegar julgamento de usuário sem teste real.

## PR evidence and ADR

Visitor job, hypothesis, selectors, gates, analytics, rollback e ADR-STRAT-002 no PR. Atualizar ADR somente se contrato público/arquitetura mudar.
