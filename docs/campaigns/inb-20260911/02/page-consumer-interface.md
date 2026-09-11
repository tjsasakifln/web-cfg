# Interface mínima de captura — INB-20260911/02

Marca e superfície: CONFENGE / https://confenge.com.br. Consuma o contato já existente. Não crie formulário, CRM, UTM interno nem nomes de evento novos.

## Destino

- Pedido recebido: `POST /api/web/lead` (o runtime também expõe `/api/web`).
- Recibo ao visitante: `lead_id` / `receipt_id` só depois da persistência durável.
- Alternativa sem JavaScript: `action` nativo do form + WhatsApp (`https://wa.me/5548988344559`) + `mailto:tiago.sasaki@confenge.com.br`.
- Fallback WhatsApp após falha de POST é intenção de contato (`whatsapp_click`), não recebimento.

## Atributos aceitos (já honrados pelo servidor)

Obrigatórios: `nome`; `telefone` ou `email` válido; `estagio` (necessidade editável); `consentimento` (tratamento da solicitação).

Opcionais: `empresa`, `mensagem`, `urgencia`, pedido de canal seguro (`document_intent=secure_channel_request`). Sem upload. Sem campos de contrato público, CNPJ ou escada B2G para demanda privada.

Origem (primeiro toque, não sobrescrever): `origem`, `origin_url`, `landing_url`, `landing_page`, `utm_source|medium|campaign|content|term`.

Contexto atual (pode evoluir): `estagio`, `jornada`, `cta_id`, `asset_id`, `route_family`, `tema`.

Envelope: `correlation_id`, `session_id`, `idempotency_key`.

`data-*` de CTA: `data-cta-id`, `data-route-family`, `data-asset-id`, `data-asset-family`, `data-event-name` apenas com nomes já admitidos.

## Eventos canônicos por ato

| Ato | Nome | Camada |
|---|---|---|
| Página / interação | `page_view` / `cta_click` / `content_to_service` | page_view / engagement |
| Ferramenta concluída | `tool_complete` | completion |
| Clique WhatsApp / e-mail | `whatsapp_click` / `email_click` | engagement |
| Solicitação recebida | `lead_persisted` (não `lead_form_success`) | lead |
| Handoff aceito | `handoff.status=DELIVERED` → semântica `handoff_accepted` | servidor; não admitir no browser |
| Resultado comercial | `qualified_lead` / `pipeline` | observed-only Warmbly; ausente = `UNKNOWN` |

Não admitir `qualified_lead` ou `pipeline` no `confengeTrack`. Não tratar 200 intermediário como entrega Warmbly.

## Consentimento

`consentimento` autoriza tratar a solicitação. Recusa de analytics/marketing, storage bloqueado ou cookies ausentes não impedem o POST.

## Idempotência e recibo

Mesma `Idempotency-Key` → um contato. Protocolo só após persistir. Persistência ok + handoff pendente continua recibo verdadeiro e entrega downstream não afirmada.
