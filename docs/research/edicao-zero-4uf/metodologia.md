# Metodologia

## Fonte

- Snapshot versionado `data/pseo/` (não o datalake).
- `dataset_hash`: `0d8757f7cda3a6770aefaea9b8732574fa7bae5265b5f446abcfd0a6562d7b30`
- `data_as_of`: `2026-07-31`
- `generated_at`: `2026-08-02T03:24:33Z`
- Produtor: `python -m scripts.pseo.export_web_cfg` `1.1.0`
- extra-cli commit: `704975a7bcdd43d4dc6769fbf6c14726327ab37b`
- run: `pseo-20260802T032433Z-47e7e07c`
- Tabelas de origem do export: pncp_supplier_contracts, pncp_raw_bids, sc_public_entities

`public_read_v1` extra-cli **não** foi consultado. Não há export local dessa
família. O contrato em extra-cli `docs/contracts/public-read-v1.md` foi lido
só como documentação.

A pasta `data/pseo/snapshots/pre-national-2026-07-31/` tem
`dataset_hash` distinto (`137528d496ee56786a05fdf93ab403be6a055807caedad5c69229e305752f12b`).
Esta edição usa o snapshot vivo cujo hash está no `manifest.json` atual.

## Passos

- Consumir somente o snapshot versionado em data/pseo (checksums do manifest).
- Não copiar datalake; não executar crawler; não consultar public_read_v1 ao vivo.
- Restringir findings aos 4 mercados publicados + fatia de agência/concorrência.
- Tratar national-candidate-inventory como lacuna de cobertura, não como fato publicado.
- Responder pergunta só com proveniência completa; senão marcar unsupported.
- Rodar revisão adversarial e o claim-language gate antes de gravar o pack.

## Semântica de valor

Valores são contrato integral nominal em BRL. Não são preço unitário, preço praticado nacional, nem valor deflacionado.

## Deduplicação

O exportador atribui um arquétipo primário por contrato. Este pack não re-deduplica linhas brutas; não há microdados no snapshot.

## Proveniência por pergunta

| ID | Tema | Status | Source | Denominator |
| --- | --- | --- | --- | --- |
| Q1 | volume_valor | answered | data/pseo/markets.json + data/pseo/manifest.json | published markets in markets.json (not aec_confirmed universe, not raw PNCP load) |
| Q2 | compradores | answered | data/pseo/markets.json | distinct buyer identifiers counted by the exporter per market cell |
| Q3 | fornecedores | answered | data/pseo/markets.json + data/pseo/competition.json | distinct supplier identifiers counted per published market cell |
| Q4 | concentracao | partial | data/pseo/agencies.json + data/pseo/competition.json | contracts in the single published agency/competition slice |
| Q5 | regional | answered | data/pseo/markets.json | the 4 published market cells |
| Q6 | categorias | answered | data/pseo/archetypes.json + data/pseo/markets.json | evidence_contract_count of each archetype object; published markets are a subset |
| Q7 | tamanho_tipico | answered | data/pseo/prices.json | contracts in the price cell with valor_total >= 5000 BRL |
| Q8 | evolucao | unsupported | data/pseo/markets.json value_by_year | n/a — pergunta não sustentada neste snapshot |

### Campos obrigatórios de cada métrica respondida

`source`, `snapshot_hash`, `as_of`, `cutoff`, `denominator`, `filters`,
`dedup_logic`, `value_semantics`, `exclusions`, `limitation`.

## Limitações do snapshot

- Export is aggregated and sanitized; no commercial pipeline fields.
- Datalake coverage is incomplete relative to the national universe.
- Do not interpret medians as unit prices.
- Only aec_confirmed records feed market/price/competition aggregates.
- Open opportunities require data_encerramento >= data_as_of and compatible status.
- Freshness uses record dates, not only generated_at.

## Cobertura

- UFs publicadas: MG, PI, RS, SC (4)
- Mercados publicados: 4
- `national_universe_complete`: `False`
- `national_denominator`: `None`
- aec_confirmed no snapshot: 233
- contratos carregados: 11931
- Nota do manifest: Datalake coverage is incomplete relative to the national universe.

Inventário-candidato (mesmo `dataset_hash`, **não** usado como fato publicado):
{
  "present": true,
  "dataset_hash": "0d8757f7cda3a6770aefaea9b8732574fa7bae5265b5f446abcfd0a6562d7b30",
  "generated_at": "2026-08-01T04:00:55Z",
  "n_candidates": 2049,
  "national_records_available": 4479442,
  "aec_confirmed_contracts_in_inventory": 54055,
  "why_excluded": "Inventário-candidato (QUALITY_ELIGIBLE / human_review PENDING). Não passou pelo recorte público de markets.json. Serve só como evidência de lacuna de cobertura, não como finding."
}
