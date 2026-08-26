# Netcup HTTP/SEO parity gate

**Decision:** `EXECUTE_NOW`

**Priority/front:** P0 / INBOUND ENGINE

**State:** `HTTP_SEO_PARITY_GATE_READY / NETCUP_CANDIDATE_NOT_YET_PROMOTED`

**Leverage:** distribution, automation and trust

**Time to evidence:** translator evidence is produced in one build; origin
evidence is produced in one parity run as soon as the candidate IP, TLS and
optional runtime are available.

## Outcome and boundary

The visitor job is to reach the same CONFENGE answer, offer or terminal action
with the same URL semantics, security/indexing policy and response body during
and after a host migration. The acquisition/conversion hypothesis is defensive:
host parity preserves earned organic distribution and qualified-commercial
opportunity capture; this PR does not claim new traffic, leads or pipeline.

`confenge.com.br` remains the only brand and canonical visitor surface.
`RUNTIME-AUTHORITY.md` remains unchanged because Netlify is still production.
No public route, HTML, CTA, analytics event, canonical, `_headers` rule or
`_redirects` rule changes in this PR. `extra-cli` data contracts and Warmbly
commercial action are not changed. Dynamic APIs remain externally owned until
their candidate runtime is available and are probed only when explicitly added.

## Behavior mapping

| Netlify/current behavior | Host-neutral contract | Generated Nginx behavior |
|---|---|---|
| `/*` and path rules in `_headers` | Ordered header selectors with typed cache, content type, X-Robots, CSP and HSTS values | `map $request_uri` in `http {}` plus server `add_header`; original URI survives 404/410 internal body selection |
| `_redirects` 301/302 | Ordered redirect action, force/shadow policy, query preservation and client-side fragment | Ordered regex locations; relative targets remain relative; query is emitted before `#fragment` |
| `_redirects` 200 | Internal rewrite with static-file-first semantics unless forced | `try_files` followed by internal rewrite; `/obrigado*` keeps URL, status 200 and target body |
| `_redirects` 410 to `/404.html` | Gone status plus custom body path | `return 410` with `error_page 410 /404.html` |
| Netlify automatic `404.html` | Required custom-404 invariant inferred from the artifact | `error_page 404 /404.html`; missing pages remain real 404, not SPA/soft-404 |
| Netlify Pretty URLs | Versioned resolution strategy `$uri`, directory, `.html`, `index.html`, then 404 | Deterministic `try_files`; directory normalization remains a relative 301 |
| `https://confenge.netlify.app/*` force rule (also duplicated identically in TOML) | One host-canonization action with merged provenance | Host-only 301 preserves `$request_uri`; identical TOML rule is deduplicated, conflicts fail |
| `/intranet` and `/intranet/*` | Temporary external redirect, 302, static-file-first, runtime proxy forbidden | 302 to `https://ops.confenge.com.br/`, with splat/query; no `proxy_pass`, no 301 |
| Redirect responses combine effective request-path `_headers` with Netlify's generated plaintext response | Effective-selector policy plus a versioned plaintext redirect invariant | Internal status override keeps 301/302 while emitting one `text/plain; charset=utf-8` response; cache, CSP, HSTS, X-Robots and other source headers come from the same `$request_uri` maps |
| `www` and HTTP→HTTPS | Explicit edge ownership, forbidden as an invented HTML canonical rule | No generated `www` or HTTP-upgrade rule; edge behavior is probed separately |
| `/.netlify/functions/*` | `external-runtime-required` | No upstream is generated; parity paths are opt-in when runtime exists |

## Non-trivial rules proved

- Source order is retained for redirect regexes; Netlify static-file shadowing is
  represented with `try_files` before a named terminal action.
- Header maps use `$request_uri`, not the internally rewritten `/404.html`, so a
  missing asset receives the asset cache policy and does not inherit
  `/404.html` X-Robots accidentally.
- Same-origin redirect `Location` remains relative because Nginx
  `absolute_redirect` is disabled and the generated header retains the source
  target; absolute `/intranet` and legacy-host targets stay absolute. A named
  response reached through `error_page 418 =301/302` prevents Nginx from
  injecting a second `text/html` content type while preserving the redirect
  status and plaintext body.
- Original query strings are appended to 200/301/302 rules. Fragments remain in
  the client `Location` only and never enter the server-side path probe.
- The identical belt-and-suspenders TOML host rule is merged into provenance.
  Any different rule for the same source is a conflict and hard-fails.
- Long CSP values are parsed structurally, escaped as Nginx data and tested for
  byte preservation. Nginx variables cannot be injected from input.

## Gate coverage

The parity matrix is derived from the contract and current artifact inventory.
It covers home, money pages, tools/forms, mutable and immutable assets, a
missing asset, robots, every root sitemap, every path redirect/rewrite/410,
query variants, custom 404, thank-you pages, release identity and the GSC
verification file. Optional dynamic paths are explicit.

Compared fields are status, `Location`, cache, CSP, HSTS, X-Robots,
content type, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, selected body SHA-256, canonical and meta robots. Volatile
and transport headers are enumerated with a reason in the JSON report; every
unclassified header is compared by name/value by default, so it cannot disappear
into a generic ignore bucket.

SEO adversarial checks compare sitemap URL sets, robots and representative
canonicals; audit every indexable artifact canonical and bind every indexable
HTML body back to `_site`; reject redirect chains, soft-404 and 410 decay; keep
noindex/private selectors out of sitemaps; bind the critical asset/body matrix
and `artifact_hash` to `_site`; compare GSC verification, analytics signals and
Turnstile key. Turnstile origin evidence requires either canonical live DNS or
HTTPS `--resolve`; an IP/alternate browser origin cannot claim that gate.

## Evidence from this branch

| Gate | Result |
|---|---|
| `npm run test:host-contract` | PASS — 20 tests |
| `npm run host-contract:render` twice | PASS — byte-identical outputs and manifest |
| `npm run host-contract:nginx-test` | PASS — Nginx syntax, container probes for 200/301/302/404/410, body, source-derived cache/CSP/HSTS, content type, query/fragment, Pretty URL and legacy host; full cutover suite also passed through HTTP pre-DNS `Host: confenge.com.br` mode |
| `npm run build:site` | PASS — public artifact audit OK, 484 files, visible parity 75/75, no build errors |
| `npm run test:redirects` | PASS |
| `python3 scripts/site/test_cache_contract.py` | PASS |
| `python3 scripts/site/test_csp_contract.py` | PASS — 262 HTML files, 24 unique authorized inline hashes |
| `npm run validate:seo` | PASS — 75 indexable sitemap URLs, zero errors (existing warnings only) |

Rendered contract evidence for this source revision:

- contract SHA-256: generated by `npm run host-contract:render` and recorded in
  `build/netcup-host-contract/contract.sha256`;
- host architecture version: `confenge-static-nginx/v1`;
- outputs are ignored build artifacts and are never hand-edited or published by
  the Netlify `_site` allowlist.

## PR evidence and rollback

- **Data owner/contract:** `web-cfg`; canonical inputs are `_headers`,
  `_redirects`, the HTTP-behavior subset of `netlify.toml`, static `404.html`,
  robots/sitemaps and `.well-known` identity. No second fact or identity model.
- **Analytics:** no event/tag change and no PII. The parity report compares tag
  signals only; reports contain paths, public headers and hashes.
- **Rollback:** do not promote Netcup. Production remains the known Netlify
  deploy. Revert this PR to remove the build gate; generated files live only in
  ignored `build/` and can be regenerated from canonical inputs.
- **Affected ADR:** ADR-STRAT-002 is honored and not changed. Runtime authority
  is intentionally not updated before a separately authorized DNS promotion.
- **100 repetitions:** each repetition regenerates and verifies the same
  contract, accumulating automation and trust; it does not create 100 manual
  configuration units. Qualified commercial opportunities remain the North
  Star, and this gate protects their acquisition path without claiming them.

## Known residual

No Netcup candidate origin, candidate release SHA, certificate, artifact hash or
runtime identity was supplied to this branch. Therefore no candidate-vs-baseline
or post-DNS report is claimed here. Promotion remains blocked until the
infrastructure pack consumes all generated snippets and the documented parity,
SEO and candidate/live cutover commands pass without `--insecure`.

A diagnostic baseline-vs-itself run on 2026-08-26 intentionally failed when
different Netlify edge responses alternated between the source-current HSTS
(`includeSubDomains; preload`) and the older `max-age=31536000` value. This is
external baseline non-uniformity, not candidate evidence and not a change from
this branch. The strict harness surfaced it; cutover must use a stable/pinned
baseline or wait for edge convergence rather than suppressing the header.
