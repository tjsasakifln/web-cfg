# Story: Modelo público de relatório de inteligência de licitações por R$ 599

## Status

Ready for Review

## Executor Assignment

executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: ["test:design", "test:copy", "test:ui", "visual-review"]

## Story

**As a** lead de uma construtora que avalia apoio em licitações,
**I want** consultar no próprio navegador um modelo completo e anonimizado de relatório de inteligência,
**so that** eu perceba imediatamente a profundidade da entrega e possa contratar uma versão adaptada por R$ 599 sem fricção.

## Acceptance Criteria

1. Existe uma página pública em `/casos/modelo-relatorio-inteligencia-licitacoes/`, renderizada em HTML estático, integralmente legível sem cadastro, formulário, modal, download ou conteúdo oculto.
2. O exemplar usa apenas um caso composto sintético e declara de forma visível que empresa, oportunidades, números e decisões são demonstrativos; nenhum dado capaz de identificar a Extra Construtora aparece no HTML, metadados ou JSON-LD.
3. A narrativa aumenta a percepção de valor ao longo da leitura: conclusão executiva, carteira priorizada, critérios e gates, capacidade da empresa, fichas decisórias, exposição financeira, exclusões, plano de 72 horas, metodologia e limitações.
4. O preço `R$ 599 por relatório` e o CTA `Quero meu relatório por R$ 599` aparecem no primeiro viewport e retornam após a principal prova de valor e no encerramento, sem bloquear a consulta.
5. Todos os CTAs comerciais abrem `https://wa.me/5548988344559` com mensagem pré-preenchida sobre o modelo e o preço; não ativam checkout nem alteram os flags financeiros existentes.
6. A página segue o design system de engenharia editorial premium, HTML semântico, WCAG AA, mobile-first e sem sequência de cards genéricos ou dashboard fictício.
7. A URL possui canonical próprio, `index,follow`, Open Graph e JSON-LD `WebPage` + `Report`, consta no sitemap canônico e é alcançável por links no hub de casos, na página de Bid Room e na Diretoria B2G.
8. Analytics usam apenas eventos e atributos sem PII, com `source=CONFENGE_WEB`, `asset_id=relatorio-inteligencia-licitacoes-demonstrativo` e posições de CTA distinguíveis.
9. Testes automatizados cobrem conteúdo, anonimização, preço/CTA, indexabilidade, sitemap, artefato público e regressões dos gates existentes; revisão visual cobre 320, 390, 768, 1024 e 1440 px.
10. Após CI verde e merge em `main`, o deploy Netlify responde HTTP 200 na URL canônica, o `/.well-known/build-info.json` informa o SHA integrado e o CTA é verificado em produção.

## Market-Capture Gate

- Decision state: `EXECUTE_NOW`
- Executive fronts: Revenue Now + Inbound Core
- Time to evidence: imediatamente após deploy por `asset_view`, profundidade de leitura e clique no WhatsApp
- Leverage: revenue, trust, distribution
- Repetition test: o mesmo modelo público demonstra o formato para muitos leads; cada repetição melhora aprendizado comercial sem exigir uma nova página.

## Tasks / Subtasks

- [x] Task 1: Construir o exemplar público e a progressão editorial (AC: 1-6)
  - [x] Criar HTML semântico com caso composto sintético e conteúdo direto.
  - [x] Criar estilos responsivos reutilizando tokens existentes e CTA móvel não obstrutivo.
  - [x] Garantir que não haja PDF, gate, formulário ou checkout.
- [x] Task 2: Integrar descoberta, SEO e conversão (AC: 4, 5, 7, 8)
  - [x] Adicionar canonical, robots, OG, JSON-LD, sitemap e links internos.
  - [x] Instrumentar visualização/profundidade/CTA somente com propriedades sem PII.
  - [x] Usar WhatsApp direto com cópia de R$ 599.
- [x] Task 3: Provar anonimização e qualidade (AC: 2, 6, 9)
  - [x] Adicionar teste dedicado de contrato público da página e denylist dos identificadores privados conhecidos.
  - [x] Rodar design, copy, UI, SEO, analytics, WhatsApp e build público.
  - [x] Capturar e revisar screenshots nos cinco breakpoints.
- [ ] Task 4: Publicar e comprovar produção (AC: 10)
  - [ ] Rodar gates pré-push/PR, CodeRabbit e políticas de reviewability.
  - [ ] Push/PR/merge somente via @devops e aguardar Netlify.
  - [ ] Executar smoke em produção, verificar SHA e submeter IndexNow quando aplicável.

## Dev Notes

- `confenge.com.br` é a única superfície pública; páginas públicas pertencem a `web-cfg`, enquanto `extra-cli` permanece dono de dados e proveniência. [Source: `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md#decision`]
- O deploy canônico é `main` do GitHub para Netlify via `npm run build:site`; rollback usa deploy Netlify conhecido. [Source: `docs/architecture/RUNTIME-AUTHORITY.md#confenge-runtime-authority`]
- Inteligência pública precisa de utilidade, fonte/metodologia visível, próximo passo e aprendizagem mensurável. [Source: `docs/strategy/MARKET-CAPTURE-OS.md#corporate-thesis-and-north-star`]
- O design deve comunicar precisão técnica, responsabilidade e alto valor econômico, usando tokens, contraste editorial e artefatos de método, não card soup ou dashboard SaaS. [Source: `docs/DESIGN-SYSTEM.md#conceito`]
- A página vive sob `casos/`, diretório já permitido no artefato público. O build deve copiar somente arquivos allowlisted. [Source: `scripts/pseo/public_artifact.py`]
- Não usar dados dos PDFs como fatos públicos. O exemplar deve ser sintético, coerente e explicitamente demonstrativo.
- Não criar promessa de prazo, vitória, economia ou resultado. O usuário autorizou apenas o preço unitário de R$ 599.
- O preço não cria SKU no catálogo congelado #88. A ação versionada
  `handraise-report-intelligence-599-v1` é WhatsApp iniciado pelo visitante,
  com escopo e termos `UNKNOWN` até aceite humano e checkout desabilitado em
  `intent-action-matrix.v1.json`.
- Cada ativação comercial emite somente um `whatsapp_click`, enriquecido com
  `offer_id`, `next_action_id`, identidade/posição do CTA e `event_id`; não há
  segundo `cta_click` para o mesmo clique físico.

### Testing

- Teste dedicado em `scripts/site/` deve validar rota, estrutura, texto sintético, ausência de identificadores privados, canonical, robots, schema, três CTAs, WhatsApp, preço e sitemap.
- Rodar ao menos: teste dedicado; `npm run test:cta-whatsapp`; `npm run test:analytics`; `npm run test:design`; `npm run test:copy`; `npm run test:ui`; `npm run validate:seo`; `npm run build:site`; auditoria do artefato público.
- Revisão visual manual/automatizada em 320, 390, 768, 1024 e 1440 px, incluindo tabela horizontal, foco de teclado e barra de CTA móvel.

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
- [ ] Pre-Commit (@dev): review de HTML/CSS/testes, PII e acessibilidade
- [ ] Pre-PR (@github-devops): review contra `main`, build e regressões
- [ ] Pre-Deployment (@github-devops): CI, artefato público e rollback

**Expected Self-Healing**:
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL
- CRITICAL issues: auto-fix
- HIGH issues: document-only

**Primary Focus**:
- WCAG AA, HTML semântico, responsividade e CTA não obstrutivo
- Ausência de PII, claims inventadas, checkout ou dados reais do cliente

**Secondary Focus**:
- Canonical/robots/schema/sitemap coerentes
- Build allowlist, analytics sem PII e rollback Netlify

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-23 | 1.0 | Story aprovada a partir do plano confirmado pelo proprietário | @sm |
| 2026-08-23 | 1.1 | Exemplar, descoberta, conversão e gates locais concluídos | @dev |
| 2026-08-23 | 1.2 | Ação comercial versionada e clique único reconciliável sem PII | @dev |

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npm run build:site && npm run audit:public-artifact`: 451 arquivos públicos, zero finding, paridade 66/66.
- `npm run test:report-model`: 5 testes de contrato público aprovados.
- `npm run test:report-model-ui`: 320, 390, 768, 1024 e 1440 px aprovados; Axe sem violação.
- `npm run test:analytics`, `npm run test:cta-whatsapp`, `npm run test:copy`, `npm run test:ui`, `npm run audit:accessibility` e `npm run validate:seo`: aprovados.

### Completion Notes List

- Página integralmente consultável em HTML, sem formulário, conteúdo oculto ou arquivo para baixar.
- Caso composto sintético com aviso no topo e denylist automatizada de identidade privada.
- Preço e WhatsApp direto no hero, após a prova principal, no fechamento e em CTA móvel.
- A revisão dedicada encontrou e corrigiu overflow a 320 px, contrastes AA e semântica de lista de definições.
- O gate de design será repetido fora de `.worktrees`, pois esse teste exclui caminhos que contenham esse nome.

### File List

- `casos/modelo-relatorio-inteligencia-licitacoes/index.html`
- `casos/modelo-relatorio-inteligencia-licitacoes/styles.css`
- `casos/index.html`
- `bid-room-licitacoes-obras/index.html`
- `diretoria-b2g/index.html`
- `data/bofu-dominance/frozen-specs/hashes.json`
- `sitemap.xml`
- `sitemap.txt`
- `sitemap-index.xml`
- `scripts/site/test_report_model_599.py`
- `scripts/site/test_report_model_ui.mjs`
- `package.json`
- `docs/stories/story-public-report-model-599.md`
- `docs/contracts/intent-action/intent-action-matrix.v1.json`
- `docs/contracts/intent-action/intent-action-matrix.v1.md`
