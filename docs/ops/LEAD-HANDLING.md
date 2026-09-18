# Tratamento operacional do lead

## Entrada

1. Formulário → `POST /api/web/lead` no runtime portátil Netcup/nginx (`/.netlify/functions/lead` é alias compatível) → persistência filesystem host-owned (`/var/lib/confenge-web`) → `lead_id` / `receipt_id`
2. Outbox inbound `PENDING` e POST `confenge.inbound.v1` para Warmbly (HMAC server-side). Warmbly fora **não** falha a captura.
3. Entrega pós-persist, em paralelo e com orçamento único por canal (`LEAD_DELIVERY_TIMEOUT_MS`, default 5 s): e-mail Resend para `LEAD_NOTIFY_EMAIL` e, quando configurados, `OPS_WEBHOOK_URL` / `NTFY_URL`. Em produção (2026-09-18) só o e-mail está configurado: `delivery.notify` é sempre `skipped` e o e-mail é o único alerta de lead real.
4. Clique WhatsApp / mailto (sem persistência automática — conversão distinta)

Handoff Warmbly: [WARMBLY-INBOUND.md](./WARMBLY-INBOUND.md). Não usar `OPS_WEBHOOK_URL` como destino inbound.

Money-asset ops chain (auth, no PII): `asset_view` → `contract_analyzed` → `cta_view` → `cta_click` → `lead_persisted` (legacy alias `lead_created`) → handoff `delivered`/`blocked` (plus pending/retryable/skipped/dead). Query `ops?action=inbound_handoff` or `analytics_summary`. Unset inbound URL/secret skips handoff and does not fail capture.

Published inspection (read-only, GET-only, no credential, never creates a lead): `npm run probe:money-asset:prod`. Authenticated synthetic capture/transport proof is `npm run probe:lead:prod` (`LEAD_PROBE_SECRET` required). INBOUND NOW stays unproven until a real lead (or real rejection) meets a live destination with auto-send off.

## Estados

| Status | Significado |
| --- | --- |
| `persisted` | Gravado; notify/email ainda não OK |
| `persisted_notified` | Gravado e pelo menos um canal de notificação OK |
| `suppressed` | Honeypot (não é lead real) |

Handoff (campo `handoff.status`, independente do status de captura): `PENDING` → `DELIVERED` / `RETRYABLE` / `DEAD` / `BLOCKED` / `SKIPPED`.

Closed-loop measurement (raw lead is not a qualified opportunity): [CLOSED-LOOP.md](../revops/CLOSED-LOOP.md).

## Rotina mínima de atendimento (2026-09-18)

Enquanto não houver segundo canal push, o atendimento de um lead real tem três
peças, nesta ordem:

1. **Alerta** = e-mail Resend (`From: LEAD_FROM_EMAIL`, `To: LEAD_NOTIFY_EMAIL`,
   assunto `Lead CONFENGE [jornada] estágio · <lead_id>`). Só sai para
   `record_kind=real`; sintético/QA/probe é `email=skipped`. Depende do domínio
   `confenge.com.br` estar `verified` no Resend (ver
   [EXTERNAL-ACTIONS.md](./EXTERNAL-ACTIONS.md) §2/§3: até 2026-09-18 ele estava
   `failed` e nenhum e-mail de lead real havia saído do host). Um e-mail perdido
   é um lead sem alerta: por isso existe o passo 3.
2. **Fila** = INBOUND NOW do Warmbly (`GET /confenge/inbound`, sessão de
   operador, loopback no host via túnel ssh; runbook `netcup-ops.md` do Warmbly, no host). O
   Warmbly não notifica ninguém: é um "human queue card" que nunca despacha.
   Linhas com `record_kind` sintético ficam fora da fila (skip calculado na
   leitura, `include_synthetic=1` para vê-las).
3. **Checagem diária** = `GET ops?action=leads&kind=real` (Bearer `OPS_TOKEN`)
   e o campo `sla_breaches` (`needs_contact` após `LEAD_SLA_HOURS`, default
   4 h). Nenhum consumidor envia esse alerta; a checagem é humana.

Opcional (decisão do fundador): configurar `OPS_WEBHOOK_URL` com
`OPS_WEBHOOK_ALLOWED_HOSTS` (allowlist obrigatória em produção, o body carrega
contato) para um canal push. Não usar o inbound do Warmbly como esse canal.

## Consulta por `lead_id` (evidência sem PII)

Protocolo para confirmar um recibo ponta a ponta. Gravar apenas ids, status e
timestamps; nunca imprimir chaves, `to`, e-mail, telefone ou mensagem.

1. Registro durável (host ou público, Bearer `OPS_TOKEN`; sem `pii=1`):
   `GET /.netlify/functions/ops?action=lead&id=<lead_id>` → `status`,
   `record_kind`, `handoff`, `needs_contact`. A mensagem vira `[present]`.
2. Handoff e entrega: `GET ops?action=inbound_handoff&lead_id=<lead_id>` →
   `handoff.{status,attempts,delivered_at,downstream}` e
   `delivery.{notify_status,email_status}`.
3. Correlação com o Resend: o store guarda `delivery.email.provider_id` (id da
   mensagem) e `delivery.email.http`; com `pii=1` (somente no shell do host)
   `ops?action=lead&id=…&pii=1` devolve `delivery` inteiro. No host,
   `GET https://api.resend.com/emails/<provider_id>` com a chave do
   `runtime.env`, ou `GET /emails` filtrando `subject` pelo `lead_id`
   (registros anteriores a esta versão não têm `provider_id`). Um `reason`
   `timeout` significa que o Resend não respondeu dentro do orçamento; o
   e-mail pode ter saído mesmo assim — conferir no Resend antes de reenviar.
4. Warmbly (postgres loopback no host): `select lead_id, status,
   suppress_reason, raw_payload->>'record_kind', warmbly_ingested_at,
   commercial_action_id, dedupe_of_lead_id from outreach_inbound_leads where
   lead_id='<lead_id>'` — nunca selecionar `lead_email`, `lead_phone` ou
   `message`. Depois `GET /confenge/inbound` via túnel para confirmar presença
   na fila.

## Comportamento conhecido: reenvio e duplicação

- Mesma aba: a chave `fe-<uuid>` fica em `sessionStorage` por
  página/asset/cta até o sucesso. Reenviar após timeout devolve o **mesmo
  recibo** (200 `idempotent`), inclusive sem novo token Turnstile: o servidor
  consulta a chave explícita antes do siteverify e responde só a projeção
  pública já entregue àquele cliente. Sem chave explícita, a chave por
  conteúdo continua atrás do Turnstile (evita oráculo de existência).
- Nova aba, navegação privada ou `sessionStorage` bloqueado: chave nova →
  **novo registro e novo e-mail**. A deduplicação por identidade acontece só no
  Warmbly (`dedupe_of_lead_id`); no `web-cfg` os dois recibos são válidos.
- Turnstile: o token é de uso único. Após timeout, 403 ou 429 o front chama
  `turnstile.reset()` quando o widget existe; o reenvio recebe token novo.
- Entrega: um Resend pendurado não consome o orçamento de 15 s do navegador;
  o registro fica `persisted` com `delivery.email.status=error`,
  `reason=timeout` e sem `provider_id`. Verificar no Resend antes de qualquer
  reenvio manual.

## Limite de autoridade

`web-cfg` registra somente persist/receipt e o estado técnico do handoff. Qualificação, prioridade comercial, proposta, ganho/perda, SLA comercial e next action pertencem ao Warmbly. O relatório fechado consome apenas observações Warmbly explícitas, read-only e sem PII; clique, mensagem ou lead persistido nunca afirmam `qualified`.

## Fluxo

`web-cfg`: entrada → persist/receipt → handoff `CONFENGE_WEB`

`warmbly`: qualificação → next action → proposta → ganho/perdido → observação agregada read-only

## Recuperação e privacidade

O export do store filesystem (`npm run revops:export-leads` / `docs/ops/LEAD-EXPORT-RUNBOOK.md`) serve recuperação, DSAR e auditoria do receipt, não um CRM paralelo. Rollback de release não apaga o store host-owned. Outcomes não são escritos de volta em `web-cfg`.

## Eliminação de teste

Leads sintéticos com nome prefixo `TESTE-INBOUND` ou e-mail `@example.com` devem ser eliminados após E2E (pedido ao store ou script admin interno — não expor delete público).
