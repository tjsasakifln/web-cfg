# Exact residuals (PREPARE-ONLY)

Named shared diffs required for fail-closed isolation:

1. `_headers` path-scoped block for `/piloto/consulta-ocorrencias-publicas/*`
   (`noindex,nofollow,noarchive`, `no-store`, `Referrer-Policy: no-referrer`).
2. `robots.txt` extra `Disallow: /piloto/consulta-ocorrencias-publicas/`
   (parent `/piloto/` was already Disallow).
3. `docs/contracts/public-read-integrity-v1.{md,json,schema.json}` snapshot of
   the consumed extra-cli contract (same pattern as market-answer).

Not changed: `package.json`, `script.js`, global sitemap registries,
`event-registry.json`, `netlify.toml`, offers/Asaas, growth accounting,
contract-analysis pages.

Still pending (out of this wave): keyed live Portal canary; INDEX flip;
sitemap membership; merge; deploy; closing web-cfg#156 / extra-cli#436.
