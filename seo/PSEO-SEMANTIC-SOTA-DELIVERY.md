# Delivery summary — pSEO semantic SOTA
Date: 2026-07-31

## HEADs
- web-cfg: `8a01a94a339183bf000fd82ae056afdd1686c194` (branch main / commit pending)
- extra-cli worktree feat/pseo-semantic-sota: `b8b6c81b10fbb61ebc82a020996680c573f63f32`

## Containment
- All 8 previously APPROVED/publish pages revogadas (NEEDS_DATA_FIX / NEEDS_CONTENT_FIX).
- After semantic gates: **publish_count = 0** (all quality-ineligible pages are `reject`).
- Sitemap de inteligência: apenas hubs (sem as oito URLs).

## Decisões finais (oito páginas)
- `agency-88830609`: **reject** / NEEDS_DATA_FIX — agency_name_ingestion_prefix, suppliers<3, temporal_span_days<180, max_single_day_share>0.70
- `price-manutencao-predial-engenharia-rs-manutencao-predial`: **reject** / NEEDS_DATA_FIX — buyers<3, temporal_span_days<90, max_buyer_share>0.60
- `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo`: **reject** / NEEDS_DATA_FIX — obs<15, primary_contracts<15, temporal_span_days<90
- `radar-edificacoes-publicas-pr`: **reject** / NEEDS_DATA_FIX — contract_url_as_opportunity=7, zero_used_for_missing_value=1
- `radar-pavimentacao-infraestrutura-viaria-sc`: **reject** / NEEDS_DATA_FIX — duplicate_items=2, duplicate_rate>0, contract_url_as_opportunity=4
- `prob-orcamento-edital`: **reject** / NEEDS_CONTENT_FIX — no_direct_budget_edital_evidence, no_claim_specific_evidence
- `prob-sinapi-sicro`: **reject** / NEEDS_CONTENT_FIX — no_direct_sinapi_sicro_evidence, no_claim_specific_evidence
- `prob-aditivos-margem`: **reject** / NEEDS_CONTENT_FIX — no_direct_aditivo_evidence, no_claim_specific_evidence

## Antes × depois
| Item | Antes | Depois |
|---|---|---|
| Páginas publish indexáveis | 8 | **0** |
| Score compensa falha semântica | sim (audit verde) | **não** (gates obrigatórios) |
| Reajuste como contrato primário | possível | **bloqueado no produtor** |
| Link /app/contratos/ em radar | presente | **gate reject** |
| R$ 0,00 valor ausente | presente | **gate + money_or_ni** |
| MRS- prefixo | visível | **humanize + gate** |
| evidence_count genérico | sustentava cenário | **reject sem evidência direta** |
| Bulk auto-approve | risco | **checklist obrigatório + audit PAGE_ID** |
| Editorial audit | ausente | **seo/pseo-editorial-report.*** |
| Learn loop | docs only | **scripts/pseo/learn.py + metrics/** |

## Testes
- extra-cli: `pytest tests/pseo` → **51 passed**
- web-cfg: `npm run pseo:test` → **23 passed**
- web-cfg: `npm run pseo:validate` → ok (0 publish)
- web-cfg: `npm run test:analytics` → ANALYTICS_UNIT_OK
- web-cfg: `npm run validate:seo` → VALIDATION_OK

## Pendências reais
- Reexport completo do datalake (DB) com a nova identity layer para regenerar snapshot com métricas de independência nativas (hoje os gates já rejeitam no consumidor a partir do snapshot legado).
- Playwright mobile/desktop: não executado end-to-end neste ambiente (fallback: unit + editorial_audit + HTML gerado).
- Deploy Netlify: **não executar** enquanto zero páginas publish (estado desejado). Quando houver página aprovável individualmente, deploy manual com credencial Netlify.
- Breadcrumb/slug de URL ainda usa path histórico `mrs-prefeitura-...` (identificador de URL estável); display humanizado no título/H1.
- Páginas cenário: manter reject/consolidar até evidência claim-específica no datalake.
