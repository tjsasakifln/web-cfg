# BEFORE diagnosis — Organic B2G acquisition (origin/main @ 88d72aea)

**as_of:** 2026-08-09  
**baseline_git:** `88d72aea` (merge PR #58)  
**scope:** delta only on existing Organic Opportunity Engine (PR #56) + site surfaces

## PRs recentes lidos

| PR | Título | Relevância |
|----|--------|------------|
| #54 | fix(editorial): bind approvals to material, not HEAD | Governança editorial material-hash (não burlar) |
| #55 | feat(uiux+td): visitor redesign + EPIC-TD-001 | UX/visitante; não motor orgânico |
| #56 | feat(organic): inbound opportunity engine + pilot cohort | **Base a evoluir** — score, gates, demand graph, GSC CTR basico |
| #58 | fix(copy): remove AI-tell em-dashes | Copy pública; não reintroduzir travessão/IA-tell |

## Fragilidades (estado real)

| # | Tema | Status | Evidência no main | Delta necessário |
|---|------|--------|-------------------|------------------|
| 1 | SERP / CTR gap formal | **Parcial** | `engine.py` cria `source=gsc_page` se impressions≥15 e clicks≤0 (hardcoded); sem diagnóstico de title/meta/H1/schema; sem thresholds versionados | Config explícito + SERP diagnosis + expected CTR + reports |
| 2 | TOFU→BOFU / content→service | **Parcial** | `demand_graph.py` + `_service_from_path`; links de serviço em artigos; **0/120** `/conteudos/` com `commercial-bridge`; bridges só em pilares | Mapa formal testável + bridges editoriais + coverage metrics |
| 3 | Páginas comerciais como destinos | **Parcial / quase resolvido** | 6 pilares com Service/FAQ/schema/related content; auditoria tem when-not; outros fracos em “quando não contratar”; `diagnostico-b2g-360` sem commercial-bridge de pilar | Delta estrutural mínimo (when-not / bridge) sem inventar cases |
| 4 | Entity / E-E-A-T | **Resolvido (conservador)** | Organization + Person + Service + Breadcrumb + author em páginas-chave; sem AggregateRating falso | Manter; só corrigir inconsistências se o audit achar |
| 5 | Legado (blog, AVCB, http) | **Parcial** | `_redirects`: `/blog`→`/conteudos/`, `/trabalhe-conosco`→`/#contato`, `/avcb` 410, host Netlify→canon; sem inventário formal + testes de cadeia | Inventário + testes; sem home-dump tópico |
| 6 | Sitemaps | **Parcial** | `sitemap-index.xml` + robots apontam corretamente; falta suite automatizada (redirect/noindex/dup/canônico) | Hygiene tests + gate |
| 7 | Mobile SERP (0 cliques baseline) | **Aberto** | `Dispositivos.csv` existe; engine não usa device; sem page×device | Loader multi-dimensão + seção no growth report (sem redesign causal) |
| 8 | Métricas de exposição comercial | **Aberto** | Score de oportunidade existe; sem shares content/commercial, bridge coverage, funnel attribution metrics | Métricas no engine + growth report |
| 9 | Loop operacional GSC→ação | **Parcial** | `organic:run|diagnose|cohort`; relatório A–J de #56; sem `ORGANIC-GROWTH-REPORT` com 11 classes de oportunidade | Growth report CLI + JSON |

## Baseline GSC (export 2026-08-09, 7d) — características

- Agregado gráfico: 10 cliques / 384 impressões; páginas somam 433 impressões.
- **Discrepância dimensional é esperada** (privacy/agregação GSC); não forçar igualdade.
- ~84,8% impressões observáveis em `/conteudos/`; 9/10 cliques em conteúdo.
- 100/120 artigos da biblioteca ainda `noindex,follow` (disposição mass thin) — **não auto-indexar**.
- 20 artigos indexáveis (coorte “manter”); SINAPI/BDI entre os que já capturam clique.

## O que NÃO fazer

- Paralelizar outro “SEO engine” fora de `scripts/organic`.
- Farm pSEO / thin content / flip noindex sem human gate.
- Clickbait titles, AggregateRating, cases inventados.
- Declarar lift de CTR/leads antes de novo export GSC pós-deploy.

## Critério de implementação

Só fechar itens **Parcial** ou **Aberto** com o menor delta que torne o loop operacional, testável e revisável por humano.
