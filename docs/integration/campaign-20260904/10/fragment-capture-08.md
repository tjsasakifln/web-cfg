# Fragment: adaptive capture (campaign 08)

- target_path: form runtime / payload / `#formulario-contato` field set
- operation: `consume` placeholder — campaign 10 does not edit form bytes (sha256 `0f49d7f5f23da5ecc2e58c282d0a57a3bd0d56aabdad678c53165ed85b5883a4`)
- stable_key: `CONFENGE_WEB_INTAKE/2.0.0-draft.20260904`
- dependency: campaign 08
- test: `test_form_runtime_bytes_untouched`
- rollback: form is unchanged; no rollback needed from this campaign
