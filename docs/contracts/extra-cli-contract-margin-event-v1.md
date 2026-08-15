# CONTRACT_MARGIN_EVENT — web-cfg consumer contract

Version: `v1.0.0`  
Status: consumer-defined; producer family not yet emitted by extra-cli `public_read_v1`  
Owner (truth): extra-cli  
Owner (public render): web-cfg / confenge.com.br  
Mode: SELECT-only. No browser credentials. No second DataLake.

## Decision

EXECUTE_NOW as a **consumer contract**. web-cfg projects existing extra-cli
versioned public exports into this shape. Missing producer fields stay
`UNKNOWN`. They are never invented.

## Producer families consumed

| Family | Version | What it supplies today |
|---|---|---|
| `public_read_v1.contracts` | `v1.0.0` | `event_id`, `process_key`, `status_code`, `title`, `contract_value`, `official_number`, `as_of`, `source_updated_at`, `completeness`, `reason_codes`, `source`, `source_uri`, `provenance` |
| extra-cli pSEO export | `1.1.0` | construction-relevant public items already vendored in `data/pseo/` (`pncp_id`, `objeto`, `orgao_nome`, `valor_estimado`, official PNCP URL, `as_of`, `verified_at`, freshness) |
| extra-cli `#310` `national_contract_truth.contract_events` | closed ingestion core | event families `aditivo`, `apostilamento`, `prorrogacao`, `suspensao`, `rescisao`, `cancelamento` — **not** in `public_read_v1` |

`public_read_v1` does **not** expose anniversary, vigência dates, aditivos,
reajuste/reequilíbrio, medições or payments. Those fields are reserved in this
contract and render as `UNKNOWN` until the producer emits them.

## Record shape (consumer)

```text
CONTRACT_MARGIN_RECORD v1
  public_id            text   required   public process / official number
  process_key          text   nullable
  official_number      text   nullable
  title                text   nullable
  status_code          text   nullable
  contract_value       number nullable   signed/global value only
  estimated_value      number nullable   must not be presented as signed value
  vigencia_start       date   nullable
  vigencia_end         date   nullable
  data_assinatura      date   nullable
  organ.{display_name, tax_identifier_export, entity_type}
  supplier.{display_name, tax_identifier_export, entity_type}
  source, source_uri, as_of, source_updated_at, completeness, reason_codes
  provenance           object required   observation/export lineage
  margin_events[]      CONTRACT_MARGIN_EVENT
```

```text
CONTRACT_MARGIN_EVENT v1
  family          one of:
                    aditivo | apostilamento | prorrogacao | suspensao |
                    rescisao | cancelamento | reajuste | reequilibrio |
                    medicao | pagamento
  classification  OFFICIAL | DERIVED | INFERRED | UNKNOWN
  effective_at    datetime nullable
  published_at    datetime nullable
  value_delta     number nullable
  term_delta_days integer nullable
  source          text
  source_uri      text nullable
  source_event_id text nullable
  as_of           date
  provenance      object
  confidence      number nullable
```

## Classification rules (fail-closed)

1. A fact is `OFFICIAL` only when the producer row carries the field plus
   `source` / `provenance` / `as_of`.
2. `DERIVED` is allowed only for deterministic calendar arithmetic from an
   official date (example: aniversário = month-day of `data_assinatura` or
   `vigencia_start`). The derived item must name its inputs.
3. `INFERRED` is allowed only when the producer documents the inference. web-cfg
   does not add new inferences.
4. Absence is `UNKNOWN`. Absence is not evidence of no aditivo, no reajuste or
   no medição.
5. `valor_estimado` is never rendered as valor contratual assinado.
6. `CONTRACT_MARGIN_EVENT` rows are never mixed into the official identity
   block. Events keep their own classification.
7. Forbidden public language: “pode ter direito”, crédito, tese jurídica,
   parecer vinculante, recuperação garantida.

## Compatibility

Additive nullable fields are compatible within `v1`. Removing or renaming a
field, or promoting `UNKNOWN` to a legal conclusion, requires `v2`.

## Snapshot location

`data/extra-cli/public-read-v1/contracts-margin-snapshot.json`

This file is a versioned SELECT-only projection. It is not a crawler cache.

## Producer-block diagnosis

`scripts/money_asset/indexability.py` writes `data/organic/money-asset-producer-block.json` whenever the shipped gate fails `low_data_confidence`. The diagnosis is computed by `diagnoseProducerBlock` in `assets/js/diagnose-margin.cjs` from the live snapshot — it does not invent facts.

Blocking official fields on the current projection (`public_read_v1@v1.0.0` + `pseo-export@1.1.0`):

- `vigencia_start` / `vigencia_end` — not emitted by `public_read_v1.contracts`
- `data_assinatura` — not emitted; required to derive aniversário
- `contract_value` — column exists on the producer view but this snapshot has null (signed value not in the pSEO projection)

Reserved `CONTRACT_MARGIN_EVENT` families (aditivo, apostilamento, prorrogação, reajuste, reequilíbrio, medição, pagamento) stay UNKNOWN until extra-cli emits them. They are not required to clear the 0.45 data-confidence floor. Filling vigência + signed `contract_value` on a versioned public-read export is enough for the existing consumer and gate to flip indexable without relaxing epistemology.
