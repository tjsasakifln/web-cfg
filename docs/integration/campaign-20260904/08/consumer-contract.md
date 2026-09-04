# Adaptive capture consumer contract (campaigns 09 / 10 / 11)

Do not clone the form. Embed the shared runtime:

- Form name: `diagnostico-confenge`
- Attributes: `data-adaptive-intake="true"` `data-success-mode="inline"` `data-receipt-required="true"` `data-ajax="true"`
- Endpoint: `POST /api/web/lead` with `Idempotency-Key`
- Hidden: `adaptive_intake=true`, `intake_contract_version`, `intake_pin_hash`, `offer_candidate_id`, `source_asset_id`, `landing_family`, `nucleus_id` (or visible select)
- Feature flag (server): `ADAPTIVE_INTAKE_NUCLEI` and `ADAPTIVE_INTAKE_PIN_JSON`
- Without pin or flag, new nuclei fail closed; B2G legacy remains.

Reference markup: `tests/fixtures/adaptive-intake/sandbox.html`.
Pure validator: `netlify/functions/lib/adaptive-intake.cjs` via `validateAndNormalize`.
