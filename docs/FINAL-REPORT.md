# FINAL REPORT — CONFENGE production conversion remediation

Date (UTC): 2026-08-02T13:57:59Z  
Production: https://confenge.com.br  
Published commit (build-info): `247a7d2517e1f5c371070a9c0c331635add5d153`  
Environment: `production`  
Build time: `2026-08-02T13:53:01Z`  
Repo tip: see `git rev-parse HEAD` after evidence commit

This report claims only what is backed by files under `docs/evidence/` or live HTTP checks.

---

## 1. Deploy identity

| Field | Value |
| --- | --- |
| Endpoint | https://confenge.com.br/.well-known/build-info.json |
| commit | `247a7d2517e1f5c371070a9c0c331635add5d153` |
| environment | `production` |
| build_time | `2026-08-02T13:53:01Z` |

Evidence: live endpoint; smoke log `docs/evidence/section-20-smoke.txt`.

---

## 2. Before versus after

| Surface | Before (baseline main `90cebc45`) | After (production) |
| --- | --- | --- |
| Hero category | “Diretoria B2G fracionada” as primary label | “Consultoria para licitações e contratos de obras públicas” first |
| CTAs | Single “Diagnosticar operação B2G” | Three journeys: documentos / edital / diagnóstico |
| Form | All fields required up front | Step 1: nome + WhatsApp/email + tipo; step 2 optional |
| Lead backend | Netlify Forms HTML POST (404 in practice) | `POST /.netlify/functions/lead` + ntfy delivery |
| Confirmations | `/obrigado` only | `/obrigado-contrato`, `/obrigado-edital`, `/obrigado-operacao` |
| Thin content | Indexable template pages | 97 `noindex,follow`; removed from sitemap |
| Release identity | git clean/smudge PLACEHOLDER | `build-info.json` from deploy env |
| `/.well-known/build-info.json` | 404 | 200 with commit |

---

## 3. Three journeys (map)

| Code | Buyer need | Primary CTA | Entry | Confirmation | WhatsApp |
| --- | --- | --- | --- | --- | --- |
| A | Contrato sob pressão | Enviar documentos para análise inicial | `/#jornada-contrato`, `/defesa-margem-contratos-publicos/` | `/obrigado-contrato` | Contextual prefill |
| B | Edital / proposta | Enviar edital para triagem | `/#jornada-edital`, `/bid-room-licitacoes-obras/` | `/obrigado-edital` | Contextual prefill |
| C | Operação B2G recorrente | Diagnosticar a operação B2G | `/#jornada-operacao`, `/diretoria-b2g/` | `/obrigado-operacao` | Contextual prefill |

Document upload: not on the static form; confirmation pages direct secure handoff via WhatsApp.

---

## 4. Production lead delivery (real submissions)

Endpoint: `https://confenge.com.br/.netlify/functions/lead`  
Evidence: `docs/evidence/lead-delivery-verification.json`

| Journey | receipt_id | ntfy message_id | external poll match |
| --- | --- | --- | --- |
| contrato | `515106b8202de7c3c8c806fe` | `Cpx9KeEkW1A6` | yes |
| edital | `efb5d6a66aab08d9edd45566` | `ZSkKzCw5hwcT` | yes |
| operacao | `c37294d9e2f30c00d01738bb` | `966NRmzQwfgT` | yes |

`all_delivered`: **true** (function receipt + ntfy publish + poll-back contains receipt_id).

FormSubmit email path: **PENDING** (HTTP 403 until owner activates activation email for `tiago.sasaki@confenge.com.br`). Not claimed as working email delivery.

---

## 5. URLs and HTTP (external)

| URL | Expected | Observed |
| --- | --- | --- |
| `/` | 200 | 200 |
| `/diretoria-b2g/` | 200 | 200 |
| `/bid-room-licitacoes-obras/` | 200 | 200 |
| `/defesa-margem-contratos-publicos/` | 200 | 200 |
| `/diagnostico-b2g-360/` | 200 | 200 |
| `/obrigado-contrato` | 200 | 200 |
| `/obrigado-edital` | 200 | 200 |
| `/obrigado-operacao` | 200 | 200 |
| `/contato` | 301 → `/#contato` | 301 then 200 |
| `/blog` | 301 → `/conteudos/` | 301 then 200 |
| `/sitemap.xml` | 200 | 200 |
| `/robots.txt` | 200 | 200 |
| `POST /.netlify/functions/lead` | 200 + receipt | 200 |

Evidence: `docs/evidence/section-20-smoke.txt`, delivery verification JSON.

---

## 6. Screenshots (desktop + mobile widths)

Directory: `docs/evidence/screenshots/`  
Widths: 320, 360, 390, 768, 1024, 1440, 1920  
Surfaces: home, journey-a, journey-b, journey-c, form  
Shots: 35  
Horizontal overflow count: 0

Manifest: `docs/evidence/screenshots/manifest.json`

---

## 7. Lighthouse lab (production, mobile)

Evidence: `docs/evidence/lighthouse/summary.json` + full JSON per page.

| Path | Perf | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 99 | 100 | 100 | 100 | 1.63s | 0 | 79ms |
| `/defesa-margem-contratos-publicos/` | 100 | 100 | 100 | 100 | 1.46s | 0 | 20ms |
| `/bid-room-licitacoes-obras/` | 100 | 100 | 100 | 100 | 1.37s | 0 | 0ms |
| `/diretoria-b2g/` | 100 | 100 | 100 | 100 | 1.43s | 0 | 8ms |

Full reports: `docs/evidence/lighthouse/home.json`, `journey-a-defesa.json`, `journey-b-bid-room.json`, `journey-c-diretoria.json`.

Field Core Web Vitals: **PENDING_FIELD_DATA** (no CrUX claim).

---

## 8. Axe (production, WCAG 2.2 AA tags)

Evidence: `docs/evidence/axe/summary.json` + per-page JSON.

| Page | Violations | Critical/Serious |
| --- | --- | --- |
| `home` | 0 | 0 |
| `journey-a` | 0 | 0 |
| `journey-b` | 0 | 0 |
| `journey-c` | 0 | 0 |

---

## 9. Content disposition

Evidence: `docs/evidence/content-disposition-verified.md` + `.json`

| Disposition | Count (library) |
| --- | --- |
| manter (indexable) | 23 |
| noindex | 97 |

Commercial surfaces rewritten for three journeys (homepage + four offers).  
pSEO leaves remain under editorial containment (gate rejects weak pages).

---

## 10. Analytics (no PII)

Automated output: `docs/evidence/analytics-no-pii-result.txt`

```
ANALYTICS_UNIT_OK {"last":{"event":"whatsapp_click","page_path":"/x","cta_label":"ok"},"submit":{"event":"lead_form_submit","page_path":"/","journey":"contrato","stage_category":"problema urgente em contrato"}}
FORM_FUNNEL_OK {"events":["lead_form_start","lead_form_step","lead_form_submit","whatsapp_click","email_click","service_page_view"],"submit_journey":"contrato","home_multistep":true}
LEAD_FUNCTION_OK {"receipt_id":"3cf464d1f47027eecfd9da2b","journey":"contrato","delivered":true,"ntfy_message_id":"ntfy-msg-test-001"}
```

Events documented: `seo/ANALYTICS-FUNNEL.md`  
Unit tests: `seo/scripts/test_analytics_pii.mjs`, `test_form_funnel.mjs`.

---

## 11. Analytics event list (implemented)

- `service_page_view`, `offer_view`
- `diagnostic_cta_click`, `offer_cta_click`, `critical_decision_cta_click`
- `whatsapp_click`, `email_click`
- `lead_form_start`, `lead_form_step`, `lead_form_error`, `lead_form_submit`, `lead_form_success`
- `qualification_stage_select`, `qualification_urgency_select`
- pSEO events when attribution present

PII field names blocked in `track()`: nome, email, telefone, mensagem, empresa, document fields.

---

## 12. Limitations (honest)

1. **FormSubmit email**: PENDING owner activation (403 observed). Ops delivery works via **ntfy** with poll-back proof.
2. **Netlify Forms** native HTML POST still returns 404; not used as backend.
3. **Field metrics**: CWV, GSC rankings, conversion rate = **PENDING_FIELD_DATA**.
4. **97 library pages** noindex pending full editorial rewrite (not deleted).
5. **pSEO** indexable publish remains gated; weak pages stay reject/noindex.

---

## 13. What depends on future data

| Item | Status |
| --- | --- |
| CrUX field LCP/INP/CLS | PENDING_FIELD_DATA |
| Search Console clicks/impressions | PENDING_FIELD_DATA |
| Lead→client conversion rate | PENDING_FIELD_DATA |
| FormSubmit inbox email after activation | PENDING (owner action) |

---

## 14. How to re-verify

```bash
# build identity
curl -sS https://confenge.com.br/.well-known/build-info.json

# lead A/B/C
curl -sS -X POST https://confenge.com.br/.netlify/functions/lead \
  -H 'Content-Type: application/json' -H 'Origin: https://confenge.com.br' \
  --data '{"nome":"QA","telefone":"48988344559","estagio":"problema urgente em contrato","jornada":"contrato","consentimento":"on"}'

# analytics unit
npm run test:analytics && npm run test:form-funnel && npm run test:lead-function

# lighthouse
LH_PAGES="/,/defesa-margem-contratos-publicos/,/bid-room-licitacoes-obras/,/diretoria-b2g/" \
  node scripts/site/run_lighthouse.mjs https://confenge.com.br
```

---

*No promotional self-grades. Claims above map to files under `docs/evidence/` or live HTTP.*
