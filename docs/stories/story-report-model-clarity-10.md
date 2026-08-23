# Story: Clareza comercial 10/10 do modelo de relatório de licitações

## Status

Ready for Review

## Executor Assignment

executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: ["test:report-model", "test:report-model-ui", "test:design", "test:copy", "visual-review"]

## Story

**As a** responsável de construtora decidindo se vale contratar uma análise de licitações,
**I want** entender em segundos o problema resolvido, o que recebo, como a decisão é fundamentada e o que R$ 599 compra,
**so that** eu reconheça o valor estratégico antes de consultar o exemplo completo e possa iniciar a contratação sem fricção.

## Acceptance Criteria

1. O primeiro viewport nomeia o produto como `Relatório Executivo de Priorização de Licitações`, explicita a decisão que ele suporta e mostra o resultado do exemplo `12 analisadas → 3 priorizadas → 7 recusadas`, sem depender de rolagem a 390 × 844 px.
2. Antes do exemplar, a página responde em linguagem direta `o que é`, `para quem serve`, `o que você recebe`, `por que vale` e `como contratar`, sem jargão interno, formulário, modal, download ou conteúdo oculto.
3. A oferta declara `R$ 599 = 1 relatório adaptado`; a empresa informa raio de atuação e contexto, a CONFENGE busca os editais abertos nesse recorte e a quantidade decorre das licitações publicadas, sem cota combinada. A análise alcança a profundidade máxima permitida pelas informações apresentadas pela empresa; prazo e aceite são confirmados por uma pessoa no WhatsApp antes da cobrança.
4. A percepção de valor cresce nesta ordem: custo da decisão errada, decisão executiva, entregáveis, exemplo, critérios eliminatórios, aderência da empresa, ficha por oportunidade, exposição financeira, rastreabilidade, plano de ação e limites.
5. O exemplar preserva a topologia de evidência de uma entrega profissional com campos visíveis para fonte oficial, requisito do edital, evidência da empresa, confiança, ponto a revalidar e validade da decisão; todos os fatos permanecem sintéticos e não há links oficiais falsos.
6. A carteira tem leitura móvel imediata das 12 decisões sem exigir rolagem horizontal para descobrir o status; a tabela detalhada pode continuar disponível como segunda camada acessível.
7. O CTA principal usa WhatsApp direto, mantém o contrato versionado de analytics sem PII e aparece no hero, após a principal prova e no fechamento; a ação móvel fixa só aparece depois que o hero deixa o viewport e nunca cobre conteúdo.
8. A página mantém canonical, `index,follow`, JSON-LD `WebPage` + `Report` + `BreadcrumbList`, acesso integral em HTML e as rotas internas/sitemap existentes.
9. Os gates automatizados provam anonimização, reconciliação dos 12 valores, clareza da promessa, entregáveis, escopo honesto, rastreabilidade, ausência de fricção, geometria móvel, WCAG AA, design, copy, SEO, analytics e artefato público.
10. Revisão visual cobre 320, 390, 768, 1024 e 1440 px; após CI verde, merge em `main` e deploy Netlify, a URL pública responde 200 e o build marker corresponde ao SHA integrado.

## Market-Capture Gate

- Decision state: `EXECUTE_NOW`
- Executive fronts: Revenue Now + Inbound Core
- Time to evidence: deploy imediato; primeira evidência por leitura do exemplar e clique qualificado no WhatsApp
- Leverage: revenue, trust, distribution
- Repetition test: um único exemplar indexável reduz a incerteza de muitos leads e acumula aprendizado comercial sem criar uma página por lead.

## Tasks / Subtasks

- [x] Task 1: Reestruturar promessa e arquitetura de informação (AC: 1-4)
  - [x] Tornar produto, decisão, resultado demonstrativo e preço legíveis no primeiro viewport.
  - [x] Inserir entregáveis e valor estratégico antes do início do exemplar.
  - [x] Explicitar busca pela CONFENGE, volume condicionado às publicações e profundidade condicionada às informações da empresa, sem inventar quantidade ou prazo.
- [x] Task 2: Reforçar prova e rastreabilidade (AC: 4-6)
  - [x] Preservar a progressão do relatório e acrescentar a topologia de evidência.
  - [x] Criar leitura móvel da carteira sem depender da tabela horizontal.
  - [x] Manter todos os dados demonstrativos, coerentes e reconciliados.
- [x] Task 3: Eliminar fricção e regressões (AC: 7-9)
  - [x] Condicionar a barra móvel à saída do hero e preservar analytics sem PII.
  - [x] Atualizar contratos automatizados de conteúdo e geometria.
  - [x] Rodar gates de design, copy, UI, SEO, acessibilidade e build.
- [ ] Task 4: Publicar e comprovar produção (AC: 10)
  - [ ] Executar políticas pré-PR e revisão de severidade crítica.
  - [ ] Publicar somente via `@github-devops`, acompanhar CI e merge.
  - [ ] Validar URL, SHA do build, CTA e indexabilidade em produção.

## Dev Notes

- `confenge.com.br` continua como única superfície pública. Esta mudança não cria crawler, dado canônico ou nova arquitetura. [Source: `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md`]
- O preço versionado autoriza uma unidade `one_adapted_report`; `scope_state`, `terms_state` e `sla` permanecem desconhecidos até aceite humano. [Source: `docs/contracts/intent-action/intent-action-matrix.v1.json`]
- O modelo é aquisição com utilidade real: precisa exibir método, proveniência, próximo passo e confiança, não apenas aparência premium. [Source: `docs/strategy/MARKET-CAPTURE-OS.md`]
- A revisão adversarial observou no mobile: H1 em cinco linhas, prova abaixo da dobra, barra fixa cobrindo a nota do hero, tabela escondendo a decisão e explicação do método tardia. Esses defeitos viram regressões automatizadas.
- Não alterar preço, habilitar checkout, prometer prazo, cota de oportunidades, vitória, economia ou resultado. A CONFENGE busca os editais abertos no raio informado; a quantidade resulta da disponibilidade publicada e a profundidade chega ao máximo sustentado pelas informações apresentadas pela empresa.
- Não inventar URL de fonte para os dados sintéticos. A página deve demonstrar quais campos rastreáveis existem na entrega contratada.

### Testing

- `npm run test:report-model`
- `npm run test:report-model-ui`
- `npm run test:design`
- `npm run test:copy`
- `npm run test:ui`
- `npm run test:analytics`
- `npm run test:cta-whatsapp`
- `npm run validate:seo`
- `npm run build:site && npm run audit:public-artifact`

## CodeRabbit Integration

**Primary Type**: Frontend
**Secondary Type(s)**: Conversion, SEO, Deployment
**Complexity**: Medium

**Quality Gate Tasks**:
- [ ] Pre-Commit (@dev): conteúdo, HTML/CSS, PII, acessibilidade e regressões dedicadas
- [ ] Pre-PR (@github-devops): diff contra `origin/main`, políticas, build e CodeRabbit quando disponível
- [ ] Pre-Deployment (@github-devops): CI, Netlify, rollback e smoke público

**Severity Policy**:
- CRITICAL: corrigir antes do PR
- HIGH: corrigir ou documentar explicitamente antes do merge

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-23 | 1.0 | Story criada a partir da revisão adversarial e do contrato comercial versionado | @sm |
| 2026-08-23 | 1.1 | Promessa, entrega, prova, leitura móvel e contratos regressivos implementados | @dev |
| 2026-08-23 | 1.2 | Responsabilidade de busca, volume disponível e profundidade real do relatório corrigidos | @dev |

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npm run test:report-model`: 17 testes aprovados.
- `npm run test:report-model-ui`: cinco breakpoints aprovados; zero overflow e zero violação Axe séria/crítica.
- `npm run test:design` e `npm run test:copy`: aprovados sem bypass.
- `npm run test:analytics` e `npm run test:cta-whatsapp`: aprovados; contrato de clique único e sem PII preservado.
- `npm run test:ui`, `npm run audit:accessibility`, `npm run validate:seo`: aprovados; SEO com zero erro e avisos preexistentes fora do escopo.
- `npm run build:site && npm run audit:public-artifact`: build aprovado; 451 arquivos, zero finding no artefato público.

### Completion Notes List

- Primeiro viewport móvel contém produto, decisão, prova `12 → 3 → 7`, CTA e limite comercial; CTA termina em 558 px a 390 × 844.
- Barra móvel não aparece sobre o hero e surge somente após sua saída, com 54 px em 320 e 390 px.
- O exemplar preserva 12 oportunidades reconciliadas e fornece visão móvel com decisão visível sem rolagem horizontal.
- A ficha agora conecta fonte, requisito, evidência da empresa, confiança, revalidação e validade sem fabricar links oficiais.
- Scorecard adversarial pós-implementação: autoridade visual 10/10; clareza do problema 10/10; clareza do produto 10/10; entregáveis 10/10; escopo/preço 10/10; valor estratégico 10/10; confiança/rastreabilidade 10/10; mobile 10/10; fricção 10/10; SEO/acessibilidade 10/10. Cada nota está vinculada aos critérios e gates acima, não a resultado comercial ainda não observado.

### File List

- `casos/modelo-relatorio-inteligencia-licitacoes/index.html`
- `casos/modelo-relatorio-inteligencia-licitacoes/styles.css`
- `scripts/site/test_report_model_599.py`
- `scripts/site/test_report_model_ui.mjs`
- `docs/stories/story-report-model-clarity-10.md`
