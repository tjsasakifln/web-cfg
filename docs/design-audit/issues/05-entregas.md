Parent: #493

## Decision state

**P1 / VALIDATE → EXECUTE_CANARY** · Front: INBOUND ENGINE / BOFU · Time to evidence: prototype + rendered catalog · Leverage: revenue, conversion, trust e customer.

**Visitor job:** escolher entre 8 ofertas publicadas pela decisão e consultar 54 capacidades sem confundir maturidade, preço ou próxima ação.  
**Hypothesis:** um índice editorial comparável reduz varredura e “card soup” sem esconder nenhum fato contratual.  
**100 repetitions:** renderer/contract melhora todas as unidades; desenhar 54 exceções manualmente não melhora o sistema.

## Problem

PRs #484/#492 corrigiram a verdade 8/54, hero e wrapping. O residual é perceptual: oito `.vitrine-item` quase idênticos, 13 sombras, 58 elementos arredondados, 148 uppercase e 219 mono no desktop. A página mede ~9.823 px desktop e ~12.494 px mobile. As caixas são unidades reais de oferta, mas a geometria uniforme e metadado saturado achatam hierarquia.

## Contemporary evidence

- URL `/entregas/`; source `origin/main@b4cafc4…`; live/screenshots `7500d7b…` em 390×844/1440×1000; o delta #483 não altera arquivos visuais públicos.
- Screenshots live: `/tmp/confenge-design-audit-20260830/entregas-mobile.png` (`387415…`) e `entregas-desktop.png` (`6377b6…`).
- Selectors: `.deliverables-hero`, `.deliverables-status`, `.offer-decision-nav`, `.vitrine-item`, `.vitrine-item__facts`, `.offer-state`, `.capability-group`, `.capability-item`.
- Tells: repeated cards/grid, mono/uppercase saturation, shadow/rounded repetition.
- Keep: 8 publicadas, R$ 599–3.750, 54 capabilities, 8/44/2 maturity, synthetic labels, price/SLA/scope/CTA, no hidden facts, #335 human gate.

## Desired perception

Índice técnico-comercial taxativo, semelhante a um caderno de decisão, não marketplace de cards nem pricing page SaaS.

## Design hypothesis

Manter unidade/ação de cada oferta, mas comparar primeiro por decision/price/SLA/output em estrutura editorial ou tabela; expandir profundidade por disclosure nativo. Mono/uppercase apenas para ID/status. Uma oferta pode dominar somente se houver motivo comercial explícito.

## Constraints

Contratos #329/#338/#343 e renderer; #335 bloqueia alegação de escolha humana; preços exigem capture fail-closed; synthetic proof; SEO/CollectionPage/ItemList; JS-off; 54/54 encontráveis; 44 px; responsive; analytics; no hiding facts.

## Scope

- 2–3 prototypes com os mesmos 8/54 e conteúdo;
- estrutura comparativa antes das oito profundidades;
- reduzir containers, shadow, badge, uppercase e mono sem perder estado;
- canário na própria `/entregas/` somente após foundation e critério de #335;
- manter renderer/contracts como fonte, sem edição manual divergente;
- mobile com tabela/disclosure/lista apropriada, não oito cards empilhados por default.

## Out of scope

Renomear oferta/preço/SLA; remover capability; publicar VALIDATE/BLOCKED como comprável; nova página por item; nova prova; mudar checkout/form; reabrir wrapping #492.

## Acceptance

- [ ] 8 ofertas, 54 capabilities e estados 8/44/2 permanecem corretos e encontráveis;
- [ ] nenhum dos seis fatos essenciais por oferta fica oculto/inacessível JS-off;
- [ ] comparação inicial permite decision, output, price, SLA e relation to bundle sem ler oito blocos completos;
- [ ] no máximo os containers necessários a ação/disclosure real; lista/tabela/rules resolvem o restante;
- [ ] mono/uppercase têm role de ID/status/source, com contagem e rationale;
- [ ] price, synthetic label, capture e schema permanecem verdadeiros;
- [ ] mobile evita “desktop stack” e mantém touch/scan sem word break/overflow;
- [ ] #335 mede compreensão futura; automação não afirma preferência humana;
- [ ] screenshot diff e gates comercial/design/UI/SEO/analytics passam;
- [ ] revisão human-crafted responde às oito perguntas.

## Before / After evidence

Mesma page/state em 390×844, 768×1024, 1024×768, 1366×768, 1440×1000 e 1661; capturar hero, decision nav, first/last offer, capability group open/closed e form; manifest SHA/data/height/counts.

## Responsive

Matriz #485/#492 completa; atomic price, no split words, no hidden facts, keyboard-scroll table se usada, touch ≥44 px.

## Accessibility

Heading order, native details/summary, table headers/captions, focus, keyboard, contrast e zoom/reflow; status não depende só de cor.

## Performance

CSS/HTML/gzip não regredem sem exceção; lazy enhancement não esconde conteúdo; LCP/CLS dentro dos gates.

## Analytics and data contracts

Preservar offer/asset/CTA IDs e sem PII. Catálogo/versioned contracts continuam fonte; Warmbly recebe `CONFENGE_WEB` após capture.

## Rollback

Reverter template/renderer/CSS e recapturar frozen hash; dados/URLs/canonicals ficam iguais.

## Dependencies

`depends_on: #494, #495, #496; reuses #335 and contracts #329/#338/#343`  
`unblocks: #504 and catalog rollout pattern`

## Perceptual leverage

`HIGH`

## Effort

`L`

## Human-crafted review

1. Específica ao catálogo? 2. Cada card é necessário? 3. Visual informa? 4. Tipografia clara? 5. Ritmo? 6. CONFENGE sem logo? 7. Default IA? 8. Prompt result?

Sem declarar percepção até teste #335.

## PR evidence and ADR

Visitor job, BOFU hypothesis, catalog owner/contracts, gates, analytics, rollback e ADR-STRAT-002 obrigatórios.
