# pSEO Editorial Audit

- ok: **True**
- pages: 19
- publish fails: 0
- P0 issues: 42

| page_id | status | decision | P0 | P1 | recommendation |
|---|---|---|---:|---:|---|
| `market-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 1 | 1 | reject_or_noindex |
| `market-pavimentacao-infraestrutura-viaria-pi` | reject | pass | 1 | 1 | reject_or_noindex |
| `market-edificacoes-publicas-mg` | reject | pass | 1 | 1 | reject_or_noindex |
| `market-edificacoes-publicas-rs` | reject | pass | 1 | 1 | reject_or_noindex |
| `agency-88830609` | reject | pass | 2 | 0 | reject_or_noindex |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | reject | pass | 4 | 0 | reject_or_noindex |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | reject | pass | 1 | 1 | reject_or_noindex |
| `comp-manutencao-predial-engenharia-rs` | reject | pass | 1 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-pr` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-pavimentacao-infraestrutura-viaria-sc` | noindex | fail_soft | 1 | 1 | keep_noindex |
| `radar-pavimentacao-infraestrutura-viaria-rs` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-saneamento-hidraulica-sc` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-pavimentacao-infraestrutura-viaria-pr` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-edificacoes-publicas-rs` | noindex | fail_soft | 1 | 1 | keep_noindex |
| `prob-orcamento-edital` | reject | fail_soft | 6 | 0 | keep_noindex |
| `prob-sinapi-sicro` | reject | fail_soft | 6 | 0 | keep_noindex |
| `prob-medicao-glosa` | reject | fail_soft | 5 | 0 | keep_noindex |
| `prob-aditivos-margem` | reject | fail_soft | 6 | 0 | keep_noindex |
| `prob-reequilibrio` | reject | fail_soft | 5 | 0 | keep_noindex |

## market-pavimentacao-infraestrutura-viaria-sc
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## market-pavimentacao-infraestrutura-viaria-pi
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## market-edificacoes-publicas-mg
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## market-edificacoes-publicas-rs
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## agency-88830609
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_single_day_share>0.70

## price-manutencao-predial-engenharia-rs-manutencao-predial
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: buyers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_buyer_share>0.60

## price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## comp-manutencao-predial-engenharia-rs
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3

## radar-pavimentacao-infraestrutura-viaria-sc
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## radar-edificacoes-publicas-rs
- **P0** `internal_slug_visible`: Slug/taxonomia interna no texto
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## prob-orcamento-edital
- **P0** `claim_without_evidence`: no_direct_budget_edital_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-sinapi-sicro
- **P0** `claim_without_evidence`: no_direct_sinapi_sicro_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-medicao-glosa
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-aditivos-margem
- **P0** `claim_without_evidence`: no_direct_aditivo_evidence
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-reequilibrio

## prob-reequilibrio
- **P0** `claim_without_evidence`: no_claim_specific_evidence
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-orcamento-edital
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-sinapi-sicro
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-medicao-glosa
- **P0** `generic_repeated_blocks`: Blocos genéricos repetidos com prob-aditivos-margem

