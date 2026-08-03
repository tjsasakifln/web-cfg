# Relatório final — remediação inbound-first (P0)

**Branch:** `fix/inbound-first-remediation`  
**Data:** 2026-08-03  
**Métrica de sucesso:** capacidade de adquirir clientes B2G por busca orgânica com confiança — **não** contagem de páginas.

## Resumo executivo

O site anunciava uma biblioteca de 120 guias enquanto 98 estavam `noindex`, com FAQ e frases de gerador nas páginas ainda indexáveis, shell de marca legado nos artigos e radar em `index` sem produto calibrado. A remediação P0:

1. alinhou a superfície pública (hub, feed, sitemaps, related) à realidade editorial;
2. reescreveu resíduo de máquina nas 22 páginas indexáveis de `/conteudos/`;
3. unificou shell/nav/footer/schema a partir de `data/site/brand.json`;
4. associou jornada A/B/C + CTA contextual;
5. instalou gates automatizados contra regressão;
6. comprovou redirects legados em produção;
7. **não** auto-aprovou Wave 1 nem inventou métricas GSC/GA.

## Problemas comprovados → ação

| Problema | Ação |
|----------|------|
| Hub 120 vs 98 noindex | Hub só 22 indexáveis; contagens honestas |
| Feed com noindex | 18 itens removidos |
| Featured com noindex | Substituído por indexáveis prioritários |
| FAQ/Converta machine em 17 indexáveis | Reescrita natural + JSON-LD FAQ |
| Shell legado em artigos | Nav/footer/org de `brand.json` |
| Radar index sem CTA | `noindex` + CTA configurar; fora do sitemap |
| Ofertas com H1 só proprietário | Plain language first |
| Sem gates de naturalidade/superfície | `inbound_gates` + `test:inbound-gates` |

## Arquivos principais

- `scripts/site/inbound_first_remediate.py` — motor de remediação
- `scripts/site/inbound_gates.py` — gates
- `scripts/site/test_inbound_gates.py` — testes no HTML shipado
- `scripts/editorial/naturalness.py` — machine residue
- `scripts/pseo/html_shell.py` — fallbacks plain-first
- `docs/seo/*` — auditoria, matriz, padrões, before/after, funil, legado, consolidação
- HTML público: `conteudos/**`, ofertas, hub, feed, radar, sitemaps

## URLs afetadas (síntese)

- **22** `/conteudos/*` indexáveis: shell + FAQ/CTA + journey
- **98** `/conteudos/*` noindex: shell + soft-fix Converta + related filtrado; **fora** do hub/feed
- **Hub** `/conteudos/`, **feed.xml**, **sitemap-inteligencia.xml** (`/radar/` out)
- Ofertas: `/diretoria-b2g/`, `/bid-room-licitacoes-obras/`, `/defesa-margem-contratos-publicos/`, `/diagnostico-b2g-360/`
- Legado produção: `/vision`, `/nexgen`, `/avcbclcb`, `/servicos`, `/contato` — **gates HTTP OK**

## Disposições

Ver `URL-DISPOSITION-MATRIX.csv` (~154 linhas). Classes usadas: KEEP_AND_IMPROVE, RETAIN_NOINDEX, BLOCKED_MISSING_EVIDENCE, RETIRE_410, REDIRECT_301.

## Testes (evidência em scratch da missão)

| Suite | Resultado |
|-------|-----------|
| `test:inbound-gates` | 10/10 OK |
| `test:brand` | OK (radar corrigido) |
| `test:copy` | OK |
| `test:analytics` | OK (sem PII) |
| `test:cta-whatsapp` | OK |
| `editorial:test` | 26 passed |
| `validate:seo` | exit 0 (WARN boilerplate residual em **noindex** — esperado P0) |
| `test:redirects:prod` | ALL passed |

## PR nº 10

Fluxo humano **íntegro**. Nenhum script desta PR marca `HUMAN_APPROVED`/`INDEXABLE`. Packet e `approve_wave1_tiago.sh` intocados em propósito.

## Limitações honestas

- GSC/Analytics/backlinks = **NO_DATA**
- 98 noindex ainda com boilerplate (não promovidas)
- Screenshots headless desktop/mobile: snapshot estático em scratch; runner visual opcional
- `build:site` completo pode regenerar hubs pSEO — reexecutar remediação de hub se build sobrescrever

## Ações que dependem de Tiago

1. Revisar e, se de acordo, fazer merge desta PR (não em `main` direto).
2. Concluir aprovação humana Wave 1 via PR nº 10 / `approve_wave1_tiago.sh` no ambiente de deploy desejado.
3. Após deploy: GSC — enviar sitemaps; **não** pedir indexação de noindex; Remoções para 410 legados se ainda em SERP.
4. Autenticar GSC para baseline real de demanda.

## Próximo lote editorial (recomendação)

Onda P1 de **5–8** URLs noindex com intenção comercial clara **e** (quando existir) sinal GSC, nos clusters de medição/glosa, aditivo e edital. Cada URL: reescrita + fontes + canibalização + aprovação humana + gates + inclusão controlada no hub/sitemap. **Não** reabrir 97 páginas em lote. **Não** iniciar P2 pSEO nacional até baseline GSC.


## Skeptic follow-up (P0 completeness)

- Pillar hubs filter library to indexable only (counts + ItemList).
- Full footer shell from brand.json (no `/#atuacao`).
- Naturalness scans stripped text (strong tags cannot hide slug keywords).
- `validate_seo` noindex detection handles both attribute orders.
- Index-surface evidence: `docs/seo/INDEX-SURFACE-AFTER.json`.
