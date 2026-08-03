# Full Datalake Utilization Proof

**Status:** `FULL_DATALAKE_UTILIZED`  
**Generated:** 2026-08-03T01:38:46Z  
**Run ID:** `full-proof-20260803T012518Z-f532a5a2`  
**Source commit:** `75b4165f5b864362d3e697d2020ed707126beb64`  
**Host:** vps-national-tunnel  

## Contracts read

| Metric | Value |
|--------|------:|
| contracts_read (stream) | **4,479,442** |
| SQL available | 4,479,442 |
| SQL considered (valor>0) | 4,402,632 |
| stream == available | True |
| min date | 2023-07-20 |
| max date | 2026-07-31 |
| UFs distinct | 27 |
| dataset_hash | `50f92b7c7f23678a7a46a211de8b9a4efc3028494c7a25d19ac0f7cb35ccf32a` |

## Runtime / memory

- Duration: 740.601 s
- Batches: 896 × 5000
- Peak RSS: 73.69 MiB
- Isolation: REPEATABLE READ
- fetchall used: False
- fixture used: False

## Value band distribution

- `ate_100k`: 3,847,667
- `100k_500k`: 345,816
- `1m_5m`: 92,344
- `500k_1m`: 79,581
- `sem_valor_ou_zero`: 76,810
- `5m_20m`: 25,799
- `acima_20m`: 11,425

## Top UFs

- SC: 1,192,919
- SP: 820,772
- MG: 366,775
- RS: 331,897
- GO: 316,579
- PR: 233,453
- BA: 207,220
- CE: 193,823
- RJ: 132,239
- DF: 98,385
- PE: 75,090
- PB: 67,489
- ES: 61,741
- PA: 52,622
- MA: 51,858

## Classification (scan)

```json
{
  "n_classified": 111986,
  "classify_every": 40,
  "max_classify": null,
  "by_label": {
    "insufficient_context": 49986,
    "non_aec": 53038,
    "ambiguous": 5242,
    "aec_confirmed": 3251,
    "aec_probable": 469
  },
  "by_archetype": {
    "servicos-tecnicos-fase-preparatoria": 1973,
    "pavimentacao-infraestrutura-viaria": 583,
    "saneamento-hidraulica": 146,
    "manutencao-predial-engenharia": 160,
    "edificacoes-publicas": 501,
    "estruturas-contencoes-obras-especiais": 56,
    "climatizacao-instalacoes": 134,
    "reformas-ampliacoes": 119,
    "gestao-fiscalizacao-contratos-publicos": 17,
    "projetos-fiscalizacao-supervisao": 20
  },
  "aec_confirmed": {
    "raw_count_in_sample": 3251,
    "note": "Subsampled classification; see aec_keyword_prefilter for scale proxy"
  }
}
```

## Discards

```json
{
  "reasons": {
    "classifier_non_aec": 53038,
    "valor_null_or_lte_0": 76810
  },
  "total_discard_events": 129848,
  "note": "Discard events are multi-label (a row can match more than one reason)"
}
```

## Limitations

- Municipio/orgao/fornecedor unique sets are memory-capped; counts are lower bounds when cap hit.
- Keyword AEC prefilter is not gold classification.
- Values are nominal; no deflation.
- No commercial Top-20 or private scores included.
