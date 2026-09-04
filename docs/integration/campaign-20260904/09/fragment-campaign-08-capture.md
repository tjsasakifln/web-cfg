# Fragment: campaign 08 capture / triage

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: adaptive multivertical capture component owned by campaign 08
- operation: `bind_source_context`
- stable_key: `private_project_technical_readiness_v1`
- dependency: `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`, `NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904`, `CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904`, `MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904`
- test: payload fixture without PII; `outbound_eligible=false`; `auto_send=false`; result remains visible if the form is absent
- rollback: unbind the source_asset_id; the diagnostic page must keep delivering the full result

Context to load after the result, never before:

```json
{
  "source": "CONFENGE_WEB",
  "source_asset_id": "private_project_technical_readiness_v1",
  "nucleus": "building_engineering_documentation",
  "offer_candidate": "private_project_technical_readiness_assessment",
  "outbound_eligible": false,
  "auto_send": false
}
```

Não usar “fale com especialista” como CTA universal. O CTA nomeia o artefato que fecha a lacuna. Contato não é condição para ver o resultado.
