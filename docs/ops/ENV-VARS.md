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
| `LEAD_STORE_HTTP_URL` | alternativa | Backend HTTP durável (POST JSON do lead) |
| `LEAD_STORE_HTTP_TOKEN` | com HTTP store | Bearer do backend |
| `LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL` | opcional | Template com `{idempotency_key}` |
| `NETLIFY_BLOBS_TOKEN` | se contexto Blobs ausente | Token API Netlify com acesso a Blobs |
| `NETLIFY_BLOBS_SITE_ID` | com token | Site ID (senão usa `SITE_ID`) |

## Analytics

| Nome | Descrição |
| --- | --- |
| `PLAUSIBLE_DOMAIN` | Domínio Plausible se forward ativo |
| `PLAUSIBLE_FORWARD` | `1` para encaminhar eventos server-side |
| `PLAUSIBLE_API_URL` | Default `https://plausible.io/api/event` |

## Front-end (build-time se aplicável)

| Nome | Descrição |
| --- | --- |
| `TURNSTILE_SITE_KEY` | Site key no HTML do formulário (pública) |

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
