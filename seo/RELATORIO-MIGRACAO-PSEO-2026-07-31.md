# Relatório de migração pSEO — estado final auditado (2026-07-31)

## Objetivo

Pipeline: `datalake → export público → classificação → agregados → páginas → revisão humana → indexação → conversão`.

KPI: contatos comerciais qualificados **sem** dados falsos/contaminados/não auditáveis. Sem teto artificial de páginas.

## Antes → Depois

| Métrica | Wave1 (defeitos) | Agora |
|--------|-----------------:|------:|
| Contratos brutos | 11931 | 11931 |
| aec_confirmed | 908 (regex) | **233** (multi-camada, precision-first) |
| Bids abertos | histórico misturado | **37** vigentes |
| Publish PENDING | 24 | **0** |
| Publish APPROVED | 0 | **8** |
| noindex / reject | — | **7 / 5** |
| MAX_PUBLISH | 24 | **removido** |
| Gold aec_confirmed | n/d | **n=83 P=1.0 R=1.0 FP=0** |
| limpeza+asseio+conservação predial → AEC | sim | **non_aec** |
| engenharia de segurança do trabalho → AEC | sim | **non_aec** |
| multi-rótulo mercado | contaminava top_objects | **primary_archetype** |
| Benchmarks CBUQ+paralelepípedo | mistos | **tipologias separadas** |
| Preços links oficiais | ausentes | **PNCP deep-link 5/5** |
| problem_service fontes | nomes de dataset | **Lei 14.133 / SINAPI / SICRO / TCU / PNCP** |
| form_start/submit + WhatsApp | não | **e2e sem PII** |

## Proveniência

| Campo | Valor |
|-------|-------|
| Branch | `feat/pseo-durable-export` |
| source_commit_sha | `d3a7f761674e87321905ae51f16c68423bb19b9f` |
| export_entrypoint | `python -m scripts.pseo.cli_export` |
| dataset_hash | `65927f2034db594e3144de147309fa5fe8fb51bb35e5576a91b4f692b4c24d52` |
| data_as_of | `2026-07-31` |
| hash recomposto | **True** |
| checksums | **True** |

```bash
cd "/mnt/d/extra consultoria" && git checkout feat/pseo-durable-export
set -a && source .env && set +a
python3 -m scripts.pseo.cli_export --out /mnt/d/webcfg/data/pseo --as-of 2026-07-31 --validate
python3 -m pytest tests/pseo -q --no-cov
```

```bash
cd /mnt/d/webcfg
python3 scripts/pseo/review.py set PAGE_ID APPROVED --reviewer tiago --notes "..."
npm run pseo:build && npm run pseo:validate && npm run pseo:audit
npm run pseo:test && npm run test:pseo-attribution && npm run test:analytics
```

## Classificador (skeptic FPs fechados)

- **limpeza/asseio/copeiragem** + conservação predial → `non_aec` (facility package vence manut_predial)
- **engenharia de segurança do trabalho / SESMT** → `non_aec`
- **serv_engenharia** exige co-sinal de obra/fiscalização/empreitada
- **sem instalação** não conta como install signal em compras
- Gold **n=83** inclui itens **extraídos de aggregates live** (manutenção SP top_objects)
- Métricas: P=1.0 R=1.0 F1=1.0 FP=0 (artefato `classifier-metrics.json`)

Contagens: `{"aec_confirmed": 233, "non_aec": 5154, "insufficient_context": 5832, "ambiguous": 655, "aec_probable": 57, "bid_status_aberta": 37}`

## Páginas indexáveis (8)

| URL | Tipo | Score |
|-----|------|------:|
| `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | agency | 85 |
| `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/` | price | 84 |
| `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/` | price | 80 |
| `/radar/edificacoes-publicas-pr/` | radar | 87 |
| `/radar/pavimentacao-infraestrutura-viaria-sc/` | radar | 80 |
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | problem_service | 86 |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | problem_service | 86 |
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | problem_service | 86 |

Todas: `robots=index,follow`, no sitemap, fontes oficiais/deep-links. **0** limpeza/SESMT em top_objects de markets.

Mercado `manutencao-predial-engenharia-sp` **deixou de existir** após remoção dos FPs (massa insuficiente).

## Não indexados

- Markets: reject `contracts<15` (purity > volume)
- problem_service medicao/reequilibrio: quality insuficiente → noindex
- PENDING quality-ineligible radars → noindex
- Sem bulk-APPROVED

## Testes

| Suite | Resultado |
|-------|-----------|
| extra-cli pytest | **34 passed** |
| gold | **n=83 P=1.0 FP=0** exact match 83/83 |
| web-cfg validate | **ok** publish=8 |
| web-cfg audit | **ok** |
| web-cfg unit | **13 passed** |
| attribution e2e | form_start + form_submit |
| WhatsApp e2e | sem PII |
| publish evidence | **EVIDENCE_OK** |
| market purity | **MARKET_PURITY_OK** |

## Riscos residuais

1. Deep-link PNCP de bid pode 404; portais reais preferidos.
2. Freshness radar com as_of=hoje → age≈0 (wall-clock correto).
3. Datalake ≠ censo; massa regional limita markets indexáveis.
4. Re-export invalida APPROVED (hash gate).
5. Multi-rótulo residual em contratos edge — primary_archetype mitiga markets, gold não cobre 100% do universo.
6. Classificador baseado em objeto textual; códigos de item/CNAE ainda não usados quando ausentes no snapshot.

## Contagens export

```json
{
  "after_classification_aec_confirmed": 233,
  "after_open_filter": 37,
  "agencies": 1,
  "markets": 4,
  "prices": 2,
  "competition": 1,
  "opportunities": 7,
  "open_bids": 37,
  "problem_service": 5,
  "raw_contracts": 11931
}
```
