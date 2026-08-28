# Variáveis de ambiente (somente nomes)

Produção: EnvironmentFile root-owned `/etc/confenge-web/runtime.env` no VPS
(ver `docs/architecture/RUNTIME-AUTHORITY.md`). Local: `.env` a partir de
`.env.example`. Preview leftover Netlify, se ainda existir, não é o plano
público.

## Leads (obrigatórias para produção completa)

| Nome | Obrigatória | Descrição |
| --- | --- | --- |
| `OPS_WEBHOOK_URL` | recomendada | URL HTTPS autenticada para notificação ops (Slack-style `confenge.lead`; **not** Warmbly inbound) |
| `OPS_WEBHOOK_SECRET` | recomendada | HMAC SHA-256 do body (`X-Confenge-Signature`) |
| `OPS_WEBHOOK_BEARER` | opcional | Bearer token alternativo/adicional |
| `OPS_WEBHOOK_ALLOWED_HOSTS` | com OPS webhook em produção | Allowlist exata de hosts HTTPS (vírgula); obrigatória porque o body contém contato |
| `CONFENGE_INBOUND_WEBHOOK_URL` | para INBOUND NOW | HTTPS `…/api/v1/webhooks/confenge/inbound`. Fail-closed sem HTTPS em staging/prod. Sem PII na query. |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | com inbound URL | Segredo HMAC compartilhado com Warmbly (`X-Warmbly-Signature`). Somente server env. |
| `CONFENGE_INBOUND_ALLOWED_HOSTS` | recomendada em prod | Allowlist de hosts (vírgula). Vazio + URL HTTPS válida é aceito. |
| `CONFENGE_INBOUND_MAX_ATTEMPTS` | opcional | Default 8. Depois `DEAD`. |
| `CONFENGE_INBOUND_TIMEOUT_MS` | opcional | Default 8000 |
| `RESEND_API_KEY` | para e-mail real | API key Resend |
| `NURTURE_RATE_WINDOW_MS` | opcional | Janela antiabuso do subscribe; default 1 hora |
| `NURTURE_RATE_MAX_IP` | opcional | Máximo de subscribes por IP/janela; default 5 |
| `NURTURE_RATE_MAX_FP` | opcional | Máximo de subscribes por fingerprint/janela; default 8 |
| `NURTURE_TOKEN_SECRET` | para nurture | Segredo dedicado de 32+ caracteres; obrigatório para selar tokens bearer no store |
| `NURTURE_TOKEN_SECRET_PREVIOUS` | durante rotação nurture | Chave anterior de 32+ caracteres; manter somente durante a janela de migração |
| `LEAD_FROM_EMAIL` | para e-mail | Remetente, ex. `CONFENGE Leads <leads@confenge.com.br>` |
| `LEAD_NOTIFY_EMAIL` | para e-mail | Destino ops, ex. `tiago.sasaki@confenge.com.br` |
| `TURNSTILE_SECRET_KEY` | obrigatório em produção | Secret Cloudflare Turnstile; nunca expor no HTML/build |
| `TURNSTILE_SITE_KEY` | obrigatório no build de produção | Chave pública injetada em `_site/index.html`; build falha fechado se ausente |
| `LEAD_REQUIRE_TURNSTILE` | obrigatório em produção | Deve ser `1`; força Turnstile no endpoint |
| `LEAD_PROBE_SECRET` | opcional | Header `X-Confenge-Probe` para smoke sintético |
| `LEAD_REQUIRE_ORIGIN` | obrigatório em produção | Deve ser `1`; exige Origin em todo POST |
| `LEAD_RETAIN_DAYS` | opcional | Default 730 |
| `LEAD_RATE_WINDOW_MS` | opcional | Janela rate limit |
| `LEAD_RATE_MAX_IP` | opcional | Max por IP na janela |
| `LEAD_RATE_MAX_FP` | opcional | Max por fingerprint |
| `IP_HASH_SALT` | obrigatório em produção | Valor privado aleatório com 32+ caracteres para hash de IP em logs/store |
| `NTFY_URL` | opcional | URL completa de tópico **privado** |
| `NTFY_TOKEN` | se NTFY_URL | Bearer token ntfy |
| `NTFY_ALLOWED_HOSTS` | com ntfy em produção | Allowlist exata de hosts HTTPS (vírgula); obrigatória porque o body contém contato |
| `CONFENGE_STORAGE_BACKEND` | produção dinâmica | `filesystem` na Netcup; `netlify-blobs` não é o store de produção; `memory` é proibido em produção |
| `CONFENGE_STORAGE_DIR` | com `filesystem` | Caminho absoluto, preexistente, `0700`, fora da árvore de release (ex.: `/var/lib/confenge-web`) |
| `LEAD_STORE_DIR` | legado local/dev | Alias de compatibilidade do FileStore; não usar em nova produção |
| `LEAD_STORE` | teste | `memory` para testes |
| `LEAD_ALLOW_MEMORY_FALLBACK` | perigoso | Nunca em produção |
| `LEAD_STORE_HTTP_URL` | só local/dev | Adapter genérico GET→POST; bloqueado em produção por não provar create-only atômico |
| `LEAD_STORE_HTTP_TOKEN` | com HTTP store local | Bearer do backend |
| `LEAD_STORE_HTTP_GET_IDEMPOTENCY_URL` | local/dev | Template com `{idempotency_key}`; consulta não torna a criação atômica |
| `NETLIFY_BLOBS_TOKEN` | se contexto Blobs ausente | Token API Netlify com acesso a Blobs |
| `NETLIFY_BLOBS_SITE_ID` | com token | Site ID (senão usa `SITE_ID`) |
| `ANALYTICS_RETAIN_DAYS` | opcional | Retenção do analytics first-party; default 90 dias |
| `NURTURE_RETAIN_DAYS` | opcional | Retenção de subscriptions; default 730 dias. Suppressions não expiram genericamente. |
| `CORRECTION_RETAIN_DAYS` | opcional | Retenção de pedidos de correção; default 730 dias |
| `COMMERCIAL_EVENT_RETAIN_DAYS` | opcional | Retenção de eventos/outbox comerciais; default 730 dias |
| `SEARCH_OBSERVATION_RETAIN_DAYS` | opcional | Retenção de observações/outbox; default 730 dias |

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
| `RUNTIME_RELEASE_SHA` | SHA completo do release; o launcher Netcup deriva do manifest imutável |
| `COMMIT_REF` / `CACHED_COMMIT_REF` | Nomes legado de build; produção usa o SHA do release, não injeção Netlify |
| `CONTEXT` | Legado de preview; produção usa `NODE_ENV=production` + `RUNTIME_PROFILE=netcup-production` |

## Portable runtime / Netcup

| Nome | Descrição |
| --- | --- |
| `RUNTIME_HOST` | `127.0.0.1` na Netcup; bind público é recusado por default |
| `RUNTIME_PORT` | obrigatório em produção; o profile `netcup-production` exige `18100` |
| `RUNTIME_PROFILE` | `netcup-production` no service host-owned |
| `RUNTIME_RELEASE_SHA` | full git SHA; derivado do manifest imutável pelo launcher Netcup |
| `RUNTIME_BUILD_TIMESTAMP` | timestamp do build; derivado do manifest imutável pelo launcher Netcup |
| `RUNTIME_PUBLIC_ARTIFACT_HASH` | SHA-256 de `_site`; derivado do manifest, não configurar manualmente na Netcup |
| `RUNTIME_RELEASE_BUNDLE_HASH` | SHA-256 do tar; derivado do manifest detached, não configurar manualmente na Netcup |


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
