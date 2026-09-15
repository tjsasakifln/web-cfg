# Fragmento 13 → 99: ratificacao de contratos draft

- **target_path:** integration goal 97/99 contract ratification
- **operation:** ratify or migrate test-only draft IDs; fail closed on missing hash
- **stable_key:** `data/measurement/test-only-coordination-contracts.v1.json`
- **dependency:** campaigns 02/03/08 producers; this campaign is consumer of test-only IDs
- **test:** `node tests/measurement/test_multivertical_measurement_contract.mjs`
- **rollback:** keep draft IDs test-only; never promote them as runtime fallback

## IDs a ratificar

- `CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904`
- `CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904`
- `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`
- `NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904`
- `CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904`
- `MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904`
- `private_project_technical_readiness_v1`
- `private_project_technical_readiness_assessment`

Invariants: source `CONFENGE_WEB`, `outbound_eligible=false`, `auto_send=false`.
NO_MERGE, NO_DEPLOY, NO_SMTP nesta campanha.
