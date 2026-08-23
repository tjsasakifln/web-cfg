# Story: Biblioteca pública de entregas e descoberta pela home

## Status

Ready for Review

## Executor Assignment

executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: ["test:deliverables-hub", "test:deliverables-hub-ui", "test:design", "test:copy", "visual-review"]

## Story

**As a** visitante que avalia contratar a CONFENGE,
**I want** encontrar no topo e na home uma biblioteca de entregas com exemplos consultáveis integralmente,
**so that** eu entenda o padrão do que posso receber antes de iniciar uma conversa comercial.

## Acceptance Criteria

1. A home contém um acesso visível com a expressão `Conheça nossas entregas`, sem criar um oitavo bloco narrativo, e explica em linguagem direta que os exemplos permitem avaliar profundidade, método e utilidade antes da contratação.
2. O item `Entregas` substitui visualmente `Ferramentas` no menu superior público para preservar a largura e a hierarquia de cinco itens; `Ferramentas` continua acessível no rodapé.
3. A home, o novo hub e o relatório atual emitem o link diretamente no HTML. Páginas já publicadas com o shell anterior recebem a promoção em tempo de execução, sem duplicidade e sem invalidar hashes de análises técnicas aprovadas.
4. Existe uma página pública em `/entregas/`, HTML estático, indexável e legível sem JavaScript, cadastro, formulário, modal, download ou conteúdo oculto.
5. O hub deixa inequívoco que há `1 exemplo disponível` e que o Relatório Executivo de Priorização de Licitações é o primeiro exemplo publicado; não exibe cards vazios nem sugere entregas inexistentes.
6. O primeiro exemplo conduz diretamente a `/casos/modelo-relatorio-inteligencia-licitacoes/` e explicita o valor demonstrado `12 analisadas → 3 priorizadas → 7 recusadas`, a natureza sintética e a opção de relatório adaptado por R$ 599.
7. O hub possui canonical próprio, `index,follow`, Open Graph e JSON-LD `CollectionPage` + `ItemList` + `BreadcrumbList`; a URL consta nos sitemaps e no artefato público allowlisted.
8. A home, o hub e o relatório formam uma navegação bidirecional coerente; o relatório usa `Entregas` em seu breadcrumb e menu sem alterar preço, escopo, CTA ou contrato comercial vigente.
9. Analytics e links usam identificadores sem PII; testes cobrem descoberta, navegação efetiva, HTML direto, claims honestos, schema, sitemap, artefato público, ausência de fricção e regressões do relatório.
10. A experiência passa em 320, 390, 768, 1024 e 1440 px, sem overflow e sem violações Axe sérias/críticas; após CI verde, merge em `main` e deploy Netlify, `/entregas/`, a home e o relatório respondem corretamente e o build marker corresponde ao SHA integrado.

## Market-Capture Gate

- Decision state: `EXECUTE_NOW`
- Executive fronts: Revenue Now + Inbound Core
- Time to evidence: imediatamente após o deploy por acesso ao hub, consulta do exemplar e clique qualificado no relatório
- Leverage: revenue, trust, distribution
- Repetition test: a biblioteca permite que muitos leads avaliem o mesmo padrão e que novos exemplos sejam acrescentados sem reconstruir a jornada.

## Tasks / Subtasks

- [x] Task 1: Criar a biblioteca indexável de entregas (AC: 4-7)
  - [x] Construir `/entregas/` com um único exemplar real, promessa direta e arquitetura preparada para expansão honesta.
  - [x] Adicionar estilos próprios, sem card soup, preservando tokens e WCAG AA.
  - [x] Integrar canonical, robots, OG, JSON-LD, sitemap e allowlist do artefato.
- [x] Task 2: Integrar a descoberta na home e no topo (AC: 1-3, 8)
  - [x] Inserir uma prévia dentro do bloco comercial existente da home.
  - [x] Emitir `Entregas` diretamente nas superfícies novas e promover shells anteriores pelo runtime.
  - [x] Garantir compatibilidade visual das páginas estáticas anteriores e manter Ferramentas no rodapé.
- [x] Task 3: Conectar o exemplar atual e provar qualidade (AC: 6, 8-10)
  - [x] Atualizar menu e breadcrumb do relatório sem tocar no contrato de R$ 599.
  - [x] Adicionar testes funcionais e renderizados nos cinco breakpoints.
  - [x] Rodar design, copy, SEO, acessibilidade, analytics, build e auditoria do artefato.
- [ ] Task 4: Publicar e comprovar produção (AC: 10)
  - [x] Executar políticas pré-PR, revisão crítica e gates DevOps.
  - [ ] Publicar via `@github-devops`, acompanhar CI e merge.
  - [ ] Validar produção, build marker e submeter a nova URL ao IndexNow.

## Dev Notes

- `confenge.com.br` é a única superfície pública; novas páginas e jornadas públicas pertencem a este repositório. [Source: `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md#decision`]
- O deploy canônico ocorre de `main` para Netlify por `npm run build:site`; rollback usa um deploy Netlify conhecido. [Source: `docs/architecture/RUNTIME-AUTHORITY.md#confenge-runtime-authority`]
- Inteligência pública deve entregar utilidade, método, próximo passo e aprendizagem mensurável; volume de páginas não é sucesso. [Source: `docs/strategy/MARKET-CAPTURE-OS.md#corporate-thesis-and-north-star`]
- A home aceita no máximo sete grandes blocos narrativos; a prévia deve ser incorporada ao bloco `offer_dominant`. [Source: `scripts/site/test_design_gates.py#test_home_archetypes_diverse`]
- O conceito visual é `engenharia editorial premium`, com hierarquia, contraste, WCAG AA e limite de card grids. [Source: `docs/DESIGN-SYSTEM.md#conceito`]
- O exemplar vigente é integralmente sintético e o contrato comercial autoriza apenas `R$ 599 = 1 relatório adaptado`; não alterar quantidade, prazo, checkout ou promessa de resultado. [Source: `docs/stories/story-report-model-clarity-10.md#acceptance-criteria`]
- `PUBLIC_TOP_DIRS` controla o que chega ao artefato Netlify; `/entregas/` precisa entrar explicitamente nessa allowlist. [Source: `scripts/pseo/public_artifact.py`]
- Os arquivos `docs/framework/*` e fallbacks declarados no core config não existem neste workspace; foram usados os contratos locais acima e o design system versionado.

### Testing

- Teste de contrato Python para HTML direto, texto, links, navegação, schema, sitemap e allowlist.
- Teste renderizado com Puppeteer + Axe em 320, 390, 768, 1024 e 1440 px.
- Rodar: `npm run test:deliverables-hub`, `npm run test:deliverables-hub-ui`, `npm run test:report-model`, `npm run test:design`, `npm run test:copy`, `npm run test:analytics`, `npm run test:ui`, `npm run validate:seo`, `npm run build:site` e `npm run audit:public-artifact`.

## CodeRabbit Integration

**Primary Type**: Frontend
**Secondary Type(s)**: Deployment, SEO, Conversion
**Complexity**: Medium

**Primary Agents**:
- @dev
- @ux-design-expert

**Supporting Agents**:
- @github-devops
- @qa

**Quality Gate Tasks**:
- [x] Pre-Commit (@dev): semântica, navegação, acessibilidade, responsividade e claims
- [x] Pre-PR (@github-devops): diff contra `main`, build, SEO e regressões
- [ ] Pre-Deployment (@github-devops): CI, artefato público, rollback e smoke ao vivo

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL
- CRITICAL issues: auto-fix
- HIGH issues: document-only

**Primary Focus**:
- WCAG AA, HTML semântico, navegação móvel e ausência de overflow
- Clareza imediata da biblioteca e ausência de inventário fictício

**Secondary Focus**:
- Canonical, schema, sitemap, allowlist e analytics sem PII
- Compatibilidade do shell legado e preservação do contrato comercial do relatório

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-23 | 1.0 | Story criada e validada a partir do pedido do proprietário e dos contratos vigentes | @sm |
| 2026-08-23 | 1.1 | Hub, descoberta, navegação efetiva e suíte de qualidade implementados; geradores aprovados preservados | @dev |

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `LD_LIBRARY_PATH=/tmp/confenge-browser-libs-20260823/root/usr/lib/x86_64-linux-gnu npm test`
- `npm run build:site && npm run audit:public-artifact`
- `python3 -m scripts.contract_analysis validate`
- CodeRabbit CLI: indisponível neste ambiente (`CODERABBIT_UNAVAILABLE`); revisão local e gates obrigatórios executados.

### Completion Notes List

- Biblioteca pública criada com uma única entrega comprovável, sem cadastro, download, modal ou inventário fictício.
- Home e menu superior agora tornam a descoberta imediata; o relatório retorna ao hub por breadcrumb e navegação.
- Runtime promove shells legados sem regravar análises técnicas aprovadas; o validador de contrato permaneceu verde.
- Suíte integral verde, inclusive Puppeteer/Axe nos cinco breakpoints; build público auditado com 453 arquivos e zero finding.

### File List

- `casos/modelo-relatorio-inteligencia-licitacoes/index.html`
- `data/bofu-dominance/frozen-specs/hashes.json`
- `docs/stories/story-deliverables-hub-navigation.md`
- `entregas/index.html`
- `entregas/styles.css`
- `index.html`
- `js/modules/nav.js`
- `package.json`
- `script.js`
- `scripts/pseo/public_artifact.py`
- `scripts/site/affected_graph.mjs`
- `scripts/site/test_deliverables_hub.py`
- `scripts/site/test_deliverables_hub_ui.mjs`
- `scripts/site/test_visitor_redesign.py`
- `sitemap.txt`
- `sitemap.xml`
