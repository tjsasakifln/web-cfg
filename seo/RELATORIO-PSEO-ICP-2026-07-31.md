# Relatório final — pSEO ICP-Derived Evidence (2026-07-31)

## Objetivo econômico

`busca qualificada → página de inteligência → autoridade → CTA → WhatsApp/formulário → reunião → proposta`

KPI principal: **contato qualificado atribuível a página** (não volume de URLs).

## O que foi entregue

### 1. Exportador read-only (`extra-cli`)

- Entry: `python -m scripts.pseo.export_web_cfg`
- Allowlist + denylist (`scripts/pseo/allowlist.py`, `sanitize.py`)
- Agregação pública a partir de `pncp_supplier_contracts`, `pncp_raw_bids`, `sc_public_entities`
- Top 20 usado **somente** como assinatura interna de classes de atividade/sinais (histogramas em `icp_methodology.json`) — **sem** CNPJ, score, rank, pipeline
- Manifest com schema_version, generated_at, source_run_id, source_commit_sha, dataset_hash, fontes, contagens, freshness, limitações, checksums
- Testes: `tests/pseo/test_export_no_leak.py` (4 passed)

### 2. Snapshot em `web-cfg/data/pseo/`

- `dataset_hash`: `5f334858d8cfe1dec53d11ccfca3694171acf9f64f51920a1da14dcbc9210ea5`
- `source_run_id`: `pseo-wave1-20260731`
- Contagens export: 11 931 contratos carregados; 908 classificados AEC; 5 arquétipos; 18 mercados; 7 órgãos; 9 preços; 18 concorrência; 15 radares; 5 pontes problema→serviço

### 3. Gerador estático + gates

- `npm run pseo:build|validate|audit|test`
- Fail-closed: checksum corrompido e snapshot expirado rejeitados
- `indexability_score` 0–100 com pesos da missão
- Diversidade (máx. por arquétipo) + similaridade textual
- Cap 24 indexáveis

### 4. Primeira onda (publish = 24)

Distribuição por tipo:

| Tipo | N |
|------|---|
| market | 8 |
| problem_service | 5 |
| radar | 4 |
| competition | 3 |
| agency | 2 |
| price | 2 |

`noindex` (preview): 48 — fora do sitemap de inteligência.  
Rejeitados hard: 0 nesta onda (gates amostrais atendidos; excesso virou noindex por cap/diversidade).

Registry: `data/pseo/registry.json` (`human_review: PENDING` em todas — sem aceite humano automático).

### 5. SEO + conversão

- Canonical absoluto, 1 H1, breadcrumbs + BreadcrumbList, Organization, Dataset/`isBasedOn` onde aplicável, OG
- `sitemap-inteligencia.xml` só indexáveis; referenciado em `robots.txt`
- CTAs contextuais + atribuição (`pseo_page_id`, `page_type`, `archetype`, `segment`, `region`, `agency_id`, `intent`, `source_run_id`, `dataset_hash`, `cta_position`, `origem`)
- Eventos `pseo_*` via `confengeTrack` sem PII
- Hubs: `/inteligencia/`, mercados, órgãos, preços, concorrência, cenários, `/radar/`

### 6. Testes e evidências

| Comando / prova | Resultado |
|-----------------|-----------|
| `npm run pseo:build` ×2 | OK, hash HTML idêntico (determinístico) |
| `npm run pseo:validate` | ok, 0 errors |
| `npm run pseo:audit` | ok (snapshot, validate, tracking, regressão 120 conteudos + 8 pilares + sitemap 133) |
| `npm run pseo:test` | 9 passed |
| Fail-closed checksum/idade | FAIL_CLOSED_OK / FAIL_CLOSED_EXPIRED_OK |
| `npm run test:analytics` | ANALYTICS_UNIT_OK |
| `validate_seo.py` | exit 0 (warnings boilerplate pré-existentes em guias; sem regressão estrutural dos pilares) |
| Playwright hub + 2 páginas | BROWSER_OK (200, HTML substancial, WA, sem score_total) |

## Arquétipos (derivados dos dados)

1. Pavimentação e infraestrutura viária  
2. Edificações públicas  
3. Saneamento e hidráulica  
4. Climatização e instalações prediais  
5. Manutenção predial e serviços de engenharia  

Metodologia registrada em `archetypes.json` / `icp_methodology.json` e `docs/pseo/`.

## Fontes e denominadores

- PNCP supplier contracts (agregados)
- PNCP raw bids (oportunidades)
- Entes SC (contexto de cobertura)
- Guias técnicos já publicados no site (pontes problema→serviço)

**Não é censo nacional.** Cobertura reflete ingestão do datalake (ênfase Sul/Sudeste/SC).

## Limitações

- Valores são de **contratos**, não preços unitários de serviço.
- Classificação de arquétipo por padrão textual pode multi-rotular objetos.
- Oportunidades não são tempo real; campo `as_of` / `generated_at`.
- Top 20 proprietário **não** é publicado; apenas calibra metodologia.
- Revisão humana da primeira onda ainda `PENDING`.

## Correções pós-revisão (skeptic)

1. **Malha de links:** `resolve_related_urls` remove hrefs para irmãos não gerados (preço/radar/concorrência ausentes); `pseo:validate` falha em links internos quebrados.
2. **Descriptions únicas:** templates de preço/concorrência/radar incluem segmento+região; validate exige uniqueness de meta description.
3. **Hubs sem score:** badge público mostra `tipo · indexável|preview (revisão)` — sem número de `indexability_score`.
4. **validate_seo.py:** exit 0 após rebuild (sem `ERR dup desc` nas páginas pSEO).

## Riscos residuais

1. Mediana contratual mal interpretada como preço de referência → mitigado por warning e copy.
2. Fornecedores em páginas de concorrência (nomes públicos PNCP) mal lidos como ranking de qualidade → language_note explícita.
3. Snapshot envelhecer no repo sem re-export → fail-closed por freshness (180d).
4. Canibalização leve entre mercado/preço/concorrência do mesmo slug → malha filtrada a páginas existentes + hubs; monitorar GSC.

## Próximos experimentos (ordem por impacto comercial)

1. Revisão humana do registry (publicar/ajustar noindex) e primeiros 5 contatos atribuídos.
2. Import GSC 30d por URL de inteligência → testar titles nos 5 piores CTR com impressões.
3. Re-export mensal do datalake + rebuild determinístico.
4. Expandir dossiês de órgãos só onde `contract_count` e valor sustentem score ≥80 **e** intenção de disputa.
5. Página problema→serviço adicional somente se novo padrão documental tiver denominador.

## Comandos reproduzíveis

```bash
# extra-cli
cd "/mnt/d/extra consultoria" && set -a && source .env && set +a
python -m scripts.pseo.export_web_cfg --out /mnt/d/webcfg/data/pseo --run-id pseo-wave1-20260731
python -m pytest tests/pseo -q

# web-cfg
cd /mnt/d/webcfg
npm run pseo:build
npm run pseo:validate
npm run pseo:audit
npm run pseo:test
npm run test:analytics
```

## Docs

- `docs/pseo/DATA-CONTRACT.md`
- `docs/pseo/ARCHITECTURE.md`
- `docs/pseo/LEARNING-LOOP.md`
