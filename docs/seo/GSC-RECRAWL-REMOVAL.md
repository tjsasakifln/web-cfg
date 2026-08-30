# GSC recrawl/removal — technical SEO 2026-08-29

This is an operator manifest, not evidence that a Google action was executed.
Do not use the Indexing API for ordinary pages and do not submit a Search
Console removal without explicit authorization from the site owner.

## Decision and authority

- Decision state: `EXECUTE_NOW` for repository and deploy checks;
  `BLOCKED_AUTHORIZATION` for GSC URL Inspection and Removals.
- Executive front: trust and distribution.
- Leverage: one route/crawl contract protects every future publication;
  repeating it 100 times improves the gate instead of creating 100 manual pages.
- Time to evidence: CI is immediate; the first post-deploy HTTP probe is due
  within 15 minutes of promotion; Google recrawl/deindex timing is external and
  must be recorded from GSC rather than estimated.
- Base audited: `origin/main` at
  `72ed3831ba28c9400627cdc9599aa54e9329e178`.
- Runtime authority: nginx/Netcup. `_redirects`, `_headers` and `robots.txt` are
  source manifests consumed by the Netcup contract; Netlify is not a production
  or rollback target.

## Post-deploy HTTP probes

Run read-only probes only after the immutable artifact is promoted:

```bash
curl -sSIL https://confenge.com.br/servicos
curl -sSIL https://confenge.com.br/servicos.html
curl -sSIL https://confenge.com.br/services
curl -sSI https://confenge.com.br/vision
curl -sSI https://confenge.com.br/nexgen
curl -sSI https://confenge.com.br/robots.txt
curl -sSI https://confenge.com.br/sitemap-index.xml
```

Expected results:

- each services alias makes one `301` hop to
  `https://confenge.com.br/servicos-obras-publicas/` and then returns `200`;
- abandoned-brand routes return `410`, never `301` to `/`;
- `robots.txt` advertises only `sitemap-index.xml`;
- the sitemap index and every listed child return `200` XML.

## GSC manifest — authorization required

After the HTTP probes pass, an authorized operator may:

1. Inspect and request recrawl for `/servicos-obras-publicas/` and each of the
   three services aliases so Google observes the direct redirect.
2. Inspect the six URLs below. They are intentionally `noindex` and absent from
   the sitemap; do not request indexing:
   - `/analises-contratos-publicos/aditivo-saldo-art125-item-novo/`
   - `/analises-contratos-publicos/atraso-eventos-sem-comunicacao-contemporanea/`
   - `/analises-contratos-publicos/bdi-composicao-vs-referencia-sc/`
   - `/analises-contratos-publicos/comparaveis-rejeitados-regime-distinto/`
   - `/analises-contratos-publicos/reajuste-aniversario-serie-indice/`
   - `/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/`
3. Use temporary Removals for an analysis URL only if it remains indexed and
   the owner explicitly authorizes the action. Record URL, operator, timestamp,
   GSC result and issue/PR. `noindex` plus recrawl remains the durable signal.
4. Follow the abandoned-entity list in
   `docs/seo/GSC-MANUAL-REMOVAL-URLS.md`; never request indexing for a `410`.

No Search Console, Removals or Indexing API mutation was performed by this
change.

## Verification and rollback

Repository evidence:

```bash
npm run test:sitemap-graph
npm run test:redirects
npm run test:inbound-gates
npm run validate:seo
```

Rollback is a normal revert through the protected `main` pipeline. Do not
restore the obsolete analysis sitemap header, the contradictory per-URL robots
`Allow`, attribution query strings, redirect chains, or Netlify as production.
If an analysis is later eligible to index, its versioned editorial/data gate
must generate the page, sitemap member and coherent robots/header state in one
reviewed change.
