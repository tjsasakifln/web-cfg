# Nurture por intenção

## Trilhas (5 mensagens cada)

| Track | Intenção | Oferta |
|-------|----------|--------|
| `contrato` | Contrato sob pressão | Contract Defense |
| `edital` | Edital em análise | Bid Room |
| `operacao` | Rotina B2G | Diretoria B2G |

Templates: `data/nurture/tracks.json`

## Fluxo

1. POST `/.netlify/functions/nurture?action=subscribe` com `{ email, track, consent: true }`
2. E-mail de confirmação (Resend) — double opt-in
3. GET confirm com token → status `active` + 1ª mensagem (day 0)
4. POST `?action=tick` com `OPS_TOKEN` (cron diário) envia devidas
5. Unsubscribe link em todo e-mail → suppression list
6. POST `?action=stop_commercial` quando lead vai a reunião/proposta/won/lost

## Env

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Envio real |
| `NURTURE_FROM_EMAIL` | From (default nurture@confenge.com.br) |
| `OPS_TOKEN` | tick / list / stop_commercial |
| `NURTURE_TOKEN_SECRET` | Segredo dedicado de 32+ caracteres para selar token de unsubscribe no store |
| `NURTURE_TOKEN_SECRET_PREVIOUS` | Segredo anterior durante uma rotação controlada; não usar como configuração permanente |
| `NURTURE_ADVANCE_WITHOUT_RESEND=1` | Dev/test only |

Novas inscrições falham fechado sem `NURTURE_TOKEN_SECRET`. O token de
confirmação só existe durante a montagem do e-mail; o token de unsubscribe é
persistido com AES-256-GCM e AAD ligada ao `subscription_id`. Registros legados
com `_unsub_raw` são migrados para o formato selado no próximo envio.

Para rotacionar, mova o valor atual para `NURTURE_TOKEN_SECRET_PREVIOUS`, gere
um novo `NURTURE_TOKEN_SECRET` e mantenha ambos até que todas as inscrições
ativas tenham sido processadas ao menos uma vez. O envio que abre com a chave
anterior sela novamente com a atual. Remover a anterior antes dessa passagem
faz os registros ainda não migrados falharem fechado. Um rollback de chave usa
a configuração inversa (antiga como atual, nova como anterior). Um revert para
código sem leitor de tokens selados não é rollback seguro de dados; preserve o
leitor ou faça uma migração explícita.

Landing: `/nurture/` · Sair: `/nurture/sair/`

## Cron sugerido (diário)

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" \
  "https://confenge.com.br/.netlify/functions/nurture?action=tick"
```
