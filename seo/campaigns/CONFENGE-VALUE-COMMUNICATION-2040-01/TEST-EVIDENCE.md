# Test evidence

## Commands

```bash
npm test
npm run build:site
npm run validate:seo
npm run audit:public-artifact
```

## Results (campaign run)

| Suite | Result |
| --- | --- |
| `pseo:test` | 91 passed, 2 skipped |
| `test:analytics` | ANALYTICS_UNIT_OK |
| `test:pseo-attribution` | PSEO_ATTRIBUTION_OK + WHATSAPP_E2E_OK |
| `test:brand` | 14/14 OK |

## Brand gates added

`scripts/site/test_brand_contract.py` + `npm run test:brand`:

- brand/proof/cases integrity
- home copy + form fields
- offer pages + canonicals
- forbidden phrases (with negation allowance)
- radar empty state
- pillar commercial bridges
- sitemap offers
- FAQ JSON-LD sync

## Snapshot integrity fix

Filled missing `evidence_kind` on 5 problem_service rows; recomputed `dataset_hash` / checksums / registry alignment (required for fail-closed snapshot).


## Skeptic remediation (hub regeneration)

After initial PR, `build:site` overwrote hand-edited hubs. Fixed at source:

- `scripts/pseo/build.py`, decision-first inteligência + durable radar empty state
- `scripts/pseo/render.py`, `render_hub` empty CTA; problem_service WA/limit scrub
- `scripts/pseo/html_shell.py`, confenge_help eyebrow “Atuação adequada”
- `scripts/pseo/score.py`, cta_label “Revisar esta oportunidade”

Re-verified: brand 15/15, wave0+semantic 33 passed, build:site ok.
