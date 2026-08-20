# Rollback

This wave never deploys. If a later wave merges the consumer:

1. Keep `data/public-integrity-consumer/flag.json` `"enabled": false`.
2. Remove or 404 `/.netlify/functions/public-integrity-consult` by reverting
   `netlify/functions/public-integrity-consult.cjs`.
3. Landing/result stay `noindex` via `_headers` and `robots.txt` Disallow.
   Do not add the paths to any sitemap while rolling back.
4. Delete stored tokens: `POST/DELETE` `action=delete` with the opaque token,
   or wipe the `public-integrity-consumer` blob store / `PUBLIC_INTEGRITY_STORE_DIR`.
5. TTL already expires results after 3600s; store records after 86400s.

Revert commit on `campaign/CONFENGE-WEB-PUBLIC-INTEGRITY-CONSUMER-PREPARE-01`
if the PR has not merged. After merge, revert the PR; do not blanket-redirect
the landing to `/`.
