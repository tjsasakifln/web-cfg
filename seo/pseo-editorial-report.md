# pSEO Editorial Audit

- ok: **True**
- pages: 23
- publish fails: 0
- P0 issues: 30

| page_id | status | decision | P0 | P1 | recommendation |
|---|---|---|---:|---:|---|
| `market-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 0 | 0 | reject_or_noindex |
| `market-pavimentacao-infraestrutura-viaria-pi` | reject | pass | 0 | 0 | reject_or_noindex |
| `market-edificacoes-publicas-mg` | reject | pass | 0 | 0 | reject_or_noindex |
| `market-edificacoes-publicas-rs` | reject | pass | 0 | 0 | reject_or_noindex |
| `agency-88830609` | reject | pass | 2 | 0 | reject_or_noindex |
| `price-manutencao-predial-engenharia-rs` | reject | pass | 4 | 0 | reject_or_noindex |
| `price-edificacoes-publicas-mg` | reject | pass | 2 | 1 | reject_or_noindex |
| `price-pavimentacao-infraestrutura-viaria-pi` | reject | pass | 1 | 1 | reject_or_noindex |
| `price-edificacoes-publicas-rs` | reject | pass | 2 | 1 | reject_or_noindex |
| `price-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 1 | 0 | reject_or_noindex |
| `comp-manutencao-predial-engenharia-rs` | reject | pass | 1 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-pr` | reject | pass | 3 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 4 | 0 | reject_or_noindex |
| `radar-saneamento-hidraulica-sc` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-rs` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-sc` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-pavimentacao-infraestrutura-viaria-pr` | reject | pass | 2 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-rs` | reject | pass | 2 | 0 | reject_or_noindex |
| `prob-orcamento-edital` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-sinapi-sicro` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-medicao-glosa` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-aditivos-margem` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-reequilibrio` | noindex | pass | 0 | 0 | eligible_for_human_review |

## agency-88830609
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_single_day_share>0.70

## price-manutencao-predial-engenharia-rs
- **P0** `ingestion_prefix_name`: Nome de órgão com prefixo de ingestão
- **P0** `internal_language_public`: Linguagem interna de governança/pipeline no HTML público
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: buyers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_buyer_share>0.60

## price-edificacoes-publicas-mg
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `internal_language_public`: Linguagem interna de governança/pipeline no HTML público
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## price-pavimentacao-infraestrutura-viaria-pi
- **P0** `internal_language_public`: Linguagem interna de governança/pipeline no HTML público
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## price-edificacoes-publicas-rs
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `internal_language_public`: Linguagem interna de governança/pipeline no HTML público
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## price-pavimentacao-infraestrutura-viaria-sc
- **P0** `internal_language_public`: Linguagem interna de governança/pipeline no HTML público

## comp-manutencao-predial-engenharia-rs
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3

## radar-edificacoes-publicas-pr
- **P0** `data_quality_gate`: duplicate_rate>0
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

