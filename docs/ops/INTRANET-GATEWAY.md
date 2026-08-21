# `/intranet` gateway (prepare-only)

`/intranet` on the public Netlify site is a **temporary 302** hop to the Control
Center host `https://ops.confenge.com.br/`. web-cfg stays a public static site.
This is not a reverse-proxy, not a 200 rewrite, and not a 301.

## Redirect source of truth

Rules live only in `_redirects` (copied into `_site`). Do not duplicate path
rules in `netlify.toml`.

```
/intranet     https://ops.confenge.com.br/         302
/intranet/*   https://ops.confenge.com.br/:splat   302
```

Existing `/ops/` on `confenge.com.br` is a different, already-noindex RevOps
surface. Do not redirect or replace it as part of this gateway.

## Activation

These rules are prepared, not published. Do not merge to `main` or production-
deploy until:

```
ACTIVATION_GATE=OPS_HOST_AUTHENTICATED_AND_HEALTHY
```

That gate means the ops host is authenticated and healthy. This repository
does not probe `ops.confenge.com.br`, does not store credentials, and does not
call a private DB to evaluate the gate.

## Indexing

`/intranet` is not a public page. Keep it out of sitemaps, public nav,
structured data, and indexable HTML. `robots.txt` disallows `/intranet`;
`_headers` send `X-Robots-Tag: noindex, nofollow` on the hop.
