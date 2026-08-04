# Rollback de produção (Netlify)

## Objetivo

Restaurar o site público a um deploy anterior conhecido sem perda do histórico git.

## Procedimento

1. Identificar deploy atual:  
   `curl -sS https://confenge.com.br/.well-known/build-info.json`  
   Anotar `commit` e `build_time`.
2. Netlify UI → Site → Deploys → localizar deploy com commit desejado (ou “Published deploy”).
3. Abrir o deploy anterior **verde** (build success) → **Publish deploy** (rollback).
4. Validar:
   - `build-info.json` mostra commit esperado
   - Homepage 200
   - `POST /.netlify/functions/lead` com payload sintético (ou 503 se store/env incompatível, documentar)
   - robots/sitemap 200
5. Registrar em `docs/evidence/inbound-10/rollback-evidence.md`: quem, quando, from→to SHA, resultado.
6. Se o rollback foi de emergência, abrir PR de correção a partir do tip e republicar.

## CLI (se `netlify` autenticado)

```bash
netlify api listSiteDeploys --data '{"site_id":"<SITE_ID>"}'
netlify api restoreSiteDeploy --data '{"site_id":"<SITE_ID>","deploy_id":"<DEPLOY_ID>"}'
```

## Limites

- Funções e env vars: rollback de assets não reverte secrets do painel.
- Blobs de leads **não** são apagados pelo rollback de site estático.
- Nunca force-push em `main` como substituto de rollback de CDN.
