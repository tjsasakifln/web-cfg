# Variáveis de ambiente (somente nomes)

Configurar no Netlify → Site configuration → Environment variables (production + deploy previews conforme necessidade).

## Leads (obrigatórias para produção completa)

| Nome | Obrigatória | Descrição |
| --- | --- | --- |
| `OPS_WEBHOOK_URL` | recomendada | URL HTTPS autenticada para notificação ops |
| `OPS_WEBHOOK_SECRET` | recomendada | HMAC SHA-256 do body (`X-Confenge-Signature`) |
| `OPS_WEBHOOK_BEARER` | opcional | Bearer token alternativo/adicional |
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
