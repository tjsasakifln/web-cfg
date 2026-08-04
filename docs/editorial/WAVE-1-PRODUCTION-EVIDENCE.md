# Wave 1 production evidence (post fail-closed remediation)

- **Deploy commit:** `c0a2ad9393830bf449d932379879923cfc88fb58`
- **build-info:** https://confenge.com.br/.well-known/build-info.json
- **Terminal:** `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS`

## Production checks (2026-08-02)

| Check | Result |
|-------|--------|
| Wave 1 sample pages HTTP 200 | yes |
| robots | `noindex,follow` on Wave 1 + hubs |
| WhatsApp + mailto present | yes |
| sitemap-editorial.xml locs | **0** |
| sitemap-jurisprudencia.xml locs | **0** |
| sitemap-inteligencia.xml | empty (pSEO 0 publishable) |
| consolidar `/conteudos/servico-executado-sem-termo-aditivo/` | noindex |

## Evidence artifacts
- Screenshots desktop/mobile: `seo/editorial-evidence/screenshots/`
- Deep review ≥30%: `seo/editorial-evidence/deep-review/DEEP-REVIEW-30PCT.md`
- Conversion smoke (shipped script.js → collect): `seo/editorial-evidence/CONVERSION-SMOKE.log` (if present) + code path
- Env limit Lighthouse/Axe: `seo/editorial-evidence/ENV-LIMIT.txt`
- URL table: `seo/editorial-evidence/WAVE-1-URL-TABLE.md`
- Tests: `npm run editorial:test` → 14 passed

## Unlock
Named human must run `scripts/editorial/approve_cli.py` per page, see FINAL and WAVE-1-APPROVALS.

## Conversion smoke (shipped path)
- `npm run test:analytics` runs `seo/scripts/test_analytics_pii.mjs` + `seo/scripts/test_editorial_analytics.mjs`
- Loads real `script.js` in VM with `data-content-type=lei_14133`
- Fires: legal_article_view, editorial_page_view, whatsapp_click, editorial_whatsapp_click, email_click, editorial_email_click
- Asserts no PII leak on click events
- Log: `seo/editorial-evidence/CONVERSION-SMOKE.log`
