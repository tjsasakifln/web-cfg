# Relatório de migração pSEO — estado final auditado (2026-07-31)

## Objetivo

Pipeline: `datalake → export público → classificação → agregados → páginas → revisão humana → indexação → conversão`.

KPI: contatos comerciais qualificados **sem** dados falsos/contaminados/não auditáveis. Sem teto artificial de páginas.

## Antes → Depois

| Métrica | Wave1 (defeitos) | Agora |
|--------|-----------------:|------:|
| Contratos brutos | 11931 | 11931 |
| Classificados AEC / aec_confirmed | 908 (regex) | **243** (multi-camada) |
| Bids “abertos” | histórico misturado | **39** vigentes |
| Publish com PENDING | 24 | **0** |
| Publish APPROVED | 0 real | **9** |
| noindex / reject | 48 / 0 | **6 / 6** |
| MAX_PUBLISH | 24 | **removido** |
| Precision gold aec_confirmed | n/d | **1.00** (n=77, fp=0) |
| Benchmarks CBUQ+paralelepípedo | mistos | **tipologias separadas** |
| Multi-rótulo mercado (edificações+pavimentação) | contaminava top_objects | **primary_archetype** |
| Compra equipamento / SaaS / locação máquinas → AEC | sim | **non_aec** (testado) |
| Links oficiais em preços | ausentes | **PNCP deep-link 5/5** |
| Links oficiais em radar | search-only / vazio | **portal ou PNCP via ID** |
| problem_service fontes | só nomes de dataset | **Lei 14.133 / SINAPI / SICRO / TCU / PNCP** |
| pseo_form_start + submit + WhatsApp | não coberto | **e2e sem PII** |
| source_commit com exportador | não | **sim** |

## Proveniência

| Campo | Valor |
|-------|-------|
| Branch | `feat/pseo-durable-export` |
| source_commit_sha | `702a17fbb077c69012b263eb52f4af07f746c16e` |
| export_entrypoint | `python -m scripts.pseo.cli_export` |
| dataset_hash | `ac09cc3142c396b7fcb2839b123ccc099bec5010e24fe884a636c96c19e518d1` |
| data_as_of | `2026-07-31` |
| hash recomposto | **True** |
| checksums | **True** |
| entrypoint no commit | **True** |

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

## Classificador

- Labels: aec_confirmed | aec_probable | non_aec | ambiguous | insufficient_context
- Gold **n=77** estratificado: **P=1.0, R=1.0, F1=1.0, FP=0** (artefato: classifier-metrics.json)
- `primary_archetype()`: multi-rótulo retido para recall, mas markets/competition usam **primário** (material-specific vence “obra de engenharia” genérica)
- Contagens: `{"aec_confirmed": 243, "aec_probable": 57, "ambiguous": 666, "bid_status_aberta": 39, "bid_status_closed_total": 328, "insufficient_context": 5942, "non_aec": 5023}`

## Páginas indexáveis (9) — auditadas limpas

| URL | Tipo | Score | Review |
|-----|------|------:|--------|
| `/inteligencia/cenarios/aditivos-e-risco-de-margem/` | problem_service | 86 | APPROVED |
| `/inteligencia/cenarios/inconsistencia-orcamento-edital/` | problem_service | 86 | APPROVED |
| `/inteligencia/cenarios/medicao-glosa-contratos-recorrentes/` | problem_service | 80 | APPROVED |
| `/inteligencia/cenarios/referencia-sinapi-sicro-margem/` | problem_service | 86 | APPROVED |
| `/inteligencia/orgaos/mrs-prefeitura-municipal-de-caxias-do-sul-rs/engenharia/` | agency | 85 | APPROVED |
| `/inteligencia/precos/manutencao-predial-engenharia-rs-manutencao-predial/` | price | 84 | APPROVED |
| `/inteligencia/precos/pavimentacao-infraestrutura-viaria-pi-paralelepipedo/` | price | 80 | APPROVED |
| `/radar/edificacoes-publicas-pr/` | radar | 87 | APPROVED |
| `/radar/pavimentacao-infraestrutura-viaria-sc/` | radar | 80 | APPROVED |

Todas: `robots=index,follow…`, presentes no `sitemap-inteligencia.xml`, com fontes oficiais ou deep-links conforme tipo.

### Links oficiais

| Superfície | Resultado |
|------------|-----------|
| Preços (2) | **5/5** deep-link PNCP `/app/contratos/{cnpj}/{ano}/{seq}` |
| Radar publish (2) | **100%** itens com HTTP (portal real ou PNCP do `pncp_id`) |
| problem_service (4) | Referências oficiais (Planalto / SINAPI / SICRO / TCU / PNCP) + guias |
| Agency | Portais de consulta rotulados (não ficha de contrato) |

## Não indexados (honesto)

- human_review após re-export: APPROVED=9 quality-eligible; demais PENDING ou reject por massa
- `edificacoes-publicas-mg`: contaminação de pavimentação **corrigida** via primary_archetype; caiu para **reject** (`contracts<15` após pureza)
- `prob-reequilibrio`: score 77 / quality_eligible=false → **noindex** (não forçamos APPROVED)
- Sem bulk-APPROVED; cada mudança de `dataset_hash` invalida APPROVED

## Testes

| Suite | Resultado |
|-------|-----------|
| extra-cli pytest | **30 passed** |
| gold metrics | **P=1.0 n=77 FP=0** |
| web-cfg validate | **ok** publish=9 |
| web-cfg audit | **ok** determinístico |
| web-cfg pseo:test | **13 passed** |
| attribution e2e | form_start + form_submit |
| WhatsApp e2e | pseo_whatsapp_click, sem PII |
| publish audit | **EVIDENCE_OK** |

## Riscos residuais

1. Deep-link PNCP de bid (`/app/contratos/…` a partir de compra) **pode 404** — preferimos portal real → PNCP tentativo → indisponível.
2. Freshness radar com `as_of=hoje` → age≈0 com wall-clock; hard-fail >72h só se as_of atrasar.
3. Datalake ≠ censo; vários markets em reject por massa após pureza.
4. Branch durable: manter `feat/pseo-durable-export`.
5. Re-export sempre re-exige revisão humana (hash gate).
6. `prob-reequilibrio` permanece noindex até elevar quality ou evidência.

## Contagens

```json
{
  "after_classification_aec_confirmed": 243,
  "after_open_filter": 39,
  "agencies": 1,
  "archetypes": 5,
  "classified_aec_bids": 367,
  "classified_aec_contracts": 243,
  "closed_bids": 328,
  "competition": 1,
  "markets": 5,
  "open_bids": 39,
  "opportunities": 7,
  "pncp_raw_bids": 1536,
  "pncp_supplier_contracts": 11931,
  "prices": 2,
  "problem_service": 5,
  "raw_contracts": 11931,
  "sc_public_entities": 2085
}
```

## Política de indexação

- Sem `MAX_PUBLISH` numérico.
- `publish` exige APPROVED/APPROVED_WITH_NOTES **e** quality gates.
- Sitemap só `publish`.
- Related market só se HTML existir.
- Atribuição sessionStorage + query; eventos `pseo_*` sem PII.
