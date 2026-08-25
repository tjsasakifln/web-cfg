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
| `NURTURE_ADVANCE_WITHOUT_RESEND=1` | Dev/test only |

Novas inscrições falham fechado sem `NURTURE_TOKEN_SECRET`. O token de
confirmação só existe durante a montagem do e-mail; o token de unsubscribe é
persistido com AES-256-GCM e AAD ligada ao `subscription_id`. Registros legados
com `_unsub_raw` são migrados para o formato selado no próximo envio.

Landing: `/nurture/` · Sair: `/nurture/sair/`

## Cron sugerido (diário)

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" \
  "https://confenge.com.br/.netlify/functions/nurture?action=tick"
```
