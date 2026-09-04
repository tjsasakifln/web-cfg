# Fragment: offer catalog

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: owner of `CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904` (campaign 03 / #583)
- operation: `insert_offer_candidate`
- stable_key: `private_project_technical_readiness_assessment`
- dependency: taxonomy nucleus `building_engineering_documentation`; intake `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`
- test: catalog conformance fixture must pin version+hash; missing hash fails closed
- rollback: remove the offer by stable_key; do not leave a second authority copy in web-cfg

```json
{
  "offer_id": "private_project_technical_readiness_assessment",
  "name": "Avaliação de prontidão técnica de obra privada",
  "nucleus": "building_engineering_documentation",
  "source_asset_id": "private_project_technical_readiness_v1",
  "source": "CONFENGE_WEB",
  "outbound_eligible": false,
  "auto_send": false,
  "unit": "uma obra / um recorte documental declarado",
  "not": [
    "laudo",
    "auditoria concluída",
    "certificação",
    "parecer de direito",
    "validação de ART"
  ]
}
```
