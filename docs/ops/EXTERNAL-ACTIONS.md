# Ações externas exatas (owner) — bloqueadores de 10/10 produção

Cada item impede COMPLETE enquanto não executado e validado.

## 1. Netlify — variáveis de ambiente (produção)

**Plataforma:** Netlify UI → Site `confenge` → Site configuration → Environment variables  

| Variável | Valor esperado | Razão | Validação |
| --- | --- | --- | --- |
| `OPS_WEBHOOK_URL` | HTTPS do webhook privado (Slack/Make/n8n/Discord) | Notificação ops autenticada | POST lead sintético → mensagem no canal |
| `OPS_WEBHOOK_SECRET` | string aleatória ≥32 chars | HMAC `X-Confenge-Signature` | Verificar assinatura no receptor |
| `RESEND_API_KEY` | key Resend | E-mail transacional | Inbox recebe e-mail com lead_id |
| `LEAD_FROM_EMAIL` | `CONFENGE Leads <leads@confenge.com.br>` | Remetente domínio próprio | Header From correto |
| `LEAD_NOTIFY_EMAIL` | `tiago.sasaki@confenge.com.br` | Destino ops | Inbox |
| `IP_HASH_SALT` | random | Hash estável de IP | logs sem IP raw |
| `TURNSTILE_SECRET_KEY` | secret Turnstile | Antiabuso primário | POST sem token → 403 quando `LEAD_REQUIRE_TURNSTILE=1` |
| `LEAD_REQUIRE_TURNSTILE` | `1` após sitekey no HTML | Força Turnstile | form em prod |
| `LEAD_PROBE_SECRET` | random | Smoke sintético | header probe |

**Após setar:** trigger deploy ou clear cache + redeploy functions.

**Rotação obrigatória:** revogar tópico ntfy antigo `confenge-prod-leads-b2g-*` (qualquer pessoa com o topic lido em respostas históricas). Não recriar o mesmo nome.

## 2. DNS e-mail (domínio confenge.com.br)

**Plataforma:** DNS do registrador (onde estão os registros do domínio)

| Registro | Valor esperado | Razão | Validação |
| --- | --- | --- | --- |
| SPF TXT `@` | incluir mecanismo Resend (`include:amazonses.com` ou doc Resend atual) | Autenticação | `dig TXT confenge.com.br` |
| DKIM | CNAME(s) fornecidos pelo Resend para `leads`/`send` | Autenticação | MXToolbox / Resend dashboard |
| DMARC TXT `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:tiago.sasaki@confenge.com.br` | Política | dig TXT _dmarc |

Sem SPF/DKIM/DMARC válidos, e-mail não pode ser marcado 10/10.

## 3. Resend — domínio e API

**Plataforma:** resend.com → Domains → Add `confenge.com.br` → copiar DNS → API Keys  

Validação: envio de teste com `lead_id` sintético e print/export sem PII desnecessário.

## 4. Cloudflare Turnstile

**Plataforma:** dash.cloudflare.com → Turnstile → Add site `confenge.com.br`  

| Campo | Valor |
| --- | --- |
| Domain | confenge.com.br |
| Widget mode | Managed |
| Site key | colar no HTML do formulário (campo público) |
| Secret key | `TURNSTILE_SECRET_KEY` no Netlify |

HTML: widget antes do submit + `name="cf-turnstile-response"`.  
CSP: adicionar `https://challenges.cloudflare.com` em `script-src` e `frame-src` em `_headers`.

## 5. GitHub — branch protection em `main`

**Plataforma:** GitHub → repo `tjsasakifln/web-cfg` → Settings → Branches → Add rule  

| Setting | Valor |
| --- | --- |
| Branch name pattern | `main` |
| Require a pull request before merging | ON |
| Require status checks | ON: `gates` (site-ci), `Analyze` (codeql) |
| Require conversation resolution | ON |
| Do not allow bypassing | ON se possível |
| Restrict force push | ON |

Validação: tentativa de push direto em main bloqueada (ou documentar admin bypass).

## 6. Monitoramento uptime

**Plataforma:** Better Stack / UptimeRobot / Checkly  

URLs: `/`, `/robots.txt`, `/sitemap-index.xml`, `/.well-known/build-info.json`, `GET /.netlify/functions/collect`  
Alerta: e-mail ops **diferente** do canal de leads.

## 7. Analytics opcional (Plausible cloud)

Se quiser dashboard SaaS além do coletor 1ª parte: conta Plausible → domain → `PLAUSIBLE_DOMAIN` + `PLAUSIBLE_FORWARD=1` + CSP `connect-src`/`script-src` se script client.

## 8. Netlify Blobs (obrigatório se não houver HTTP store)

Produção retornou `store_unavailable` quando `NETLIFY_BLOBS_CONTEXT` não foi injetado.

**Opção A — Blobs nativo**

1. Netlify UI → Site → ensure Blobs not disabled  
2. Redeploy após `external_node_modules = ["@netlify/blobs"]`  
3. Se ainda 503: User settings → Applications → Personal access tokens → gerar token  
4. Site env: `NETLIFY_BLOBS_TOKEN=<token>` e `NETLIFY_BLOBS_SITE_ID=<site_id>` (API ID do site)  
5. Redeploy functions  

**Opção B — HTTP store (Airtable/n8n/Supabase)**

| Variável | Valor |
| --- | --- |
| `LEAD_STORE_HTTP_URL` | endpoint POST que grava o JSON do lead |
| `LEAD_STORE_HTTP_TOKEN` | Bearer |

Validação: `POST /.netlify/functions/lead` → **201** com `lead_id`, body **sem** `topic`/`delivery`.

## Consequência de não executar

| Item | Sem ação |
| --- | --- |
| Webhook/e-mail | Lead persiste mas ops pode não ver (status `persisted`) |
| DNS e-mail | Bounce/spam |
| Turnstile | Rate limit + honeypot apenas |
| Branch protection | Governança < 10 |
| Monitor | Detecção manual |
