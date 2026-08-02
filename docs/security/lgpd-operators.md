# Registro técnico de operadores (LGPD) — CONFENGE site

**Não publicar segredos.** Este arquivo lista nomes de operadores, finalidades e bases — não tokens.

| Operador | Finalidade | Dados | Base | Transferência | Status config |
| --- | --- | --- | --- | --- | --- |
| CONFENGE (controlador) | Atendimento comercial B2G | Lead completo | Consentimento / procedimentos preliminares | BR | ativo |
| Netlify (hospedagem + Functions + Blobs) | Servir site, executar intake, persistir leads e amostras de eventos | Lead; telemetria sem PII; logs técnicos | Contrato de operação / legítimo interesse segurança | Pode ser EUA/UE conforme Netlify | ativo em produção |
| Resend (e-mail transacional) | Notificar ops de novo lead | Nome, contato, jornada, protocolo | Consentimento / operação | Conforme Resend | **requer** `RESEND_API_KEY` + DNS |
| Webhook ops autenticado | Notificar canal privado | Payload operacional do lead | Operação | Conforme destino | **requer** `OPS_WEBHOOK_URL` (+ secret) |
| ntfy autenticado (opcional) | Notificação push ops | Resumo lead | Operação | Conforme host ntfy | **requer** `NTFY_URL` + `NTFY_TOKEN` — sem tópico público |
| Cloudflare Turnstile | Antiabuso no formulário | Token de desafio; IP no verify | Legítimo interesse segurança | Cloudflare | **requer** site/secret keys |
| Meta WhatsApp | Canal se titular clicar wa.me | Apenas o que o titular envia no app | Ação do titular | Meta | link estático no site |
| Plausible / GA4 (opcional) | Analytics | Eventos sem PII | Legítimo interesse minimizado | Conforme provedor | opcional; coletor 1ª parte já ativo |

## Retenção

- Leads: padrão 730 dias (`LEAD_RETAIN_DAYS`), depois eliminação elegível.
- Analytics samples: operacional curto (Blobs diários).
- Logs de função: política da plataforma Netlify.

## Direitos do titular

Canal: tiago.sasaki@confenge.com.br — acesso/exportação por `lead_id`, correção, eliminação, revogação de consentimento.

## Rotação

Qualquer tópico ntfy ou webhook exposto historicamente deve ser **rotacionado** e o valor antigo revogado (não reutilizar default de repositório).
