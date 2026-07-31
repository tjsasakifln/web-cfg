# pSEO Editorial Audit

- ok: **True**
- pages: 19
- publish fails: 0
- P0 issues: 6

| page_id | status | decision | P0 | P1 | recommendation |
|---|---|---|---:|---:|---|
| `market-pavimentacao-infraestrutura-viaria-sc` | reject | pass | 0 | 0 | reject_or_noindex |
| `market-pavimentacao-infraestrutura-viaria-pi` | reject | pass | 0 | 1 | reject_or_noindex |
| `market-edificacoes-publicas-mg` | reject | pass | 0 | 0 | reject_or_noindex |
| `market-edificacoes-publicas-rs` | reject | pass | 0 | 0 | reject_or_noindex |
| `agency-88830609` | reject | pass | 2 | 0 | reject_or_noindex |
| `price-manutencao-predial-engenharia-rs-manutencao-predial` | reject | pass | 3 | 0 | reject_or_noindex |
| `price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo` | reject | pass | 0 | 1 | reject_or_noindex |
| `comp-manutencao-predial-engenharia-rs` | reject | pass | 1 | 0 | reject_or_noindex |
| `radar-edificacoes-publicas-pr` | publish | pass | 0 | 0 | eligible_for_human_review |
| `radar-pavimentacao-infraestrutura-viaria-sc` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-pavimentacao-infraestrutura-viaria-rs` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-saneamento-hidraulica-sc` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-pavimentacao-infraestrutura-viaria-pr` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `radar-edificacoes-publicas-rs` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-orcamento-edital` | publish | pass | 0 | 0 | eligible_for_human_review |
| `prob-sinapi-sicro` | publish | pass | 0 | 0 | eligible_for_human_review |
| `prob-medicao-glosa` | noindex | pass | 0 | 0 | eligible_for_human_review |
| `prob-aditivos-margem` | publish | pass | 0 | 0 | eligible_for_human_review |
| `prob-reequilibrio` | noindex | pass | 0 | 0 | eligible_for_human_review |

## market-pavimentacao-infraestrutura-viaria-pi
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## agency-88830609
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_single_day_share>0.70

## price-manutencao-predial-engenharia-rs-manutencao-predial
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: buyers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: max_buyer_share>0.60

## price-pavimentacao-infraestrutura-viaria-pi-paralelepipedo
- **P1** `missing_accents`: Termo técnico sem acentuação editorial

## comp-manutencao-predial-engenharia-rs
- **P0** `sample_concentration`: Amostra concentrada/insuficiente: suppliers<3

