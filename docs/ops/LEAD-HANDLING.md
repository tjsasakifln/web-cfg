# Tratamento operacional do lead

## Entrada

1. Formulário → `POST /api/web/lead` no runtime portátil Netcup/nginx (`/.netlify/functions/lead` é alias compatível) → persistência filesystem host-owned (`/var/lib/confenge-web`) → `lead_id` / `receipt_id`
2. Outbox inbound `PENDING` e POST `confenge.inbound.v1` para Warmbly (HMAC server-side). Warmbly fora **não** falha a captura.
3. Notificação ops Slack-style (`OPS_WEBHOOK_URL`) e/ou e-mail Resend
4. Clique WhatsApp / mailto (sem persistência automática — conversão distinta)

Handoff Warmbly: [WARMBLY-INBOUND.md](./WARMBLY-INBOUND.md). Não usar `OPS_WEBHOOK_URL` como destino inbound.

Money-asset ops chain (auth, no PII): `asset_view` → `contract_analyzed` → `cta_view` → `cta_click` → `lead_persisted` (legacy alias `lead_created`) → handoff `delivered`/`blocked` (plus pending/retryable/skipped/dead). Query `ops?action=inbound_handoff` or `analytics_summary`. Unset inbound URL/secret skips handoff and does not fail capture.

Proof harness (synthetic only): `npm run probe:money-asset:prod`. INBOUND NOW stays unproven until a real lead (or real rejection) meets a live destination with auto-send off.

## Estados

| Status | Significado |
| --- | --- |
| `persisted` | Gravado; notify/email ainda não OK |
| `persisted_notified` | Gravado e pelo menos um canal de notificação OK |
| `suppressed` | Honeypot (não é lead real) |

Handoff (campo `handoff.status`, independente do status de captura): `PENDING` → `DELIVERED` / `RETRYABLE` / `DEAD` / `BLOCKED` / `SKIPPED`.

Closed-loop measurement (raw lead is not a qualified opportunity): [CLOSED-LOOP.md](../revops/CLOSED-LOOP.md).

## Limite de autoridade

`web-cfg` registra somente persist/receipt e o estado técnico do handoff. Qualificação, prioridade comercial, proposta, ganho/perda, SLA comercial e next action pertencem ao Warmbly. O relatório fechado consome apenas observações Warmbly explícitas, read-only e sem PII; clique, mensagem ou lead persistido nunca afirmam `qualified`.

## Fluxo

`web-cfg`: entrada → persist/receipt → handoff `CONFENGE_WEB`

`warmbly`: qualificação → next action → proposta → ganho/perdido → observação agregada read-only

## Recuperação e privacidade

O export do store filesystem (`npm run revops:export-leads` / `docs/ops/LEAD-EXPORT-RUNBOOK.md`) serve recuperação, DSAR e auditoria do receipt, não um CRM paralelo. Rollback de release não apaga o store host-owned. Outcomes não são escritos de volta em `web-cfg`.

## Eliminação de teste

Leads sintéticos com nome prefixo `TESTE-INBOUND` ou e-mail `@example.com` devem ser eliminados após E2E (pedido ao store ou script admin interno — não expor delete público).
