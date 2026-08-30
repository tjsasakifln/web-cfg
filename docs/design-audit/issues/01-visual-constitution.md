Parent: #493

## Decision state

**P1 / VALIDATE → EXECUTE_CANARY** · Front: INBOUND ENGINE · Time to evidence: 2–3 protótipos isolados antes de tokens · Leverage: trust, conversion, customer e automation.

**Visitor job:** reconhecer uma casa técnica capaz de transformar documento, dado e risco em decisão, sem perder a próxima ação.  
**Hypothesis:** uma constituição validada em jobs reais reduz decisões arbitrárias e impede que 100 novas páginas produzam 100 variações genéricas.  
**100 repetitions:** melhoram o sistema somente se cada repetição herdar papéis, archetype, evidence e gates; moodboards artesanais não escalam.

## Problem

`docs/DESIGN-SYSTEM.md` e `data/site/design-system.json` já declaram “engenharia editorial premium” e várias regras corretas. Porém os tokens foram reconciliados antes de uma comparação registrada de composições representativas. A documentação já fixa system sans, serif discreta, mono, radii 8/12/16 e shadow, enquanto o render ainda é dominado pelo template compartilhado. Falta ratificar — não duplicar — a constituição com evidência visual e decisões reversíveis.

## Contemporary evidence

- Source: `origin/main@b4cafc4fe0a005c3769a7b6acde882ff1f9d65d8`; live/screenshots: `7500d7bdeb325f9f72e38b72e7fd6bb6db29f680`, 2026-08-30. O delta é somente o quality gate do PR #483, sem arquivo visual público.
- URLs/canários: `/`, `/conteudos/documentos-reequilibrio-obra-publica/`, `/ferramentas/limite-acrescimos-supressoes/` em 390×844, 768×1024, 1024×768 e 1440×1000.
- Selectors/contracts: `styles-tokens.css`, `data/site/design-system.json`, `.hero`, `.content-hero`, `.tool-workflow`, `archetype_gated_surfaces`.
- Tell: direção declarada sem prototype comparison; gate de archetype cobre somente home e entregas.
- Screenshots live em `/tmp/confenge-design-audit-20260830/`: `home-{mobile,desktop}.png` (`46970e…`/`01b712…`), `article-{mobile,desktop}.png` (`6d9610…`/`4f70bb…`) e `tool-{mobile,desktop}.png` (`b36b63…`/`2c2c36…`), associados ao SHA acima e inventariados no audit.

## Desired perception

Um sistema reconhecível como CONFENGE porque evidencia engenharia, contratos públicos, cálculo e responsabilidade — não por usar uma coleção de efeitos “editorial premium”.

## Design hypothesis

Technical Editorial em duas marchas, usando job, keylines, papéis tipográficos, materialidade de evidência e densidade por tarefa. A constituição deve declarar `KEEP | REDUCE | REPLACE | REMOVE`, exceções e non-goals, sem escolher font/style por gosto antecipado.

## Constraints

Conversão e #327; SEO/semantics; WCAG 2.2 AA; 44 px; responsive/JS-off; performance/CWV; capture/Turnstile; analytics sem PII; runtime/URLs; CONFENGE única marca; facts/provenance do extra-cli em contratos SELECT-only; `CONFENGE_WEB` no handoff.

## Scope

- atualizar as fontes de verdade existentes, sem criar um design system paralelo;
- aesthetic intent, duas marchas, papéis tipográficos, grid/keylines, spacing/density, radius/shadow/border/surface/color, imagery, motion, iconography, data visualization, page archetypes, anti-patterns e exception record;
- produzir 2–3 direções isoladas para exatamente três jobs: comercial, leitura/evidência e instrumento/resultado;
- comparar tradeoffs de 3-second comprehension, CTA, densidade, mobile, asset cost, licensing, performance e extensibilidade;
- escolher uma direção e declarar o que foi rejeitado antes de congelar tokens.

## Out of scope

Implementação sitewide; novo framework; nova marca/logo; copiar referência; publicar imagem sem licença; inventar case/dado; alterar conteúdo, URL, canonical, form contract ou runtime.

## Acceptance

- [ ] Design Read contém audience, context, job, desired perception, non-goals, domínio visual disponível e invariantes;
- [ ] `docs/DESIGN-SYSTEM.md`, JSON e tokens têm ownership explícito e nenhuma regra contraditória;
- [ ] três jobs têm 2–3 composições comparáveis, incluindo mobile, antes do freeze;
- [ ] comparação registra Keep/Change/Do not copy e razões da direção escolhida;
- [ ] pelo menos três arquétipos parecem da mesma marca sem o mesmo skeleton;
- [ ] counterfactual sem logo/nome/copy conserva sinais informacionais de engenharia/contratos/dados;
- [ ] radius, shadow, gradient, serif, mono, icon e motion têm política por papel e exceção;
- [ ] nenhum score fictício de “anti-AI” ou percepção humana é criado;
- [ ] decisão não reduz 3-second comprehension, CTA, proof proximity ou mobile reachability;
- [ ] o canário e rollback da wave seguinte estão definidos antes de escala;
- [ ] revisão responde às oito perguntas human-crafted abaixo.

## Before / After evidence

Versionar protótipos e comparação nos mesmos 390×844, 768×1024, 1024×768 e 1440×1000, com SHA, data, estado JS-on/JS-off quando aplicável e manifest legível. “After” nesta issue é constituição/protótipo aprovado, não deploy.

## Responsive

390×844, 768×1024, 1024×768, 1440×1000 e breakpoints contratuais 320/360/390/430/768/900/901/960/1000/1024/1120/1240/1366/1440/1661/1920 quando o protótipo usar chrome/CTA.

## Accessibility

Especificar contraste, focus, zoom/reflow, reduced motion, alt/`alt=""`, headings, tables e 44 px; protótipos não podem depender só de cor, hover ou posição visual.

## Performance

Registrar custo estimado de fonte e asset, CLS, render blocking e budgets existentes; sem vídeo, WebGL, Lottie, runtime de framework ou fonte remota sem decisão de privacidade.

## Analytics and data contracts

Nenhuma mudança. Futuro canário preserva eventos existentes e `source=CONFENGE_WEB`, sem texto livre/PII em analytics. extra-cli permanece owner de fatos/proveniência; Warmbly, de ação/outcome.

## Rollback

Reverter o commit de documentação/tokens ao snapshot anterior e manter produção no sistema vigente. Nenhuma expansão pode depender de token ainda não aprovado.

## Dependencies

`depends_on: none`  
`unblocks: #495, #496, #497, #498, #499, #500, #501, #502, #503, #504`

## Perceptual leverage

`HIGH`

## Effort

`M`

## Human-crafted review

1. A composição parece específica ao conteúdo?
2. A hierarquia poderia existir sem card?
3. O elemento visual comunica informação ou decora?
4. Existe uma decisão tipográfica clara?
5. O layout tem ritmo ou apenas componentes empilhados?
6. A página é reconhecível como CONFENGE sem depender do logo?
7. Existe padrão usado apenas porque é comum em UI gerada por IA?
8. Algo parece “prompt result” em vez de direção de arte?

Registrar respostas, evidência e divergências; não atribuir a uma pessoa sem teste humano real.

## PR evidence and ADR

O futuro PR declara visitor job, acquisition/conversion hypothesis, data owner/contract, quality gates, analytics, rollback e ADR-STRAT-002. Atualizar ADR antes da implementação somente se uma boundary pública mudar.
