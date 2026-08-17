# Funnel analytics (no PII)

## Events

| Event | When | Safe params |
| --- | --- | --- |
| `service_page_view` | Offer/service page load | page_path, offer_id, journey, device_context |
| `offer_view` | Offer page with data-offer-id | offer_id |
| `cta_click` (aliases: `diagnostic_cta_click` / `offer_cta_click` / `critical_decision_cta_click`) | Named CTA click | cta_position, journey, cta_label (≤80), cta_kind |
| `whatsapp_click` | wa.me link | cta_position, journey, destination_type |
| `email_click` | mailto: link | cta_position, destination_type |
| `lead_form_start` | First focus on form control | journey |
| `lead_form_step` | Multi-step advance/back | form_step, journey, stage_category |
| `qualification_stage_select` | Need-type select change | stage_category, journey |
| `qualification_urgency_select` | Urgency select change | urgency_category, journey |
| `lead_form_error` | Validation failure | form_step |
| `lead_form_submit` | Valid submit | journey, stage_category, urgency_category |
| `lead_form_success` | Confirmation page | journey |
| `pseo_table_interaction` / `pseo_source_open` / `pseo_related_page_click` | Intelligence/radar surfaces | pseo_page_id, page_type, dataset_hash, … |
| `pseo_whatsapp_click` / `pseo_form_start` / `pseo_form_submit` / `pseo_cta_click` / `pseo_to_service` | Aliases rewritten to `whatsapp_click` / `lead_form_start` / `lead_form_submit` / `cta_click` / `content_to_service` | same layer; not a second count |

## Attribution preserved (hidden fields / session)

- utm_source, utm_medium, utm_campaign
- landing_page, origem / origin_url
- jornada
- pSEO: pseo_page_id, page_type, archetype, segment, region, intent, source_run_id, dataset_hash

## Explicitly never sent

Field names: nome, email, telefone, mensagem, empresa, document content.  
Values matching email or long phone patterns. Strings longer than 180 chars.

## Automated checks

- `npm run test:analytics` — track() strips PII keys and patterns
- `npm run test:form-funnel` — multi-step markup + event names + confirmation pages
- `npm run test:pseo-attribution` — UTM/pSEO survival into form hiddens

## Journeys → confirmation

| Journey | stage / need | Form action |
| --- | --- | --- |
| A contrato | problema urgente em contrato | `/obrigado-contrato` |
| B edital | edital ou proposta em preparação | `/obrigado-edital` |
| C operacao | estruturando a operação B2G | `/obrigado-operacao` |
