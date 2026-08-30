Parent: #493

## Decision state

**P1 / VALIDATE → EXECUTE_CANARY** · Front: INBOUND ENGINE / conversion · Time to evidence: prototype + home canary · Leverage: conversion, trust e customer.

**Visitor job:** em três segundos, entender o que a CONFENGE resolve, para quem, com que prova e qual ação; depois navegar sem aprender taxonomia interna.  
**Hypothesis:** uma primeira dobra ancorada em artefato/prova e um chrome de colofão técnico tornam a marca específica sem reduzir CTA.  
**100 repetitions:** shell/archetype aprovados dão consistência; personalizar header/footer por página cria 100 unidades de trabalho.

## Problem

A home preserva proposta e CTA, mas segue parcialmente o hero cliché e é 333/359 system sans. Header/footer funcionam, porém são visualmente intercambiáveis: rounded CTA/menu, transitions/lift e megafooter navy de três colunas. A primeira dobra ainda pode ser de outra consultoria após remover logo/copy. Não se deve reabrir a semântica de navegação antes de #183 nem substituir a validação humana de #184/#327.

## Contemporary evidence

- URL: `/`; header/footer sitewide; source `origin/main@b4cafc4…`; live/screenshots `7500d7b…`; o delta #483 não altera arquivos visuais públicos.
- Viewports: live 390×844 e 1440×1000; contratos adicionais 768×1024/1024×768 e 320–1920.
- Selectors: `.hero`, `.hero-actions`, `.hero-proof`, `.home-deliverables`, `.site-header`, `.desktop-nav`, `.mobile-nav`, `.site-footer`, `.footer-top`, `.button:hover`.
- Computed: 10 eyebrows, 4 number labels, 43 rounded, 5 shadows, 3 gradients desktop.
- Screenshots live: `/tmp/confenge-design-audit-20260830/home-mobile.png` (`46970e…`) e `home-desktop.png` (`01b712…`); PRs #471/#485/#492 auditados para não recriar defeitos de first fold/wrapping.

## Desired perception

Casa técnica brasileira, com tese econômica, prova documental e navegação/colofão precisos; não landing SaaS nem consultoria global genérica.

## Design hypothesis

Comparar 2–3 composições que preservem exatamente a semântica/CTA atuais e elevem um artefato verificável (relatório, matriz, cronologia ou source block) a eixo da primeira dobra. Tratar header como índice e footer como colofão, sem blur/lift ornamental.

## Constraints

#183 não permite mudança de IA/rótulos antes do tree test; #184/#327 são autoridade de compreensão; #328 limita prova real. Preservar form/capture, Turnstile, analytics, CTA, 44 px, header fit #445/#485, SEO/schema, JS-off, CWV e mobile.

## Scope

- prototipar home + chrome em 2–3 direções após foundation;
- uma direção canário na home, sem expansão sitewide do body;
- primeira dobra: tese, destinatário, prova proporcional, uma ação primária e artefato não fictício;
- remover lift/reveal/blur sem função no canário;
- recompor footer como colofão técnico mantendo links legais/comerciais;
- qualquer IA/nav label fica condicionada a #183.

## Out of scope

Alterar proposta/copy por preferência; inventar prova/case; mudar form backend; remover CTA/WhatsApp; mega-menu; nova rota; stock; redesign de money/content/tools; declarar sucesso humano sem sessões.

## Acceptance

- [ ] 2–3 protótipos preservam os quatro itens de #327 na primeira dobra;
- [ ] direção escolhida vence o counterfactual com artefato informacional, não decoration;
- [ ] uma ação primária domina e CTA termina dentro da dobra nos viewports contratuais;
- [ ] prova real/sintética/contexto público permanecem semanticamente separados;
- [ ] header labels/IA não mudam antes de #183; fit, 44 px, menu JS-off e keyboard passam;
- [ ] footer mantém CNPJ, contato, políticas, correções, IA, conflitos e navegação essencial;
- [ ] nenhum reveal/lift/blur/gradient novo sem purpose; reduced motion passa;
- [ ] form completion, Turnstile, analytics e privacy ficam byte/behavior-equivalentes quando possível;
- [ ] #184/#327 recebem a versão canário para futura validação; não se inventa resultado;
- [ ] revisão human-crafted responde às oito perguntas.

## Before / After evidence

Screenshots da mesma first fold, seção de prova, form, menu open e footer em 390×844, 768×1024, 1024×768, 1366×768 e 1440×1000; JS-on, JS-off e reduced-motion. Registrar SHA/data e equivalência de conteúdo/eventos.

## Responsive

Matriz #485 320–1920, com foco em 390, 768/1024, 1121–1240 e 1440; mobile precisa ser reeditado, não só empilhado.

## Accessibility

WCAG 2.2 AA, landmarks, headings, focus, menu, 44 px, zoom/reflow, label/form errors e reduced motion sem regressão.

## Performance

Três Lighthouse mobile, LCP/CLS/TBT dentro dos budgets atuais; nenhum asset/font sem budget/license.

## Analytics and data contracts

Preservar `diagnostic_cta_click`, journey/offer/lead events e `CONFENGE_WEB`; nenhuma PII/texto livre. extra-cli/Warmbly owners intactos.

## Rollback

Revert do canário e promoção do SHA anterior; form, URL e dados não migram.

## Dependencies

`depends_on: #494, #495, #496; reuses #183, #184, #327, #328`  
`unblocks: #504 and sitewide chrome rollout only after canary evidence`

## Perceptual leverage

`HIGH`

## Effort

`L`

## Human-crafted review

1. Específica? 2. Hierarquia sem card? 3. Visual informa? 4. Tipografia clara? 5. Ritmo? 6. CONFENGE sem logo? 7. Default IA? 8. Prompt result?

Não atribuir resposta a pessoa sem teste #184 real.

## PR evidence and ADR

Declarar visitor job, conversion hypothesis, truth owner, gates, analytics, rollback e ADR-STRAT-002; sem boundary crossing esperado.
