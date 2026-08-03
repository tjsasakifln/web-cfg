# Google Search Console — Exact Owner Actions

**Status:** `READY_FOR_GSC_OWNER_ACTION` until authenticated steps below are completed by the property owner.

Automation in this environment does **not** hold Google OAuth credentials for confenge.com.br. No indexation claim is made from sitemap presence alone.

## Property

- Site: `https://confenge.com.br`
- Preferred property type: Domain or URL-prefix `https://confenge.com.br/`

## One-time setup

1. Sign in to [Google Search Console](https://search.google.com/search-console) as the verified owner.
2. Confirm property verification (DNS TXT or HTML file already on Netlify if previously set).
3. Open **Sitemaps**.
4. Submit (only after indexable URLs exist post human approval):
   - `https://confenge.com.br/sitemap-index.xml`
   - If segmented files are linked from the index, do not double-submit children unless required by the UI.
5. Open **Settings → Users and permissions** and grant restricted access to the ops account used for API ingest (optional).
6. For API ingest (optional): create OAuth client / service account with Search Console scope and store secrets outside the repo (`GSC_CREDENTIALS_JSON` env on the operator machine only).

## Weekly (when authenticated)

```bash
# On operator machine with credentials:
npm run pseo:gsc:ingest
# Expect writes under data/seo/gsc/ and docs/seo/GSC-OPPORTUNITY-REPORT.html
```

Use the report to:

- Find queries in positions 5–20
- Fix titles/CTR
- Detect cannibalization
- Find discovered-but-not-indexed URLs
- Prioritize Wave 2+

## After Wave 1 human approval + deploy

1. Deploy site with only HUMAN_APPROVED / INDEXABLE URLs in sitemaps.
2. Submit/refresh sitemap-index.
3. URL Inspection on 3–5 sample URLs per archetype (editorial + pSEO).
4. Do **not** declare “indexed” until GSC shows coverage — sitemap inclusion ≠ indexation.

## Evidence to attach later

- Screenshot or export of sitemap submission status
- Coverage report date range (≥28 days before aggressive prune)
- `data/seo/gsc/` JSON from ingest

## Blocker statement

Until steps 1–4 (setup) complete, terminal engine status remains at most:

`READY_FOR_TIAGO_APPROVAL` (pre-publish) or `READY_FOR_GSC_OWNER_ACTION` (post-publish without GSC).
