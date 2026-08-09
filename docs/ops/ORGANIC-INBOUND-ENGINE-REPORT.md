# Motor de inbound orgânico Confenge — Relatório final (A–J)

**as_of:** 2026-08-09  
**Repos:** `web-cfg` + `extra-cli`  
**North star:** receita esperada atribuível ao inbound orgânico (tráfego é meio)

---

## A. Estado anterior

### O que já existia

| Camada | Estado |
|--------|--------|
| Site estático Netlify | Serviços, pilares, `/conteudos/` (~120), ferramentas, radar, inteligência, Lei 14.133, guias |
| pSEO export (extra-cli → `data/pseo/`) | markets, agencies, prices, competition, opportunities/radar, problem_service, registry |
| Scoring pSEO | `indexability_score`, `page_value_score` (advisory), semantic gates fail-closed |
| Lifecycle | CANDIDATE → … → INDEXED / NOINDEX (separado de HTML gerado) |
| Editorial Wave1 | Human-gated (`approve_cli`); parte INDEXABLE, parte EDITORIAL_REVIEWED |
| GSC | Export `seo/gsc-2026-07-30` + `search_demand_observatory` + `data/ops/gsc-insights.json` |
| Disposition | Biblioteca: noindex≈97, manter≈21, consolidar≈2 |
| Conversion | CTAs por jornada, lead functions, nurture, revops daily/weekly |
| Organic improvements | Coorte CTR/title já aplicada em páginas GSC prioritárias |

### Gargalos principais

1. **Baseline GSC fraco** — ~10 cliques / ~325 impressões no export; discovery cedo.  
2. **Sem fila unificada de oportunidades comerciais** — pSEO, GSC e editorial viviam em silos.  
3. **Score pSEO ≠ Content Value Score orientado a receita** — pesos diferentes do objetivo (intent comercial / fit serviço / data moat).  
4. **Mass noindex em `/conteudos/`** — thin/template histórico; não reabrir em volume.  
5. **pSEO 0 publishable automático** — correto (fail-closed); falta priorização por receita esperada.  
6. **Wave1 editorial** ainda exige humano nominal para indexar o restante.

Artefato reproduzível: `data/organic/diagnosis.json` + `data/organic/diagnosis.md`.

---

## B. Tese

Não vencer a internet com mais artigos genéricos sobre a Lei 14.133.

Vencer combinando:

`dados públicos em escala (extra-cli) + inteligência contratual Confenge + JTBD real + autoridade tópica + SEO técnico + conversão por intenção + feedback GSC/analytics`

O motor produz **oportunidades ranqueadas por impacto comercial esperado**, não por volume de keyword.  
Publicar em escala só depois de **Indexability Quality Gate** + provenance.  
HTML gerado **≠** permissão de indexação.

---

## C. Arquitetura implementada

```
extra-cli datalake (PG / snapshot)
    → scripts.pseo.export_web_cfg  (já existia)
    → data/pseo/*.json

extra-cli scripts.organic  +  web-cfg scripts.organic
    → demand graph (persona→problema→pergunta→intenção→serviço)
    → data insights (markets, problem_service, radar)
    → Content Value Score (pesos parametrizáveis)
    → Indexability Quality Gate (fail-closed)
    → data/organic/SEO_OPPORTUNITIES.json  (fila ranqueada)

web-cfg site
    → páginas serviço / editorial / radar / inteligência / ferramentas
    → CTAs por intenção, links internos semânticos
    → lead/collect analytics

GSC (CSV/API quando houver credenciais) + revops observatory
    → striking distance, CTR, decay → reentra no engine (gsc_page / demand match)
    → data/ops/gsc-insights.json
```

### Entrypoints

```bash
# extra-cli
python3 -m scripts.organic --pseo-dir /path/to/webcfg/data/pseo \
  --gsc-dir /path/to/webcfg/seo/gsc-2026-07-30 \
  --out SEO_OPPORTUNITIES.json

# web-cfg
npm run organic:diagnose
npm run organic:run
npm run organic:cohort          # seleção
npm run organic:cohort -- --apply
npm run organic:test
```

---

## D. Mudanças

### extra-cli

| Path | Função |
|------|--------|
| `scripts/organic/` | Engine, score, gates, demand_graph, insights, CLI |
| `scripts/organic/fixtures/` | Snapshot mínimo testável sem PG |
| `tests/organic/test_engine.py` | Score, gates, CLI, schema, ordenação |

### web-cfg

| Path | Função |
|------|--------|
| `scripts/organic/` | Consumer + diagnosis + cohort materialization |
| `scripts/organic/tests/` | Testes no snapshot real `data/pseo` + GSC |
| `data/organic/SEO_OPPORTUNITIES.json` | Fila 27 oportunidades |
| `data/organic/demand-map.json` | Grafo de demanda |
| `data/organic/diagnosis.{json,md}` | Diagnóstico |
| `data/organic/pilot-cohort.json` | Coorte piloto |
| `data/organic/content-value-weights.json` | Pesos/penalidades |
| `docs/ops/ORGANIC-INBOUND-ENGINE-REPORT.md` | Este relatório |
| Páginas piloto | Insight blocks, TAYA BOFU, tool link, market insight |
| `package.json` | `organic:run|diagnose|cohort|test` |

**Não alterado:** governança human-approval editorial; fail-closed pSEO; opportunity_intel comercial de editais.

---

## E. Conteúdo

| Ação | O quê |
|------|--------|
| **Melhorado** | `/conteudos/*` com insight de problem_service (aditivo, reequilíbrio, glosa, orçamento edital); `/aditivos-obras-publicas/` tool link; `/auditoria-orcamento-licitacao/` bloco They Ask You Answer; `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/` insight proprietário com corte/mediana/limites |
| **Melhorado (pré-existente coorte GSC)** | Titles/CTAs SINAPI desonerado, limite aditivo, critério medição, prorrogação, notificação atraso |
| **Mantido noindex** | Massa thin `/conteudos/` + pSEO reject; radar com gate falho permanece não-indexável como candidato fraco |
| **Não criado em massa** | Zero farm de URLs por UF/órgão sem gate |

---

## F. Coorte piloto (URL a URL)

Fonte: `data/organic/pilot-cohort.json` + materializações.

| Slot | URL / ID | Intenção | Diferencial | Dado proprietário | Cluster | CTA | Index |
|------|----------|----------|-------------|-------------------|---------|-----|-------|
| BOFU | `/auditoria-orcamento-licitacao/` | bofu | Serviço + TAYA (quando contratar / não) | editorial | edital-proposta | Auditar edital e orçamento | candidate (já indexável no site) |
| MOFU / GSC | `/conteudos/sinapi-desonerado-nao-desonerado/` | mofu | 88 impr. / 0 cliques @~7.8 — CTR fix prioritário | GSC + serviço orçamento | orcamento-bdi | WhatsApp/base SINAPI + serviço auditoria | keep/improve (já indexável) |
| Pillar | problem→aditivos + `/aditivos-obras-publicas/` | mofu | Serviço + tool limite 25/50 | problem_service evidence | aditivos | Revisar aditivo / verificador | candidate |
| Data-driven | problem→medição/glosa pages | mofu | Insight + padrões observados | evidence_count datalake/editorial | medicoes | Serviço medições | candidate |
| Tool | `/ferramentas/limite-acrescimos-supressoes/` (linkado) | mofu | Ferramenta com valor autônomo | n/a (compute) | aditivos | Abrir verificador | indexável |
| Improve | `/conteudos/orcamento-incompleto-edital-obra-publica/` | mofu | Insight + serviço auditoria | problem_service | orcamento-edital | Ver serviço | candidate |
| pSEO radar | `/radar/edificacoes-publicas-pr/` | tofu | Itens abertos + freshness | radar export | radar | Bid room | **blocked_by_gate** se amostra/critérios falham — correto |
| Market data product | `/inteligencia/mercados/pavimentacao-infraestrutura-viaria-sc/` | tofu | “Analisamos N contratos… mediana…” | markets.json (13 contratos SC) | inteligencia | Metodologia | depende robots da página; insight com limitações |

**Razão de indexação (regra):** só quando intenção distinta + informação própria + amostra + anti-canibalização + provenance + CTA contextual. Score alto **não** compensa gate.

---

## G. Qualidade

| Suite | Resultado |
|-------|-----------|
| `python3 -m pytest scripts/organic/tests` (web-cfg) | **8 passed** |
| `python3 -m pytest tests/organic` (extra-cli) | **8 passed** |
| `python3 scripts/revops/search_demand_observatory.py analyze` | insights em `data/ops/gsc-insights.json` |
| Engine live | 27 oportunidades; ≥4 BOFU; ≥1 data-driven; ordenadas por score |

Gates unitários: thin/sem provenance → não indexável mesmo com score 99.

---

## H. Riscos conhecidos

1. **GSC sample pequeno** — sinais de demanda frágeis; não overfit em 20 queries.  
2. **Human gate editorial** — páginas Wave1 ainda dependem de aprovação nominal real.  
3. **pSEO national classifier gate inconclusive** — não reabrir publish automático.  
4. **Insight em páginas noindex da biblioteca** — prepara reescrita; não equivale a indexar thin.  
5. **Inferência jurídica** — insights proíbem afirmar irregularidade/crédito; só agregado + limitações.  
6. **Duplicação de módulos score/gates nos dois repos** — manter em sync ao evoluir pesos.  
7. **Hash de oportunidade GSC** usa `hash()` — estável na mesma run CPython, não cross-process; IDs GSC são operacionais.

---

## I. Próximos experimentos (impacto ÷ esforço)

1. **CTR SINAPI** — validar em 28d se title/meta + CTA aumentam CTR (já coorte).  
2. **Expandir 3–5 pages “manter” com insight de markets reais** (só se n≥15 e interpretation).  
3. **Human approve** das EDITORIAL_REVIEWED de alta intenção (aditivo/reequilíbrio/medição).  
4. **Wire revops daily** para reexecutar `organic:run` e anexar top-10 no weekly email.  
5. **Consolidar 2 slugs disposition consolidar** com redirect 301.  
6. **Só então** escalar pSEO market pages que passarem gate com dataset_hash fresco.

---

## J. Métricas baseline

| Métrica | Valor (export 2026-07-30) |
|---------|---------------------------|
| GSC clicks (pages sum) | ~10 |
| GSC impressions (pages sum) | ~325 |
| GSC query rows | 20 |
| GSC page rows | 59 |
| pSEO registry publishable | 0 (fail-closed) |
| Editorial INDEXABLE | ver `EDITORIAL-REGISTRY.json` |
| Content library noindex | ~97 |
| Organic opportunities total | 27 |
| Organic BOFU | 4 |
| Organic data-driven | 16 |
| Organic indexable_candidate (score+gate) | ~19 (não = live index) |

Reavaliar com novo export GSC + leads orgânicos (revops cohorts) em 30–60 dias.

---

## Princípio final

Se uma página puder ser produzida por qualquer concorrente com um único prompt genérico, **não** é vantagem competitiva suficiente.

O motor existe para descobrir o que só a combinação Confenge + datalake + prática contratual consegue responder — e publicar isso com disciplina de indexação.
