# Deploy evidence

## Status

`DEPLOY_BLOCKED` / `IMPLEMENTED_DEPLOY_BLOCKED`

No production deploy credentials or Netlify CLI auth were used in this campaign session.

## Local proof

| Check | Result |
| --- | --- |
| `npm test` | PASS (91 pseo + analytics + attribution + brand) |
| `npm run build:site` | PASS (`ok: true`, `_site` assembled) |
| `npm run audit:public-artifact` | PASS (`finding_count: 0`) |
| `npm run validate:seo` | PASS with pre-existing boilerplate warnings on guides |

## Public artifact

- Directory: `_site`
- File count: 2241
- Offers present: `/diretoria-b2g/`, `/diagnostico-b2g-360/`, `/bid-room-licitacoes-obras/`, `/defesa-margem-contratos-publicos/`, `/metodologia-inteligencia/`
- Hash (build): `452193a2fc87f8593a1e07dfce91748126318625c7be018674d93633b922aaf3`

## To deploy

```bash
# Preview (preferred first)
netlify deploy --dir=_site --message "CONFENGE value communication 2040"

# Production (after preview QA)
netlify deploy --dir=_site --prod
```

Then verify: home H1, four offers, form Netlify name `diagnostico-b2g`, WhatsApp CTAs, robots/sitemap, mobile.
