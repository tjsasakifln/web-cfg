# NFR release contract — security, performance and accessibility

Date: 2026-08-29

Decision state: `EXECUTE_NOW`

Executive front: public-surface trust and inbound reliability

Time to evidence: local artifact + PR checks; production browser canary immediately after promote

Leverage: trust, automation, distribution, customer

Initial audit SHA: `72ed3831ba28c9400627cdc9599aa54e9329e178` (`origin/main` after the first `git fetch --all --prune`)

Effective PR base SHA: `83bcce42cdd742a98583d14ce69c581b472137fa` (`origin/main` after the final fetch and clean rebase)

Branch: `goal/10x10-nfr-security-performance-a11y-20260829`

## Visitor job and hypothesis

The visitor must be able to read, compare, use a tool and request the next step on `confenge.com.br` without arbitrary inline execution, avoidable loading delay or an inaccessible control. The hypothesis is that fail-closed release contracts protect qualified commercial opportunities by preventing a new page or asset from silently expanding security, performance or accessibility debt.

One hundred repetitions improve the system: each new artifact is censused against generated exact CSP hashes, immutable-cache eligibility, the critical-route Lighthouse matrix, the full price/capture axe cohort and rendered keyboard/layout gates. This is automation rather than 100 manual audits.

## Security evidence

### Contemporary reconciliation of #410

The issue body is stale in one precise respect: current `main` and production no longer contain `script-src 'unsafe-inline'`. The current policy authorizes 24 unique executable-inline bodies by SHA-256 and keeps `script-src-attr 'none'`. The residual `style-src 'unsafe-inline'` was real.

This branch removes that residual. The artifact census currently contains:

- 262 HTML files;
- 234 executable inline script occurrences / 24 unique hashes;
- 29 inline style-block occurrences / 9 unique hashes;
- 934 `style` attribute occurrences / 57 unique hashes.

The build now regenerates both script and style hashes. `style-src` retains only `'self'`, `'unsafe-hashes'` and the exact hashes; no script or style `unsafe-inline` remains. The CSP source line is 5,304 bytes, below the new fail-closed 7,168-byte cap. The Netcup renderer splits any configuration literal above 3,000 bytes into nginx map variables and concatenates them at response time; `nginx -t` and the E2E probe prove the public CSP remains byte-identical while every generated config line stays below nginx's 4 KiB lexer boundary. A regression test proves that hash refresh is idempotent and repairs non-canonical header indentation.

Artifact browser canary:

```text
CSP_BROWSER_OK mode=artifact routes=6 violations=0 style_inline=blocked turnstile=allowed youtube_nocookie=allowed
```

The six routes cover home, deliveries, capture form, tool, private ops and a YouTube nocookie surface. The canary rejects any browser CSP violation and confirms Turnstile and YouTube nocookie remain allowed.

### Production-only finding and cache control

The live canary against the base SHA found one blocked `script-src-elem` request per critical route from `https://static.cloudflareinsights.com`. The repository does not ship that script; the edge injects it for browser user agents. CSP was correctly fail-closed and was not widened.

The versioned fix adds `no-transform` to the revalidatable HTML default. Cloudflare documents that `Cache-Control: no-transform` prevents automatic Web Analytics script injection in its [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/) and [setup documentation](https://developers.cloudflare.com/web-analytics/get-started/). This keeps the remedy in the immutable Netcup/nginx release artifact instead of an unversioned dashboard mutation.

`BLOCKED_EXTERNAL`: a zero-violation live result for this candidate cannot exist before the branch is merged and promoted. Required post-promote command: `npm run test:csp-browser:live`. Expected result: six routes, zero violations, inline styles blocked, Turnstile allowed and YouTube nocookie allowed.

### Header and cache contract

- HSTS is at least one year with `includeSubDomains; preload` on apex content and both redirect servers.
- `frame-ancestors 'self'` and XFO `SAMEORIGIN` remain aligned.
- `nosniff`, strict-origin referrer policy, permissions policy, `object-src 'none'`, `form-action 'self'`, `base-uri 'self'` and HTTPS upgrade are mandatory.
- HTML defaults to `no-cache, max-age=0, must-revalidate, no-transform`.
- `/.well-known/build-info.json` remains revalidatable; `/ops/*` remains `no-store`.
- `immutable` is accepted only for exact content-addressed assets; mutable `/assets/*` and 404 fallbacks revalidate within one day.

No new public origin, analytics host, PII field, crawler, identity model or commercial runtime was introduced.

## Performance evidence

Static budgets did not increase:

| Asset class | Raw | Gzip level 6 | Release cap |
| --- | ---: | ---: | ---: |
| CSS | 112.59 KiB | 22.66 KiB | 80 KiB gzip |
| Own JavaScript | 64.40 KiB | 19.55 KiB | 40 KiB gzip |

The Lighthouse contract now repeats all eight critical money routes three times and fails any run below performance 95, above LCP 2,000 ms, above CLS 0.05 or above TBT 200 ms. The existing global family matrix, image and SEO checks remain in force. A focused runner writes separate evidence and cannot omit `/`; it exists to diagnose without overwriting the full committed matrix.

The runner no longer discards a home result above the LCP limit and retries for a favorable sample. Exactly three results are retained for every critical route, and each row records Chromium's benchmark index so host instability remains visible in the evidence. A score-independent browser preflight runs before the measured matrix; it does not retry or discard any measured result.

Final isolated mobile lab matrix: Lighthouse 13.4.1 with Chrome 152.0.7977.8, 46 retained runs over 30 pages. All eight money routes were measured three times:

| Route | Minimum performance | Maximum LCP | Maximum CLS | Maximum TBT | DOM elements | Maximum transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 100 | 1,590 ms | 0 | 35 ms | 565 | 83,385 B |
| `/entregas/` | 99 | 1,590 ms | 0 | 0 ms | 724 | 89,454 B |
| `/conteudos/documentos-reequilibrio-obra-publica/` | 100 | 1,590 ms | 0 | 0 ms | 347 | 78,338 B |
| `/diretoria-b2g/` | 100 | 1,590 ms | 0 | 1 ms | 478 | 81,687 B |
| `/ferramentas/diagnostico-defesa-margem/` | 100 | 1,590 ms | 0 | 15 ms | 236 | 82,638 B |
| `/diagnostico-b2g-expansao/` | 99 | 1,590 ms | 0 | 15 ms | 309 | 85,137 B |
| `/casos/` | 100 | 1,590 ms | 0 | 35 ms | 185 | 65,113 B |
| `/especialista/tiago-jun-sasaki/` | 100 | 1,590 ms | 0 | 1 ms | 222 | 82,163 B |

Across the complete matrix, minimum performance was 99, maximum LCP was 1,590 ms and maximum TBT was 60 ms. The historical home p75 TBT contract remained stricter than the campaign criterion and passed at 35 ms; the maximum first-party long task was 119 ms. Critical routes additionally fail above 800 DOM elements, 150 KiB transferred or a font-display score below 1.

The largest supplemental page was `/casos/modelo-relatorio-inteligencia-licitacoes/` at 855 DOM elements and 91,340 B transferred; it still scored 99 with 1,590 ms LCP. Critical-route image-delivery estimates were 6.2–9.5 KiB, principally the content-addressed logo, and render-blocking estimates reached 700 ms while observed LCP remained within 1,590 ms. No web font is shipped. Those theoretical savings do not justify deleting substantive content or churning frozen CSS/JavaScript before the 2026-09-16 hash-pin expiry; the new DOM, payload and font contracts make future regression fail closed.

An initial run during a 16-core host load average of 15–19 produced non-monotonic TBT/long-task inflation across otherwise static/light routes. Raw traces attributed the inflation to both layout and the same small first-party bundle while unrelated Chromium processes consumed the host. A focused Chrome 152 diagnosis further isolated a one-process cold-start outlier followed by normal samples. These runs are diagnostic evidence, not release samples; no code, budget or threshold was weakened in response.

## Accessibility evidence

Static accessibility checks pass for landmarks, skip link, language, form labels, consent, reduced motion and focus. Rendered UI checks pass for JS-off content, 200%/400% zoom, first-tab skip link, visible focus, mobile menu Escape, form error text, form-step focus, keyboard traversal and CLS.

The touch-target gate was strengthened from a 24 px floor to a 44 × 44 px contract for primary controls. The sitewide renderer checks 19 critical routes at six widths. It found and then correctly excluded only the intentionally offscreen, `tabindex=-1` anti-spam honeypot; all visitor-operable controls pass 44 × 44 px.

Final full axe matrix: 69 risk routes × two viewports (390 × 844 and 1,440 × 1,000) = 138 page audits in 259 seconds, with critical 0, serious 0, moderate 0 and minor 0. Sampling is off, exceptions are unsupported, and all 192 omissions have a recorded non-risk reason.

The duplicate landmark name found at baseline on one editorial route was fixed at the renderer: mid-content and final CTAs now have distinct accessible names, with a regression test and generated-page updates.

The design-token contrast contract now keeps seven canonical foreground/background pairings at or above 5.0:1, leaving margin above WCAG AA's 4.5:1 normal-text floor. The smallest measured pairing is muted text on the soft surface at 5.01:1.

The fail-closed inbound gate also passes on the final artifact: 75 indexable pages, 21 declared families, 0 errors, priced-offer capture 10/10 and no analytics PII expansion.

## Data, analytics, rollback and architecture

- Data owner/contract: public HTML and header contracts are owned by `web-cfg`; market facts/identity/provenance remain SELECT-only contracts from `extra-cli`; commercial action/outcome remains Warmbly.
- Analytics: no analytics payload or event was added. CSP violation details remain local test output and contain no lead data or free text.
- Rollback: revert this PR. The previous CSP/cache policy and generated-page labels return together; there is no data migration, external storage or runtime handoff.
- Affected ADR: no boundary change. ADR-STRAT-002 and RUNTIME-AUTHORITY remain unchanged; production remains the automatic `main -> site-ci+pSEO -> immutable artifact -> Netcup/nginx stage -> atomic origin promote`, with Cloudflare as the public cache/edge and never a second application runtime.
