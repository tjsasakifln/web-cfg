# Tratamento operacional do lead

## Entrada

1. Formulário → `POST /.netlify/functions/lead` (alias `/api/web/lead`) → persistência filesystem host-owned (`/var/lib/confenge-web`) → `lead_id` / `receipt_id`
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

## Qualificação e prioridade

| Jornada | Prioridade | SLA 1º contato | Responsável default |
| --- | --- | --- | --- |
| contrato | P1 | 1 dia útil (urgente) / 2 dias úteis | Tiago |
| edital | P2 | 2 dias úteis | Tiago |
| operacao | P2 | 2 dias úteis | Tiago |
| conteudo/pseo | P3 | 2–3 dias úteis | Tiago |

## Fluxo

entrada → qualificação (jornada + urgência) → prioridade → 1º contato → follow-up → proposta → ganho/perdido (motivo) → origem/receita atribuída (planilha ou CRM externo)

## CRM mínimo

Enquanto não houver CRM dedicado: exportar do store filesystem (`npm run revops:export-leads` / `docs/ops/LEAD-EXPORT-RUNBOOK.md`) ou dos e-mails de notificação para planilha operacional com colunas: lead_id, received_at, journey, stage, source, first_touch_at, outcome, loss_reason. Rollback de release não apaga esse store.

## Eliminação de teste

Leads sintéticos com nome prefixo `TESTE-INBOUND` ou e-mail `@example.com` devem ser eliminados após E2E (pedido ao store ou script admin interno — não expor delete público).
