# pSEO Editorial Audit

- ok: **True**
- pages: 20
- publish fails: 0
- P0 issues: 70

| page_id | status | decision | P0 | P1 | recommendation |
|---|---|---|---:|---:|---|
| `market-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 1 | 2 | reject_or_noindex |
| `market-pavimentacao-infraestrutura-viaria-pi` | reject | pass | 1 | 2 | reject_or_noindex |
| `market-edificacoes-publicas-mg` | reject | pass | 1 | 2 | reject_or_noindex |
| `market-edificacoes-publicas-rs` | reject | pass | 1 | 2 | reject_or_noindex |
| `agency-88830609` | reject | pass | 3 | 3 | reject_or_noindex |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | reject | pass | 4 | 3 | reject_or_noindex |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | reject | pass | 1 | 3 | reject_or_noindex |
| `comp-manutencao-predial-engenharia-rs` | reject | pass | 1 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-pr` | reject | pass | 3 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 4 | 0 | reject_or_noindex |
| `radar-saneamento-hidraulica-sc` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-rs` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-sc` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-pr` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-rs` | reject | pass | 2 | 0 | reject_or_noindex |
| `prob-orcamento-edital` | reject | fail_soft | 9 | 2 | keep_noindex |
| `prob-sinapi-sicro` | reject | fail_soft | 8 | 2 | keep_noindex |
| `prob-medicao-glosa` | reject | fail_soft | 7 | 1 | keep_noindex |
| `prob-aditivos-margem` | reject | fail_soft | 8 | 1 | keep_noindex |
| `prob-reequilibrio` | reject | fail_soft | 8 | 2 | keep_noindex |

## market-pavimentacao-infraestrutura-viaria-sc
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier

## market-pavimentacao-infraestrutura-viaria-pi
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier

## market-edificacoes-publicas-mg
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier

## market-edificacoes-publicas-rs
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier

## agency-88830609
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_single_day_share>0.70
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem temporalCoverage
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem variableMeasured

## price-manutencao-predial-engenharia-rs-manutencao-predial
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `ingestion_prefix_name`: Nome de órgão com prefixo de ingestão
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: buyers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_buyer_share>0.60
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem temporalCoverage

## price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem identifier
- **P1** `dataset_missing_prop`: Dataset JSON-LD sem temporalCoverage

## comp-manutencao-predial-engenharia-rs
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3

## radar-edificacoes-publicas-pr
- **P0** `zero_for_missing_value`: R$ 0,00 usado (possível valor ausente)
- **P0** `data_quality_gate`: contract_url_as_opportunity=7
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-pavimentacao-infraestrutura-viaria-sc
- **P0** `table_duplicates`: Linhas duplicadas na tabela (2)
- **P0** `data_quality_gate`: duplicate_rate>0
- **P0** `data_quality_gate`: contract_url_as_opportunity=4
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-saneamento-hidraulica-sc
- **P0** `data_quality_gate`: contract_url_as_opportunity=2
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-pavimentacao-infraestrutura-viaria-rs
- **P0** `data_quality_gate`: contract_url_as_opportunity=2
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-edificacoes-publicas-sc
- **P0** `data_quality_gate`: contract_url_as_opportunity=2
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-pavimentacao-infraestrutura-viaria-pr
- **P0** `data_quality_gate`: contract_url_as_opportunity=4
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## radar-edificacoes-publicas-rs
- **P0** `data_quality_gate`: contract_url_as_opportunity=1
- **P0** `contract_link_as_opportunity`: Link de contrato em radar

## prob-orcamento-edital
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `meta_desc_truncated`: Meta description truncada no meio da frase/palavra
- **P1** `meta_desc_incomplete`: Meta description sem frase completa
- **P0** `claim_without_evidence`: no_direct_budget_edital_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P0** `empty_period`: Metodologia com período — a —
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-sinapi-sicro
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `meta_desc_incomplete`: Meta description sem frase completa
- **P0** `claim_without_evidence`: no_direct_sinapi_sicro_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P0** `empty_period`: Metodologia com período — a —
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-medicao-glosa
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P0** `empty_period`: Metodologia com período — a —
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-aditivos-margem
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `claim_without_evidence`: no_direct_aditivo_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P0** `empty_period`: Metodologia com período — a —
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-reequilibrio
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `service_path_visible`: Caminho de serviço no conteúdo
- **P1** `meta_desc_incomplete`: Meta description sem frase completa
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P1** `missing_accents`: Termo técnico sem acentuação editorial
- **P0** `empty_period`: Metodologia com período — a —
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem

