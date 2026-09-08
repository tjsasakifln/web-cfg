# Registro técnico de operadores (LGPD) — CONFENGE site

**Não publicar segredos.** Este arquivo lista nomes de operadores, finalidades e bases — não tokens.

| Operador | Finalidade | Dados | Base | Transferência | Status config |
| --- | --- | --- | --- | --- | --- |
| CONFENGE (controlador) | Atendimento comercial B2G | Lead completo | Consentimento / procedimentos preliminares | BR | ativo |
| Netcup / VPS controlado pela CONFENGE (nginx + Node + filesystem privado) | Servir site, executar intake, persistir leads e amostras de eventos | Lead; telemetria sem PII; logs técnicos | Contrato de operação / legítimo interesse segurança | Conforme contrato/DPA da infraestrutura | ativo em produção |
| Netlify (adapter/preview legado) | Compatibilidade temporária de código; não é host, storage ou rollback de produção | Nenhum dado novo deve ser persistido pelo plano canônico | N/A no plano canônico | N/A no plano canônico | legado, não autoritativo |
| Cloudflare (borda e DNS do domínio público) | Entregar todo o tráfego do site e proteger a origem | IP da conexão e metadados técnicos de requisição | Legítimo interesse operação e segurança | Cloudflare | ativo em produção; 100% do tráfego público |
| Resend (e-mail transacional) | Notificar ops de novo lead e confirmar aceite | Nome, contato, jornada, protocolo | Consentimento / operação | Conforme Resend | ativo em produção com `RESEND_API_KEY` no runtime |
| Asaas (meio de pagamento) | Cobrança e conciliação da oferta comercial paga | Identificadores de cliente e de cobrança, valor, status, referência externa | Execução contratual / obrigação legal de guarda | Conforme Asaas | mapeado, NAO ativado: `ASAAS_MODE=disabled`, `production_checkout_enabled=false`, nenhuma chave de producao configurada (docs/ops/ENV-VARS.md:76,81) |
| Webhook ops autenticado | Notificar canal privado | Payload operacional do lead | Operação | Conforme destino | **requer** `OPS_WEBHOOK_URL` (+ secret) |
| ntfy autenticado (opcional) | Notificação push ops | Resumo lead | Operação | Conforme host ntfy | **requer** `NTFY_URL` + `NTFY_TOKEN` — sem tópico público |
| Cloudflare Turnstile | Antiabuso no formulário | Token de desafio; IP no verify | Legítimo interesse segurança | Cloudflare | ativo no formulário publicado; o release bloqueia artefato sem site key |
| Meta WhatsApp | Canal se titular clicar wa.me | Apenas o que o titular envia no app | Ação do titular | Meta | link estático no site |
| Plausible / GA4 (opcional) | Analytics | Eventos sem PII | Legítimo interesse minimizado | Conforme provedor | opcional; coletor 1ª parte já ativo |

## Retenção

- Leads: padrão 730 dias (`LEAD_RETAIN_DAYS`), depois eliminação elegível.
- Analytics: um registro por evento (caminho, tipo de evento, sessão técnica, hash de IP truncado, timestamp) no filesystem privado host-owned; prazo padrão 90 dias (`ANALYTICS_RETAIN_DAYS`).
- Nurture: assinatura com e-mail, hash do e-mail, trilha, consentimento e trilha de envio; prazo padrão 730 dias (`NURTURE_RETAIN_DAYS`).
- Aceite de oferta: IP e user-agent brutos no armazenamento protegido, conforme o aviso público de leads.
- Logs de runtime: retenção operacional do nginx/systemd no host Netcup.

## Direitos do titular

Canal: tiago.sasaki@confenge.com.br — acesso/exportação por `lead_id`, correção, eliminação, revogação de consentimento.

## Rotação

Qualquer tópico ntfy ou webhook exposto historicamente deve ser **rotacionado** e o valor antigo revogado (não reutilizar default de repositório).
