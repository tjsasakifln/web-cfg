# Contrato mínimo de contexto dos CTAs — POS-INB-20260911/01

Marca e superfície: CONFENGE / https://confenge.com.br.

As campanhas 02, 04, 05 e 07 alteram o HTML das suas páginas. Esta campanha não as sobrescreve. O runtime de captura já honra os campos abaixo. Use-os; não invente query params, eventos ou identidade.

## Destino do pedido

- Com JavaScript: `POST /api/web/lead` (alias compatível `/.netlify/functions/lead` e `POST /api/web`).
- Recibo (`lead_id` / `receipt_id`) só depois da persistência durável.
- Sem JavaScript: o formulário da home não finge protocolo. WhatsApp (`https://wa.me/5548988344559`) e `mailto:tiago.sasaki@confenge.com.br` são intenção de contato, não recebimento.

## Campos que o servidor já aceita

Obrigatórios: `nome`; um canal válido (`telefone` ou `email`); `estagio` (necessidade atual, editável); `consentimento` (tratamento da solicitação, independente de analytics/marketing/cookies).

Opcionais: `empresa`, `mensagem`, `urgencia`, `document_intent=secure_channel_request`. Sem upload. Sem CNPJ, contrato público ou escada de licitação para demanda privada.

Origem (primeiro toque, congelada): `origem`, `origin_url`, `landing_url`, `landing_page`, `utm_source|medium|campaign|content|term`.

Contexto atual (pode evoluir): `estagio`, `jornada`, `cta_id`, `asset_id`, `route_family`, `tema`.

Envelope: `correlation_id`, `session_id`, `idempotency_key`.

## Atributos HTML já suportados

Somente valores admitidos. O servidor valida strings, URLs e allowlists; o HTML não deve copiar parâmetros arbitrários da query.

| Atributo | Uso |
|---|---|
| `data-cta-id` | Identificador do CTA (token curto, sem PII) |
| `data-route-family` | Família de rota / serviço |
| `data-asset-id` | Ativo de origem |
| `data-asset-family` | Família do ativo quando existir no contrato source-to-service |
| `data-event-name` | Nome já admitido no registry |

`href` de WhatsApp e e-mail não persistem lead. Clique sem POST não gera protocolo.

## Regras

1. Necessidade atual (`estagio`) é distinta da origem (`origem` / `landing_url`).
2. Navegação interna e UTM interno não reiniciam a campanha de primeiro toque.
3. Recusa de cookies ou analytics não bloqueia o POST.
4. Contexto ausente é omitido. Não invente serviço, CNPJ, preço ou qualificação.
5. O browser não declara `synthetic`, pagamento ou qualificação. Só o servidor autentica prova.

Máquina-legível: [cta-context-contract.json](./cta-context-contract.json).
