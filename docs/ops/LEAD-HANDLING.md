# Tratamento operacional do lead

## Entrada

1. Formulário → `POST /.netlify/functions/lead` → persistência Blobs → `lead_id`
2. Notificação ops (webhook/ntfy auth) e/ou e-mail Resend
3. Clique WhatsApp / mailto (sem persistência automática, conversão distinta)

## Estados

| Status | Significado |
| --- | --- |
| `persisted` | Gravado; notify/email ainda não OK |
| `persisted_notified` | Gravado e pelo menos um canal de notificação OK |
| `suppressed` | Honeypot (não é lead real) |

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

Enquanto não houver CRM dedicado: exportar do store Blobs / e-mails de notificação para planilha operacional com colunas: lead_id, received_at, journey, stage, source, first_touch_at, outcome, loss_reason.

## Eliminação de teste

Leads sintéticos com nome prefixo `TESTE-INBOUND` ou e-mail `@example.com` devem ser eliminados após E2E (pedido ao store ou script admin interno, não expor delete público).
