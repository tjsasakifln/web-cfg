# Auditoria inbound-first — CONFENGE (web-cfg)

**Data:** 2026-08-03  
**Branch:** `fix/inbound-first-remediation`  
**Coordenação:** PR nº 10 (`audit/wave1-final-human-packet`) permanece o fluxo humano de Wave 1 — esta remediação **não** auto-aprova páginas.

## 1. Estado factual (baseline)

| Item | Valor |
|------|------:|
| Páginas `/conteudos/*` | 120 |
| Indexáveis (`index,follow`) | 22 |
| `noindex` | 98 |
| Hub listava | **120** (inconsistente) |
| Sitemap conteudos | 22 (já correto) |
| Feed com noindex | 18 itens |
| Machine language em indexáveis | 17/22 |
| Machine language em noindex | 98/98 |
| Editorial Wave 1 no registry | 11 `INDEXABLE` + 1 `REJECTED` (estado do branch; aprovação é de Tiago) |
| Brand test baseline | `FAIL test_radar_not_empty_wave_message` |
| GSC / Analytics / backlinks | **NO_DATA** — não inventados |

### PR nº 10

- Título: audit Wave 1 + human approval packet (0 auto-approve no desenho da PR).
- Artefatos: `FINAL-HUMAN-REVIEW-PACKET.md`, `approve_wave1_tiago.sh`, claim gates.
- Esta missão **não** executa o script de aprovação nem altera o protocolo humano.

### Geradores e fontes

| Componente | Caminho |
|------------|---------|
| Brand SoT | `data/site/brand.json` |
| Shell | `scripts/pseo/html_shell.py`, `scripts/site/brand.py` |
| pSEO build | `scripts/pseo/build.py`, `build_site.py` |
| Editorial | `scripts/editorial/*`, `data/editorial/*` |
| Bulk SEO (legado) | `seo/scripts/bulk_seo_upgrade.py` (marcado para não regenerar FAQ “caso de {kw}”) |
| Redirects | `_redirects` |
| Sitemaps | `sitemap.xml`, `sitemap-editorial.xml`, `sitemap-inteligencia.xml`, `sitemap-index.xml` |

## 2. Problemas comprovados

1. **Superfície pública mentirosa:** hub anunciava 120 guias enquanto 98 estavam `noindex` e o próprio sistema editorial rejeita profundidade falsa.
2. **Featured + feed** promoviam URLs `noindex`.
3. **Linguagem de máquina** em 17 páginas indexáveis (FAQ “caso de {keyword}”, “Converta a discussão…”).
4. **Shell legado** em artigos: nav Atuação/Diferenciais/Método; footer e Organization schema começando por “Diretoria B2G fracionada…” em vez de linguagem comum.
5. **Radar** em `index,follow` sem CTA de configuração exigido pelo contrato de marca; depois marcado `noindex` e removido do sitemap de inteligência.
6. **Dados de demanda** (GSC/GA/backlinks) ausentes — decisões de consolidação profundas aguardam evidência (P1).

## 3. Disposições (resumo)

Matriz completa: `docs/seo/URL-DISPOSITION-MATRIX.csv` + `.json` (154 linhas).

| Disposition | Qtd (aprox.) | Significado |
|-------------|-------------:|------------|
| KEEP_AND_IMPROVE | 46 | Comercial + pilares + ofertas + indexáveis limpos |
| RETAIN_NOINDEX | 98 | Biblioteca thin/pSEO; acessível, não promovida |
| BLOCKED_MISSING_EVIDENCE | 1 | `jur-sumula-260-art` |
| RETIRE_410 | 6 | Vision, NexGen, AVCB, avaliações, IA, automação |
| REDIRECT_301 | 3 | blog, serviços, contato (substituto semântico) |

**Não** reabrimos as 98 `noindex` em lote.

## 4. Correções aplicadas (P0)

| Ação | Resultado |
|------|-----------|
| Hub `/conteudos/` | só 22 indexáveis; contagens alinhadas |
| Feed | itens noindex removidos |
| Shell de marca | nav/footer/org em páginas comerciais + indexáveis + pilares |
| FAQ/CTA machine | reescritos nas 17 indexáveis afetadas |
| Related links | só peers indexáveis |
| Jornada + CTA | `data-journey` + CTA contextual por cluster |
| Radar | `noindex` + CTA “Configurar meu radar…” |
| Sitemap inteligência | `/radar/` removido |
| Gates | naturalness, surface, brand, conversion, legacy, similarity |
| Fallbacks shell | plain language first |

## 5. O que **não** foi feito (honesto)

- Auto-aprovar Wave 1 ou reindexar as 98 noindex.
- Inventar impressões, cliques, conversões ou backlinks.
- Provar HTTP de produção quando a rede falhar (ver `LEGACY-ENTITY-CLEANUP.md`).
- Reescrita profunda de todas as noindex (P1, ondas humanas).
- Consolidação canibalização completa sem GSC.

## 6. Comandos

```bash
python3 scripts/site/inbound_first_remediate.py   # remediação idempotente
npm run test:inbound-gates
npm run inbound:gates
npm test
npm run build:site
npm run validate:seo
npm run audit:public-artifact
npm run test:redirects:prod   # quando rede permitir
```

## 7. Próximo lote editorial (recomendação)

1. Tiago conclui revisão da PR nº 10 / `approve_wave1_tiago.sh` se ainda não o fez no deploy alvo.
2. Onda P1 pequena (5–8 URLs) com sinais reais de demanda GSC entre as 98 noindex — reescrita + fontes + canibalização + aprovação humana.
3. Consolidar pares canibais já listados em `docs/editorial/CONTENT-CANNIBALIZATION-REPORT.md` **após** indexação controlada de Wave 1.
4. Não expandir pSEO nacional até gates verdes em produção e baseline GSC.
