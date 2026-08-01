# Analytics event map

Provider default: `none` (dataLayer only).

| Event | Params (safe) |
| --- | --- |
| `offer_view` | page_path, offer_id, device_context |
| `offer_cta_click` | page_path, offer_id, cta_position, source_page_type |
| `diagnostic_cta_click` | page_path, cta_position |
| `critical_decision_cta_click` | page_path, cta_position |
| `qualification_stage_select` | stage_category (enum) |
| `qualification_urgency_select` | urgency_category (enum) |
| `comparison_view` | page_path |
| `lead_form_start` / `submit` / `success` / `error` | no PII |
| `whatsapp_click` | cta_position, content_cluster |

Never send: name, company, email, phone, free text, documents.
