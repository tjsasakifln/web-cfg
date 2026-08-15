# SLO mínimo e monitoramento

## SLOs

| Indicador | Meta | Medição |
| --- | --- | --- |
| Disponibilidade homepage | ≥ 99,5% mensal | HTTP 200 sintético 5 min |
| Latência lead p95 | ≤ 3 s | Função Netlify |
| Taxa sucesso captura (valid lead → 201) | ≥ 99% | logs função |
| Taxa sucesso persistência | 100% dos 201 | contrato da API |
| Taxa entrega notify (quando configurado) | ≥ 95% | delivery.status |
| Taxa entrega e-mail (quando configurado) | ≥ 95% | Resend dashboard |
| Handoff inbound (quando URL+secret) | pending → delivered; DEAD/BLOCKED alertáveis | `ops?action=inbound_handoff` |
| Tempo detecção incidente site | ≤ 15 min | alerta uptime |
| Tempo resposta incidente P1 | ≤ 4 h úteis | processo ops |

## Monitoramento

1. **Uptime externo** (Better Stack / Checkly / UptimeRobot — owner):  
   - `https://confenge.com.br/`  
   - `https://confenge.com.br/sitemap-index.xml`  
   - `https://confenge.com.br/robots.txt`  
   - `https://confenge.com.br/.well-known/build-info.json`  
   - `GET https://confenge.com.br/.netlify/functions/collect` → 200
2. **Probe sintético de lead** (sem PII real): POST com nome `SYNTHETIC-PROBE`, e-mail `probe@example.com`, header `X-Confenge-Probe: $LEAD_PROBE_SECRET`, consentimento on — esperar 201 + lead_id; depois eliminar registro.
3. **Certificado / domínio**: alerta 30 dias antes (monitor DNS/TLS).
4. **Headers / indexabilidade**: job semanal `npm run test:redirects:prod` + smoke SEO.
5. **Alertas**: e-mail ops separado do canal de leads; não usar apenas ntfy de lead.

## Dashboard analytics mínimo

Métricas no coletor 1ª parte + dataLayer:

- sessões (`session_start`), page_views  
- origem/UTM (props em eventos + campos no lead)  
- landing pages  
- CTA view/click, whatsapp_click, email_click  
- lead_form_start / step / error / submit / success / backend_error  
- lead_persisted, confirmation_view  
- conversões por journey  

Export: buffer recente GET collect (contagem) + Blobs `confenge-analytics/events/YYYY-MM-DD/*` quando disponível.
