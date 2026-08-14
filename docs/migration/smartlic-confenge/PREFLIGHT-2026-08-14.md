# Preflight — SmartLic → CONFENGE (#62)

**As of:** 2026-08-14T20:36:25Z (live probes) / 2026-08-14 working tree  
**web-cfg origin/main:** `d739c8e7fe99fc91638eec03c09e65200c98988a` (Merge PR #59, 2026-08-09)  
**This branch:** `feat/smartlic-confenge-migration-62`  
**Rule:** observed fact vs `UNKNOWN`. No invented GSC/backlink/deploy numbers.

## Issues read

| ID | State | Role |
|---|---|---|
| [web-cfg#62](https://github.com/tjsasakifln/web-cfg/issues/62) | OPEN | this campaign |
| [web-cfg#61](https://github.com/tjsasakifln/web-cfg/issues/61) | OPEN | parent epic |
| [web-cfg#60](https://github.com/tjsasakifln/web-cfg/issues/60) | OPEN | first vertical (must precede redirects onto it) |
| [SmartLic#2111](https://github.com/tjsasakifln/SmartLic/issues/2111) | OPEN | decommission / archive |
| [SmartLic#2115](https://github.com/tjsasakifln/SmartLic/issues/2115) | OPEN | minimum redirect bridge — waits on this manifesto |

`docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md` is cited by SmartLic#2111. **ABSENT** on `origin/main` (verified `git cat-file`). Contents not invented.

## Git / PRs / deploy

| Claim | Evidence | Verdict |
|---|---|---|
| No open PRs on web-cfg | `github__list_pull_requests` state=open → `[]` | observed |
| No open PRs on SmartLic | same tool → `[]` | observed |
| Production host | `https://confenge.com.br/` HTTP/2 200, `server: Netlify`, `x-nf-request-id` present | observed |
| Production SHA | `GET https://confenge.com.br/.well-known/pseo-build.json` → `web_cfg_sha` `a13d6a6506738595a2b8d9cbbf37b3f0dd23dde5`, `generated_at` 2026-08-14T18:13:25Z. That object is **not** in this clone and is **not** an ancestor of `origin/main` `d739c8e7`. | observed marker; git identity **UNKNOWN** relative to this repo |
| Netlify publish | `netlify.toml` `command = npm run build:site`, `publish = _site` | observed in repo |
| `npm run lint` / `typecheck` | `package.json` has neither key | observed **absent** |

Unrelated dirty files on `feat/organic-acquisition-engine` were **not** carried into this branch (stashed `inteligencia/...` only). AIOX untracked dirs remain untracked and are out of this PR.

## Live SmartLic runtime (2026-08-14T20:36:25Z)

Probe log: captured under implementer scratch `preflight/live-probes.txt`.

| Host | Observed |
|---|---|
| `https://smartlic.tech/` | HTTP/2 **404**, `server: railway-hikari`, `x-railway-fallback: true`, JSON body 101 bytes |
| `https://api.smartlic.tech/` | HTTP/2 **404**, same Railway fallback |
| `https://www.smartlic.tech/` | DNS `69.46.46.117` → `*.up.railway.app`. TLS handshake **fails**: cert SAN does not include `www.smartlic.tech` |
| DNS apex | `69.46.46.88` |
| DNS api | CNAME `1us7c4ob.up.railway.app` |
| DNS www/app | CNAME `1376dcda.up.railway.app` |

**Implication:** live HTML crawl of historical SmartLic URLs is impossible from this environment. Inventory is from the local donor clone `/mnt/d/smartlic-clean` + versioned GSC dumps committed there (`gsc-perf-pages-28d.txt` git `22ca3d06` 2026-04-27).

## Live CONFENGE (same probe window)

| URL | Observed |
|---|---|
| `https://confenge.com.br/` | 200, Netlify, HSTS, CSP |
| `/robots.txt` | `Allow: /`; sitemap `https://confenge.com.br/sitemap-index.xml`; Disallow `/ops/`, `/.netlify/`, `/piloto/` |
| `/sitemap.xml` | urlset present (home + commercial + conteudos) |
| `/defesa-margem-contratos-publicos/` | 200 |
| `/reequilibrio-obras-publicas/` | 200 |

Canonical/robots/JSON-LD of migrated **targets** are asserted from the built/source artifact in this PR, not re-declared as live-complete here.

## Search Console / analytics / backlinks

| Source | Observed | Gap |
|---|---|---|
| CONFENGE `seo/gsc-2026-07-30/` and `seo/gsc-2026-08-09/` | present, CONFENGE property | not SmartLic |
| SmartLic `gsc-perf-pages-28d.txt` / `gsc-perf-queries-28d.txt` | 1000 URL rows + 395 queries after clean; commit 2026-04-27 | exact GSC window beyond "28d" **UNKNOWN**; mixed query+page dump |
| SmartLic `docs/seo/top-20-blog-baseline-2026-04-30.md` | 28d 2026-04-04–2026-05-01; site 276 clicks / 18.645 impr | older than page dump; used as secondary |
| Live GSC API | not invoked | **UNKNOWN** |
| SmartLic `docs/seo/backlinks-log.md` | table empty; all listings **Pendente** | referring domains **UNKNOWN** / 0 confirmed |
| Ahrefs/Moz/etc. | not available | **UNKNOWN** |

## Existing web-cfg artefacts that are **not** SmartLic inventory

- `docs/seo/URL-DISPOSITION-MATRIX.*` — CONFENGE internal
- `data/organic/legacy-url-inventory.json` — CONFENGE host leftovers (`/blog`, `/avcb`, `/trabalhe-conosco`)

Do not treat those as SmartLic URL decisions.

## #60 vertical readiness (precondition for redirects onto it)

Indexable 200 surfaces used as ready targets (source + sitemap membership verified in-repo):

- `/defesa-margem-contratos-publicos/`
- `/reequilibrio-obras-publicas/`
- `/aditivos-obras-publicas/`
- `/medicoes-glosas-obras-publicas/`
- `/atrasos-prorrogacao-obras-publicas/`
- `/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/`
- `/conteudos/atraso-pagamento-contrato-publico-suspender/`

`/lei-14133-obras/reequilibrio-reajuste-repactuacao/` is a closer legal article but ships `noindex,follow`. It is **not** a ready redirect target.

## Decision of this preflight

Proceed with snapshot-based manifesto. Mark every live GSC/backlink/SmartLic HTML metric `UNKNOWN`. Do not authorize SmartLic#2115 cutover until a target + DNS/proxy/TLS path exists (currently Railway fallback 404).
