# Ações externas exatas (owner) — bloqueadores de 10/10 produção

Cada item **OPEN** impede `COMPLETE_10_10_REPO_AND_PRODUCTION` até validação.

Legenda: **DONE** = comprovado nesta entrega · **OPEN** = só o owner ·
**DEFER** = não executar até o gatilho versionado.

---

## 1. Ambiente de produção (VPS EnvironmentFile) — **PARTIAL**

**Plataforma:** `/etc/confenge-web/runtime.env` no host de produção (nginx/Netcup).
Não usar a UI da Netlify como autoridade de env público.

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
| `CONFENGE_INBOUND_WEBHOOK_URL` | HTTPS `…/api/v1/webhooks/confenge/inbound` | Handoff `confenge.inbound.v1` (Warmbly PR #71) | Probe autenticado → receipt sintético idempotente, sem action; demais não-real → **SKIPPED**. A 201 sintética não é INBOUND NOW. |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | mesmo valor no Warmbly | HMAC `X-Warmbly-Signature` | Destino 201; 401 se secreto divergir |

**Status 2026-08-02 (registro historico, plano Netlify de entao; nao executar):** `RESEND_API_KEY`, `LEAD_FROM_EMAIL`, `LEAD_NOTIFY_EMAIL`, `IP_HASH_SALT` foram definidos pelo CLI legado e o redeploy `6a6f7027381c29f8c55c70d1` ficou live. Hoje o env authority e `/etc/confenge-web/runtime.env`. E-mail lead **Delivered** (Resend UI). Ainda OPEN: `OPS_WEBHOOK_*`, Turnstile, probe secret.

**Depois de salvar env:** `sudo systemctl restart confenge-web-runtime.service` e validar `/ready`. Não republicar na Netlify.

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
| API key | colar em `/etc/confenge-web/runtime.env` como `RESEND_API_KEY` |
| From | `leads@confenge.com.br` (ou subdomínio verificado) |

**Validação:** probe sintético deve retornar `email_status=skipped` e não pode
ser usado para testar inbox. Entrega transacional real só pode ser observada a
partir de uma submissão humana genuína, consentida e não fabricada, preservando
o protocolo fora do git.

---

## 4. Cloudflare Turnstile — **DONE** (produção Netcup, 2026-08-29)

**Plataforma:** [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile → Add widget

| Campo | Valor |
| --- | --- |
| Domain | `confenge.com.br` |
| Widget mode | Managed |
| Site key (pública) | `TURNSTILE_SITE_KEY` no build de `main`; `build:site` injeta em `_site/index.html` |
| Secret key | `TURNSTILE_SECRET_KEY` no EnvironmentFile do VPS |

Depois: set `LEAD_REQUIRE_TURNSTILE=1`, `LEAD_REQUIRE_ORIGIN=1` e um
`IP_HASH_SALT` privado de 32+ caracteres, então redeploy. Build de produção sem
site key falha antes de publicar; o secret nunca entra no HTML.

**Validação:**
- censo contemporâneo 21/21 rotas de captura carrega widget e site key pública
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
Probe periódico de lead: `npm run probe:lead:prod` somente com
`LEAD_PROBE_SECRET`, `OPS_TOKEN` e safety gate Warmbly verde. O comando falha
antes do POST quando qualquer precondição está ausente.

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

1. #87 muda para `EXECUTE` com hipótese versionada neste repositório;
2. existe teto de gasto em BRL maior que zero e aprovação humana referenciada
   neste repositório;
3. consentimento explícito, default-denied, é versionado e ocorre antes do
   primeiro evento exportado;
4. um teste prova exportação zero quando o consentimento é negado.

Chegar à data apenas abre nova decisão; não instala nada automaticamente. Um
futuro canário deve nomear provedor, validade da autorização e rollback, manter
PII zero e passar `npm run test:analytics`. O provedor deve ser único, coincidir
com o runtime revisado e ter autorização não expirada.

---

## 8. Persistência host-owned — **DONE** (produção)

Produção usa filesystem em `/var/lib/confenge-web`. Health ops reporta
`storage.backend=filesystem`. Blobs da Netlify não são o store público.

---

## 9. Rollback live — **documentado (nginx/Netcup)**

Procedimento + SHA: `docs/ops/ROLLBACK.md`.
Owner: `/opt/confenge-web/bin/rollback <FULL_SHA>` → validar probe → evidência
`ROLLED_BACK`. Não usar a UI da Netlify.

---

## Ordem recomendada de execução (owner, ~45–90 min)

1. Confirmar EnvironmentFile do VPS e `/ready`
2. Rodar o probe autenticado com envio local `skipped` e Warmbly sem dispatch
3. Uptime §6
4. Revogar ntfy antigo §1
5. Rollback drill §9 sem usar Netlify

## Após executar

Avisar o agente para revalidar: e-mail/inbox, Turnstile 403/201, webhook HMAC, uptime green, tip = HEAD.
