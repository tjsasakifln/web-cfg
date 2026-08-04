# Search Console, URLs for manual action

**Do not** use the Google Indexing API for ordinary content pages.

Generated for entity cleanup after recovery deploy. Status verified on production where noted.

## A. Request removal / mark gone (410 already live)

These return **HTTP 410** on `https://confenge.com.br`. In GSC → Removals (temporary) and/or ensure coverage shows excluded:

| URL | HTTP (prod) | Reason |
|-----|-------------|--------|
| https://confenge.com.br/vision | 410 | Abandoned product |
| https://confenge.com.br/nexgen | 410 | Abandoned product |
| https://confenge.com.br/avcb | 410 | Old entity (AVCB) |
| https://confenge.com.br/avcb-clcb | 410 | Old entity |
| https://confenge.com.br/avcbclcb | 410 | Old entity |
| https://confenge.com.br/clcb | 410 | Old entity |
| https://confenge.com.br/avaliacoes | 410 | Real-estate valuations abandoned |
| https://confenge.com.br/avaliacoes-imobiliarias | 410 | Real-estate valuations abandoned |
| https://confenge.com.br/avaliacao-imovel | 410 | Real-estate valuations abandoned |
| https://confenge.com.br/ia | 410 | Generic AI product abandoned |
| https://confenge.com.br/inteligencia-artificial | 410 | Generic AI product abandoned |
| https://confenge.com.br/automacao | 410 | Generic automation abandoned |

Also submit **Removals** for any `http://` variants and trailing-slash duplicates Google may still list.

## B. Legacy queries still receiving impressions (GSC export 2026-07-30)

Not URLs to delete alone, reinforce entity signal + ensure no live landing:

| Query | Impressions | Notes |
|-------|------------:|-------|
| avcb | 3 | Must not land on indexable CONFENGE page |
| ia | 1 | Ambiguous; ensure /ia stays 410 |

Action: after 410 stable ≥48h, use **URL inspection** on each path above and **Request indexing** is **not** appropriate for 410, use **Removals** + wait for recrawl.

## C. Soft redirects already correct (no GSC removal)

| From | To | Status |
|------|-----|--------|
| /blog | /conteudos/ | 301 |
| /servicos | /#como-atuamos | 301 |
| /contato | /#contato | 301 |
| /privacy-policy | /privacidade/ | 301 |

## D. Operator checklist

1. GSC → **Removals** → Temporary removals for each 410 path (and www/http variants if present).
2. GSC → **Pages** → filter “Excluded” / “Not found” / “Soft 404”, confirm no abandoned path is “Indexed”.
3. Re-export Performance after 14 days; legacy queries (avcb, ia) should decay.
4. Do **not** 301 abandoned entity URLs to home.

## E. Credential for Search Analytics API (observatory)

Optional env for `scripts/revops/search_demand_observatory.py pull-api`:

- `GSC_SITE_URL`, e.g. `sc-domain:confenge.com.br`
- `GSC_CREDENTIALS_JSON`, service account JSON path with Search Console access

Until then: `import-csv --dir seo/gsc-YYYY-MM-DD`.
