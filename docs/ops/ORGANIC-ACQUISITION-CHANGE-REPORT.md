# Change report — Organic B2G acquisition engine (delta)

**branch:** `feat/organic-acquisition-engine`  
**base:** `origin/main` @ `88d72aea` (PR #58)  
**as_of:** 2026-08-09

## BEFORE → AFTER (resumo)

| Fragilidade | BEFORE | AFTER |
|-------------|--------|-------|
| 1 CTR gap | Hardcoded impr≥15 & clicks=0 | Config `serp-ctr-config.json` + SERP diagnosis + 8 gaps no baseline |
| 2 TOFU→BOFU | Links genéricos; 0 bridges em `/conteudos/` | Mapa formal + **20/20 indexáveis** com bridge editorial; coverage 100% indexável |
| 3 Comercial | Sólido; gaps when-not / b2g bridge | when-not em 5 pilares; bridge em `diagnostico-b2g-360` |
| 4 Entity | Resolvido | Sem mudança material (schema conservador mantido) |
| 5 Legado | Redirects existem | Inventário formal + testes |
| 6 Sitemap | robots OK | `organic:sitemap-audit` (0 high issues) |
| 7 Mobile | Não analisado | Devices + page×device no loader; seção no growth report |
| 8 Métricas | Ausentes | Shares + coverages no engine/growth |
| 9 Loop GSC | run/diagnose | `organic:growth` → ORGANIC-GROWTH-REPORT |

## IMPLEMENTADO

1. `data/organic/serp-ctr-config.json` — thresholds documentados
2. `data/organic/content-service-map.json` — content→service_fit extensível
3. `data/organic/legacy-url-inventory.json` + GSC baseline `seo/gsc-2026-08-09/`
4. Módulos: `gsc_loader`, `serp_ctr`, `service_map`, `bridges`, `metrics`, `growth_report`, `sitemap_hygiene`
5. CLI: `run|growth|bridges|sitemap-audit` (além de diagnose/cohort)
6. Snippets SERP em 8 URLs prioritárias do baseline (title/meta, sem clickbait)
7. Bridges editoriais nos 20 `/conteudos/` indexáveis
8. when-not-hire em pilares comerciais prioritários
9. Testes: `scripts/organic/tests/test_acquisition_delta.py` (suite organic 23 passed)
10. Docs: BEFORE diagnosis, growth report, este change report, ORGANIC-ENGINE atualizado

## MEDIDO (local / automatizado)

| Métrica | Valor |
|---------|------:|
| organic tests | 23 passed |
| serp_ctr_gap (baseline) | 8 |
| commercial_impression_share | ~7.8% |
| informational_impression_share | ~84%+ (alinha baseline) |
| indexable_commercial_bridge_coverage | 1.0 |
| indexable_content_to_service_link_coverage | 1.0 |
| service_to_supporting_content_coverage | 1.0 |
| sitemap high issues | 0 |
| inbound gates | OK |
| redirects matrix | OK |

## HIPÓTESE A VALIDAR COM GSC APÓS DEPLOY

- Titles/metas dos prioritários aumentam CTR (amostra 7d ainda pequena).
- Bridges aumentam transição content→service (precisa analytics, não GSC só).
- Mobile 0-click é predominantemente SERP-side; layout não assumido causal.
- Indexação humana de noindex com impressões (chuva, aditivo qualitativo, etc.) — **não auto-aprovado**.

## Skeptic review

| Pergunta | Veredito |
|----------|----------|
| CTA virou propaganda? | **Pass** — bridge educa + CTA secundário; sem popup/urgência |
| Sacrifica ranking informacional? | **Pass** — bridges no fim do artigo; no flip noindex |
| Canibalização criada? | **Pass** — mapa aponta um serviço por cluster; sem novas URLs farm |
| Titles artificiais / clickbait? | **Pass** — sem “Guia Completo 2026 \| Saiba Tudo” |
| URL comercial mirando intent de conteúdo? | **Pass** — serviços continuam BOFU; conteúdo continua TOFU/MOFU |
| Internal linking spam? | **Pass** — um bridge por página indexável |
| Sitemap com redirects? | **Pass** — audit 0 high |
| 301 que deveria ser 410? | **Pass** — AVCB/Vision 410; blog→conteudos semântico |
| Schema exagerado? | **Pass** — sem AggregateRating/review falso |
| Duplicata do PR #56? | **Pass** — estende engine; não fork |
| Overfit amostra GSC? | **Pass** — confidence baixa documentada; hipóteses explícitas |
| Material legal sem human review? | **Pass** — metadata + bridges editoriais; noindex intacto |

## Arquivos-chave

- `scripts/organic/*` (delta)
- `data/organic/*`
- `seo/gsc-2026-08-09/*`
- `conteudos/*/index.html` (20 bridges + 8 snippets)
- pilares comerciais (when-not + b2g bridge)
- `docs/ops/ORGANIC-*`
