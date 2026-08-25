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
| `NURTURE_ADVANCE_WITHOUT_RESEND=1` | Dev/test only |
| `NURTURE_RATE_WINDOW_MS` | Janela antiabuso (default 1 hora) |
| `NURTURE_RATE_MAX_IP` | Máximo por IP/janela (default 5) |
| `NURTURE_RATE_MAX_FP` | Máximo por fingerprint/janela (default 8) |

Landing: `/nurture/` · Sair: `/nurture/sair/`

## Cron sugerido (diário)

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" \
  "https://confenge.com.br/.netlify/functions/nurture?action=tick"
```
