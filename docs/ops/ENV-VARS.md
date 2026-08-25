# Variáveis de ambiente (somente nomes)

Configurar no Netlify → Site configuration → Environment variables (production + deploy previews conforme necessidade).

## Leads (obrigatórias para produção completa)

| Nome | Obrigatória | Descrição |
| --- | --- | --- |
| `OPS_WEBHOOK_URL` | recomendada | URL HTTPS autenticada para notificação ops (Slack-style `confenge.lead`; **not** Warmbly inbound) |
| `OPS_WEBHOOK_SECRET` | recomendada | HMAC SHA-256 do body (`X-Confenge-Signature`) |
| `OPS_WEBHOOK_BEARER` | opcional | Bearer token alternativo/adicional |
| `CONFENGE_INBOUND_WEBHOOK_URL` | para INBOUND NOW | HTTPS `…/api/v1/webhooks/confenge/inbound`. Fail-closed sem HTTPS em staging/prod. Sem PII na query. |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | com inbound URL | Segredo HMAC compartilhado com Warmbly (`X-Warmbly-Signature`). Somente server env. |
| `CONFENGE_INBOUND_ALLOWED_HOSTS` | recomendada em prod | Allowlist de hosts (vírgula). Vazio + URL HTTPS válida é aceito. |
| `CONFENGE_INBOUND_MAX_ATTEMPTS` | opcional | Default 8. Depois `DEAD`. |
| `CONFENGE_INBOUND_TIMEOUT_MS` | opcional | Default 8000 |
| `RESEND_API_KEY` | para e-mail real | API key Resend |
| `LEAD_FROM_EMAIL` | para e-mail | Remetente, ex. `CONFENGE Leads <leads@confenge.com.br>` |
| `LEAD_NOTIFY_EMAIL` | para e-mail | Destino ops, ex. `tiago.sasaki@confenge.com.br` |
| `TURNSTILE_SECRET_KEY` | para Turnstile | Secret Cloudflare Turnstile |
| `LEAD_REQUIRE_TURNSTILE` | opcional | `1` força Turnstile mesmo em dev |
| `LEAD_PROBE_SECRET` | opcional | Header `X-Confenge-Probe` para smoke sintético |
| `LEAD_REQUIRE_ORIGIN` | opcional | `1` exige Origin em todo POST |
| `LEAD_RETAIN_DAYS` | opcional | Default 730 |
| `LEAD_RATE_WINDOW_MS` | opcional | Janela rate limit |
| `LEAD_RATE_MAX_IP` | opcional | Max por IP na janela |
| `LEAD_RATE_MAX_FP` | opcional | Max por fingerprint |
| `IP_HASH_SALT` | recomendada | Sal para hash de IP em logs/store |
| `NTFY_URL` | opcional | URL completa de tópico **privado** |
| `NTFY_TOKEN` | se NTFY_URL | Bearer token ntfy |
| `LEAD_STORE_DIR` | só local/dev | Diretório FileStore |
| `LEAD_STORE` | teste | `memory` para testes |
| `LEAD_ALLOW_MEMORY_FALLBACK` | perigoso | Nunca em produção |
| `LEAD_STORE_HTTP_URL` | só local/dev | Adapter genérico GET→POST; bloqueado em produção por não provar create-only atômico |
| `LEAD_STORE_HTTP_TOKEN` | com HTTP store local | Bearer do backend |
| `LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL` | local/dev | Template com `{idempotency_key}`; consulta não torna a criação atômica |
| `NETLIFY_BLOBS_TOKEN` | se contexto Blobs ausente | Token API Netlify com acesso a Blobs |
| `NETLIFY_BLOBS_SITE_ID` | com token | Site ID (senão usa `SITE_ID`) |

## Analytics

O coletor first-party `/.netlify/functions/collect` não exige variável de
provedor. Exportação para analytics de terceiros está `DEFER` por #247 e não
pode ser habilitada por ambiente. Consulte
[`data/ops/third-party-conversion-decision.v1.json`](../../data/ops/third-party-conversion-decision.v1.json).

## Front-end (build-time se aplicável)

| Nome | Descrição |
| --- | --- |
| `TURNSTILE_SITE_KEY` | Site key no HTML do formulário (pública) |

## Offers / contracting preview (defaults off)

| Nome | Descrição |
| --- | --- |
| `CONFENGE_OFFER_CATALOG_PUBLIC` | `true` só publica o catálogo. Default arquivo `false`. |
| `ASAAS_MODE` | Sempre `disabled` nesta campanha. Não autoriza produção. |
| `CONFENGE_PRODUCTION_CHECKOUT` | Checkout real. Default `false`. |
| `CONFENGE_PRODUCTION_WEBHOOK` | Webhook real. Default `false`. |
| `CONFENGE_REAL_MONEY` | Mutação financeira real. Default `false`. |

Nenhuma chave Asaas é lida ou armazenada.

## Commercial event producer (cross-system, fail-closed)

| Nome | Descrição |
| --- | --- |
| `CONFENGE_COMMERCIAL_EVENT_ENABLED` | `1` habilita POST HMAC. Default off. Sandbox/staging only. Consumer health must list `confenge.commercial_event.v1` (`accepted_event_versions` or `capabilities`) or producer HELD. |
| `CONFENGE_COMMERCIAL_EVENT_WEBHOOK_URL` | Destino HTTPS (default: inbound URL). Path `/api/v1/webhooks/confenge/inbound`. |
| `CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET` | Segredo HMAC server-side (default: inbound secret). Never in the browser. |
| `CONFENGE_COMMERCIAL_EVENT_HEALTH_URL` | Health/capability GET. Consumer must list `confenge.commercial_event.v1` or producer HELD. |
| `CONFENGE_COMMERCIAL_EVENT_ALLOWED_HOSTS` | Allowlist de hosts (default: inbound allowlist). |
| `CONFENGE_COMMERCIAL_EVENT_TIMEOUT_MS` | Default inbound timeout. |

Checkout/callback cannot emit `payment_received`. Production real-money stays off regardless of this flag.

## Build / release

| Nome | Descrição |
| --- | --- |
| `COMMIT_REF` / `CACHED_COMMIT_REF` | Injetados pelo Netlify no build |
| `CONTEXT` | `production` / `deploy-preview` |


## Ops auth

| Nome | Obrigatória | Descrição |
| --- | --- | --- |
| `OPS_TOKEN` | produção ops | Bearer / X-Ops-Token for sensitive ops actions |
| `REVOPS_TOKEN` | opcional | Alternate accepted by ops (dual-key rotation window) |
| `GSC_BACKUP_DIR` | opcional | Private directory for GSC insights backup export |
| `GSC_SITE_URL` | para pull vivo | `sc-domain:confenge.com.br` (ou `https://confenge.com.br/`) |
| `GSC_CREDENTIALS_JSON` | pull/inspeção | Caminho (ou JSON inline em CI) da service account com escopo `webmasters.readonly` |
| `GSC_CLIENT_SECRETS_JSON` | alternativa OAuth | Caminho do client secret; exige `GSC_TOKEN_JSON` |
| `GSC_TOKEN_JSON` | com client secret | Token OAuth armazenado. Não commitar. |
| `GSC_USE_FIXTURE` | teste | `1` força o sync de fixture (`ready_for_product_decisions=false`) |
