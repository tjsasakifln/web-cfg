# Home LCP stabilization — causal diagnosis

**State:** `DEFER / NO SAFE REMEDY ACCEPTED`

**Main:** `81c600b7c26dcc606d3a03e648ecd9820d9c1c37`

**Classification:** `D — MIXED_CAUSES`
**PR #536:** `HOLD_WAITING_FOR_DEPENDENCY`

## Decision

The home has a real performance-headroom deficit and the CI runner also shows
external scheduling variance. The investigated home-only delivery transform
materially improved the distribution, but it did not satisfy the stricter,
pre-registered engineering acceptance target. The implementation was reverted;
no performance PR was opened, no threshold changed and no check was bypassed.

Visitor job: see the approved first fold consistently before normal runner
noise can cross the existing 2,000 ms LCP limit. This is `VALIDATE -> DEFER`,
owned by the public-performance lane, with trust and automation leverage. It
does not claim traffic, QCO or revenue impact.

## Reproduction loop

Exact local protocol:

```sh
CHROME_PATH=/path/to/chrome-152 \
  node scripts/site/run_lighthouse.mjs --only=/ --runs=3 --label=<fixed-label>
```

Chrome `152.0.7977.8`, Node `22.23.2`, Lighthouse `13.4.1`, mobile
`390x844@2`, clean Chrome/profile for every retained sample, local gzip server,
unchanged 2,000 ms gate. Deterministic replay of GitHub artifacts `9773422790`
and `9774058381` reproduces both red evaluations.

The minimal local baseline was `1951.452, 1950.148, 1950.369 ms`: green, but
with only about 49 ms headroom. A later balanced before block reproduced
`2010 ms` locally.

## Exact LCP and phase evidence

LCP is text, invariant across local and CI:

```text
section.hero > div.container > div.hero-copy > p.hero-lead
```

There is no LCP resource request, so resource-load delay and resource-load
duration are `N/A`. Loopback TTFB was about 3-8 ms and did not cause the CI
failure. Archivo was preloaded at high priority, uses `font-display: swap`, and
the font audit passed without findings.

Real removable work existed before LCP:

- global CSS (about 21 KB wire);
- home CSS (about 10 KB wire);
- a serial 1 KB token stylesheet discovered by `@import`;
- the frozen deferred app bundle could execute a long task near the simulated
  paint boundary.

The worst CI trace also contained an external component: all post-document
requests began about 225 ms late despite a 2.9 ms document response, and about
1,002 ms was attributed to `Unattributable` work. The harness retained and
failed that sample correctly; no methodological bug or legitimate retry rule
was found.

## Remote comparison

All predefined samples were retained:

| Surface | LCP ms | TTFB ms |
|---|---|---|
| CI attempt 1 | 1956.717; 2103.216; 1951.730 | loopback, <8 |
| CI attempt 2 | 1806.504; 2040.171; 1951.330 | loopback, <8 |
| main local | 1951.452; 1950.148; 1950.369 | 28-43 observed breakdown |
| production | 2659.616; 2420.008; 2269.321 | 602.879; 82.761; 75.905 |
| Deploy Preview #536 | 2148.952; 1501.483; 1659.480 | 1423.395; 76.332; 65.522 |

Cloudflare/Netcup and Netlify cold-edge variance is real, but it cannot explain
the required CI gate because that gate serves `_site` from loopback.

## Final balanced experiment

The final experimental artifact preserved the frozen source bytes
(`styles.css`, `styles-tokens.css`, `script.js`), derived one home-only CSS
bundle in exact `tokens -> global -> home` cascade order, preloaded the frozen
app bundle, and executed it after one paint through a tiny external loader.
No visible source, copy, hierarchy, CTA, proof, brand or threshold changed.

Pre-registered order: `A B B A / B A A B`, three retained samples per block.

Before (12):

```text
1951.648, 2010, 2010, 1954.368, 1950.359, 1060.202,
1951.669, 1950.228, 1950.224, 1955.363, 1950.557, 1950.158
```

Candidate (12):

```text
1651.942, 1650.048, 1710, 1352.014, 1800.302, 1860,
1650.906, 1650.096, 1710, 1652.036, 1650.362, 1650.014
```

Candidate maximum was 1,860 ms versus 2,010 ms before; payload fell from
153,299 to 152,450 bytes; CLS remained 0; Lighthouse accessibility and SEO
remained 100. Paired maximum improvements were 300, 94.368, 241.669 and
303.327 ms.

The candidate failed the pre-registered engineering acceptance because one
sample exceeded 1,850 ms and one paired maximum improved by less than 100 ms.
Those are operational targets, not changes to the repository's 2,000 ms gate.
The implementation was therefore removed rather than promoted on a favorable
distribution.

## Boundaries preserved

- No merge and no PR.
- PR #536 branch untouched and still on HOLD.
- No home design, copy, geometry, CTA, proof, branding or UX direction change.
- No LCP threshold, required check, path filter, retry policy or measurement
  window change.
- No weakening of accessibility, SEO, CLS, payload or analytics contracts.
- Shared frozen files remained unchanged; all experimental implementation was
  removed before this evidence-only branch state.

Machine-readable evidence:
[`HOME-LCP-STABILIZATION-2026-08-31.json`](HOME-LCP-STABILIZATION-2026-08-31.json).
