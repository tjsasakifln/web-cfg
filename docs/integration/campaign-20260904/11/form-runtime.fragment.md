# Fragment: form runtime / adaptive capture

- `target_path`: form runtime owned by #580 (campaign 08). Exact file is the adaptive capture module, not `js/` edits from this campaign.
- `operation`: `accept_query_attribution`
- `stable_key`: `landing_family=grande-florianopolis-hub`
- `depends_on`: `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`; Warmbly lane `CONFENGE_WEB`; `outbound_eligible=false`; `auto_send=false`
- `teste`: submit with query `source=CONFENGE_WEB&landing_family=grande-florianopolis-hub&service_area=grande-florianopolis&nucleus_id=expert_evidence_assistance` produces a receipt with those fields and **no** PII in analytics URLs. Reject payloads that attach files, CPF, lawsuit corpus, employee lists or medical records on the first step.
- `rollback`: ignore unknown query keys; keep the current B2G form as fallback without losing receipts.

## Query keys this hub already emits

- `source=CONFENGE_WEB`
- `landing_family=grande-florianopolis-hub`
- `service_area=grande-florianopolis`
- `nucleus_id` in `{expert_evidence_assistance, property_valuation, building_engineering_documentation, occupational_safety, public_works_b2g}`

Do not mint a second form on the hub.
