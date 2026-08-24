# Ações externas exatas (owner) — bloqueadores de 10/10 produção

Cada item **OPEN** impede `COMPLETE_10_10_REPO_AND_PRODUCTION` até validação.

Legenda: **DONE** = comprovado nesta entrega · **OPEN** = só o owner ·
**DEFER** = não executar até o gatilho versionado.

---

## 1. Netlify — variáveis de ambiente (produção) — **PARTIAL**

**Plataforma:** Netlify UI → Site `confenge` → Site configuration → Environment variables → Production  

| Variável | Valor esperado | Razão | Validação pós-set |
| --- | --- | --- | --- |
| `OPS_WEBHOOK_URL` | HTTPS webhook privado (Slack Incoming / Make / n8n / Discord) | Notify ops autenticado | POST lead sintético → mensagem no canal com `lead_id` |
| `OPS_WEBHOOK_SECRET` | random ≥32 chars | HMAC header `X-Confenge-Signature: sha256=…` | Receptor verifica HMAC do body |
| `RESEND_API_KEY` | `re_…` da conta Resend | E-mail transacional | Inbox ops recebe e-mail com protocolo |
| `LEAD_FROM_EMAIL` | `CONFENGE Leads <leads@confenge.com.br>` | Remetente domínio próprio | Header From coerente |
| `LEAD_NOTIFY_EMAIL` | `tiago.sasaki@confenge.com.br` | Destino ops | Inbox |
| `IP_HASH_SALT` | random | Hash estável de IP em logs/store | logs sem IP raw |
| `TURNSTILE_SECRET_KEY` | secret Cloudflare | Antiabuso primário | ver §4 |
| `LEAD_REQUIRE_TURNSTILE` | `1` **somente após** sitekey no HTML | Força verify | POST sem token → **403** |
| `LEAD_PROBE_SECRET` | random | Smoke sintético | `X-Confenge-Probe` header |
| `CONFENGE_INBOUND_WEBHOOK_URL` | HTTPS `…/api/v1/webhooks/confenge/inbound` | Handoff `confenge.inbound.v1` (Warmbly PR #71) | Synthetic persist → handoff **SKIPPED**. Real lead + live inbound env → `inbound_handoff` delivered. A 201 is not INBOUND NOW. |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | mesmo valor no Warmbly | HMAC `X-Warmbly-Signature` | Destino 201; 401 se secreto divergir |

**Status 2026-08-02:** `RESEND_API_KEY`, `LEAD_FROM_EMAIL`, `LEAD_NOTIFY_EMAIL`, `IP_HASH_SALT` set via Netlify CLI (production). Redeploy `6a6f7027381c29f8c55c70d1` live. E-mail lead **Delivered** (Resend UI). Ainda OPEN: `OPS_WEBHOOK_*`, Turnstile, probe secret.

**Depois de salvar env:** Deploys → Trigger deploy (clear cache) ou empty commit para recarregar functions.

**Rotação ntfy (obrigatória — OPEN):**  
No app ntfy (ou API), **apagar/revogar** o tópico historicamente exposto `confenge-prod-leads-b2g-9f3c2a1e7d4b6e80`. Não reutilizar o nome. Código de produção **já não usa** esse tópico.

**Consequência se OPEN:** lead persiste (201) mas ops pode não receber e-mail/webhook; Turnstile não forçado.

---

## 2. DNS e-mail (domínio confenge.com.br) — **DONE** (additive Resend records)

**Plataforma:** DNS do registrador do domínio (MX atual: Hostinger `mx1/mx2.hostinger.com` — DoH 2026-08-02)

**Estado observado (Cloudflare DoH):** sem TXT SPF em `@`; sem `_dmarc`; MX Hostinger apenas.  
Evidência: `docs/evidence/inbound-10/dns-email-auth-status.json`

| Registro | Host | Valor esperado | Validação |
| --- | --- | --- | --- |
| SPF TXT | `@` | `v=spf1 include:…` **conforme wizard Resend** (não inventar include; copiar do painel) **mantendo** envio Hostinger se ainda usar webmail | DoH/dig + Resend Domain green |
| DKIM CNAME | hosts do Resend | valores do wizard Resend | Resend Domain → Verified |
| DMARC TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:tiago.sasaki@confenge.com.br` | DoH/dig `_dmarc.confenge.com.br` |

**Consequência se OPEN:** e-mail transacional não pode ser score 10 (sem auth → spam/bounce).

---

## 3. Resend — domínio e API — **DONE**

**Plataforma:** [resend.com](https://resend.com) → Domains → Add `confenge.com.br` → copiar DNS → API Keys → Create  

| Campo | Valor |
| --- | --- |
| Domain | `confenge.com.br` |
| API key | colar em Netlify `RESEND_API_KEY` |
| From | `leads@confenge.com.br` (ou subdomínio verificado) |

**Validação:**  
`npm run probe:lead:prod` → 201 → checar inbox `LEAD_NOTIFY_EMAIL` com subject contendo o `lead_id`. Export/screenshot **sem** colar PII no git.

---

## 4. Cloudflare Turnstile — **OPEN**

**Plataforma:** [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile → Add widget  

| Campo | Valor |
| --- | --- |
| Domain | `confenge.com.br` |
| Widget mode | Managed |
| Site key (pública) | `index.html` → `#turnstile-slot` attribute `data-turnstile-sitekey="…"` **ou** `window.CONFENGE_TURNSTILE_SITEKEY` |
| Secret key | Netlify `TURNSTILE_SECRET_KEY` |

Depois: set `LEAD_REQUIRE_TURNSTILE=1`, redeploy.  

**Validação:**  
- Form carrega widget  
- POST lead sem token → **403** `anti_abuse`  
- POST com token válido → **201**  

CSP já permite `challenges.cloudflare.com` em `_headers`. Script carrega **só** se sitekey presente.

---

## 5. GitHub — branch protection em `main` — **DONE** (2026-08-02)

Aplicado via API (`gh`) neste ambiente:

| Setting | Valor |
| --- | --- |
| required_status_checks.strict | true |
| contexts | `gates` (job site-ci) |
| required_pull_request_reviews | dismiss_stale true, approving count 0 (solo) |
| allow_force_pushes | false |
| required_conversation_resolution | true |

**Evidência:** `docs/evidence/inbound-10/branch-protection.json`  

**Validação owner (opcional reforço):** Settings → Branches → confirmar UI; elevar `required_approving_review_count` se houver segundo revisor; adicionar check `Analyze` (CodeQL) quando estável.

---

## 6. Monitoramento uptime — **OPEN**

**Plataforma:** Better Stack / UptimeRobot / Checkly (conta owner)

| URL | Expect |
| --- | --- |
| `https://confenge.com.br/` | 200 |
| `https://confenge.com.br/robots.txt` | 200 |
| `https://confenge.com.br/sitemap-index.xml` | 200 |
| `https://confenge.com.br/.well-known/build-info.json` | 200 JSON |
| `https://confenge.com.br/.netlify/functions/collect` | 200 GET |

Alerta por e-mail/SMS **diferente** do canal de leads.  
Probe periódico de lead: `npm run probe:lead:prod` (cron owner) com `LEAD_PROBE_SECRET` se configurado.

---

## 7. Exportação de conversão para analytics de terceiros — **DEFER**

**Decisão:** não instalar tag no browser e não encaminhar eventos server-side.
O coletor `/.netlify/functions/collect` continua sendo a autoridade de mensuração
da superfície pública, com origem `CONFENGE_WEB` e política de PII
`aggregate_allowlist_empty`.

Autoridade versionada:
[`data/ops/third-party-conversion-decision.v1.json`](../../data/ops/third-party-conversion-decision.v1.json)
e [decisão operacional](THIRD-PARTY-CONVERSION-DECISION.md).

Não há variável de ambiente que autorize exportação. Configuração externa não
pode substituir revisão de código e decisão humana.

**Revisão:** 2026-09-20, ou antes somente quando todas as condições forem
verdadeiras:

1. #87 muda para `EXECUTE` com hipótese versionada;
2. existe teto de gasto em BRL maior que zero e aprovação humana referenciada;
3. consentimento explícito, default-denied, é versionado e ocorre antes do
   primeiro evento exportado;
4. um teste prova exportação zero quando o consentimento é negado.

Chegar à data apenas abre nova decisão; não instala nada automaticamente. Um
futuro canário deve nomear provedor, validade da autorização e rollback, manter
PII zero e passar `npm run test:analytics`.

---

## 8. Netlify Blobs — **DONE** (produção)

Persistência comprovada: HTTP **201** + `lead_id` + read-back no tip funcional.  
Não exige ação adicional salvo migração para HTTP store.

---

## 9. Rollback live click — **OPEN (Netlify UI)**

Procedimento + SHAs: `docs/ops/ROLLBACK.md`, `docs/evidence/inbound-10/rollback-evidence.md`.  
Owner: Netlify → Deploys → Publish deploy anterior → validar probe → republicar tip.

---

## Ordem recomendada de execução (owner, ~45–90 min)

1. Resend domain + DNS §2–3  
2. Netlify env §1 (Resend + webhook + salt) → redeploy  
3. `npm run probe:lead:prod` + confirmar inbox + webhook  
4. Turnstile §4 → sitekey HTML + secret + `LEAD_REQUIRE_TURNSTILE=1` → redeploy  
5. Uptime §6  
6. Revogar ntfy antigo §1  
7. Rollback drill click §9 (opcional mas fecha 10 em release ops)

## Após executar

Avisar o agente para revalidar: e-mail/inbox, Turnstile 403/201, webhook HMAC, uptime green, tip = HEAD.
