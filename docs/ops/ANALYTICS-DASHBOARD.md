# Dashboard operacional mínimo (definições)

## Fontes

1. **Coletor 1ª parte** `POST/GET /.netlify/functions/collect` — eventos sem PII.
2. **Campos no lead persistido** — UTMs, landing, journey, referrer (não vão ao analytics como PII).
3. **Opcional** Plausible/GA4 quando `PLAUSIBLE_*` ou gtag configurados.

## Conversões distintas (não contar clique decorativo como lead)

| Conversão | Evento | Critério |
| --- | --- | --- |
| Lead persistido | `lead_persisted` + API 201 | protocolo retornado |
| WhatsApp qualificado | `whatsapp_click` com journey/cluster | clique em CTA com mensagem contextual |
| E-mail | `email_click` | mailto ou copiar e-mail |
| Envio edital | form success journey=`edital` | lead_id |
| Problema contratual | form success journey=`contrato` | lead_id |
| Diagnóstico B2G | form success journey=`operacao` | lead_id |

Closed-loop fixture report (visit → qualified opportunity → revenue): [docs/revops/CLOSED-LOOP.md](../revops/CLOSED-LOOP.md). Production qualified/proposal/won stay Warmbly-observed; the CI report never reads production.

## Métricas do painel

- sessões, origem (utm_source/medium/campaign), landing pages
- CTR de CTA (cta_click / cta_view quando instrumentado)
- início formulário, conclusão, abandono por etapa (step 1→2 sem submit)
- conversão por jornada e por página
- leads por origem / cluster / campanha (store)
- falhas técnicas (`lead_form_backend_error`, 5xx)
- tempo até atendimento (ops — first_touch_at manual/CRM)
- proporção formulário × WhatsApp × e-mail

## Prova em produção

```bash
# health
curl -sS https://confenge.com.br/.netlify/functions/collect
# synthetic event (no PII)
curl -sS -X POST https://confenge.com.br/.netlify/functions/collect \
  -H 'Content-Type: application/json' -H 'Origin: https://confenge.com.br' \
  -d '{"events":[{"event":"page_view","path":"/","props":{"content_cluster":"home"}}]}'
```
