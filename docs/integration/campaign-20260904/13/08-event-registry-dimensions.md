# Fragmento 13 → 08: dimensoes de mensuracao

- **target_path:** `netlify/functions/lib/event-registry.json`
- **operation:** add envelope dimensions and observed-only events; do not fork a second registry
- **stable_key:** `CONFENGE_MULTIVERTICAL_MEASUREMENT/1.0.0-draft.20260904`
- **dependency:** campaign 13 semantic contract; campaign 08 owns runtime admit/minimize
- **test:** `npm run test:event-dictionary` plus campaign 13
  `node tests/measurement/test_multivertical_measurement_contract.mjs`
- **rollback:** keep current registry; semantic contract remains documentation-only

## Payload pedido

Envelope fields (closed enums, never free text):

- `source_landing_family`
- `source_asset`
- `nucleus_id`
- `offer_candidate`
- `city_service_area_class`
- `urgency`
- `decision_role`
- `why_now_class`
- `conflict_state_class`
- `qualification_state`
- `handoff` in `{accepted, rejected, unknown}`

Events:

- `triage_start` / `triage_complete` (engagement, web-cfg)
- `handoff_accepted` / `handoff_rejected` / `handoff_unknown` (lead, not QCO)
- `qco`, `proposal`, `won`, `lost`, `outcome_unknown`,
  `revenue_margin_aggregate_ref` remain `admission: observed_only` / Warmbly

Do not admit nome, e-mail, telefone, CPF/CNPJ, endereco, texto livre, processo,
empregado, documento, valor informado, motivo detalhado de conflito.

Client-side is not source of truth for QCO, proposal or revenue.
