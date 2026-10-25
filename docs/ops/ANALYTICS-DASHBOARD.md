# Dashboard operacional mínimo (definições)

## Fontes

1. **Coletor 1ª parte** `POST/GET /api/web/collect` — runtime portátil Netcup/nginx, eventos sem PII. `/.netlify/functions/collect` permanece apenas como alias compatível.
2. **Campos no lead persistido** — UTMs, landing, journey, referrer (não vão ao analytics como PII).
3. **Analytics externo**: a decisão versionada em `data/ops/third-party-conversion-decision.v1.json` está em `DEFER`. A presença de `gtag` no navegador não autoriza exportação. A coleta própria continua sendo o destino vigente. Confirmar propriedade, fluxo web, consentimento e configuração antes de habilitar qualquer envio externo.

## Conversões distintas (não contar clique decorativo como lead)

| Conversão | Evento | Critério |
| --- | --- | --- |
| Lead persistido | `lead_persisted` + API 201 | protocolo retornado |
| Ativação WhatsApp | `whatsapp_click` com journey/cluster | clique em CTA; nunca qualificação comercial |
| E-mail | `email_click` | mailto ou copiar e-mail |
| Envio edital | form success journey=`edital` | lead_id |
| Problema contratual | form success journey=`contrato` | lead_id |
| Diagnóstico B2G | form success journey=`operacao` | lead_id |

Closed-loop fixture report (visit → qualified opportunity → revenue): [docs/revops/CLOSED-LOOP.md](../revops/CLOSED-LOOP.md). Production qualified/proposal/won stay Warmbly-observed; the CI report never reads production.

## Métricas do painel

- sessões, origem (utm_source/medium/campaign), landing pages
- CTR de CTA (cta_click / cta_view quando instrumentado)
- início formulário, conclusão, abandono por etapa (step 1→2 sem submit)
- conversão por jornada e por página
- leads por origem / cluster / campanha (store)
- falhas técnicas (`lead_form_backend_error`, 5xx)
- tempo até atendimento (observação Warmbly read-only; ausência é `UNKNOWN`)
- proporção formulário × WhatsApp × e-mail

## Consulta de saúde da coleta

```bash
# health
curl -sS https://confenge.com.br/api/web/collect
```

O GET confirma disponibilidade do endpoint, não o recebimento de eventos. Testes de gravação devem usar armazenamento isolado e serviços externos substitutos. Não publique um `page_view` fictício no coletor real para testar saúde: ele pode entrar nos indicadores comerciais.

## Acompanhamento focal de 25/10/2026

Na rotina comercial existente, acompanhar uma única rota: `/conteudos/aditivo-empreitada-por-preco-global/` → contato persistido → oportunidade qualificada → proposta e avanço comercial. A origem fica no registro do pedido; `lead_id`/`receipt_id` relaciona a captura com o recebimento no Warmbly. A qualificação e as etapas posteriores exigem evidências do proprietário comercial. Cliques e eventos de navegador não preenchem essas etapas.

A referência histórica, os testes e os limites desta entrega ficam em [MEDICAO-CONTATO-2026-10-25.md](../revops/MEDICAO-CONTATO-2026-10-25.md). Reutilizar esta leitura e a carteira existente, sem novo painel ou rotina paralela.
