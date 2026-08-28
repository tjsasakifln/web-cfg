# Handoff — SmartLic#2115 execute set

Canonical copy: [docs/migrations/smartlic/HANDOFF-2115.md](../../migrations/smartlic/HANDOFF-2115.md).

**Pinned inventory:** `data/migrations/smartlic-url-map/inventory.v2.json`  
**Byte-identical projection:** `data/migration/smartlic-confenge/manifesto.v1.json`  
**SHA-256:** `35aca764cc455fea3031286700e0310315c9bff34fcf41b883cb53e8f9277698`
**Version:** `v2`  
**web-cfg issue:** https://github.com/tjsasakifln/web-cfg/issues/62  
**Execute issue:** https://github.com/tjsasakifln/SmartLic/issues/2115  
**Do not execute against any other file, branch, or unhashed edit.**

### Pin reconciliation 2026-08-16 (six-action inventory)

Supersedes `c2cee836…` (v1) and `3c5a5b7a…` (v2 before WEB-017). 54 HOLD rows stay fail-closed 410. WEB-017 remapped the payment-delay blog onto `/conteudos/atraso-pagamento-contrato-publico-suspender/`. SmartLic#2115 / PR #2135 must re-consume this pin.

Recompute: `python3 -c "from pathlib import Path; import hashlib; print(hashlib.sha256(Path('data/migrations/smartlic-url-map/inventory.v2.json').read_bytes()).hexdigest())"`  
Must match `data/migrations/smartlic-url-map/inventory.v2.sha256` and `data/migration/smartlic-confenge/manifesto.v1.sha256`.

## Scope of this handoff

**Only the ready REDIRECT_301 rows below.** 1.190 RETIRE_410 URLs and 54 HOLD_TARGET_NOT_READY URLs are decided (expected **410**, not 301-to-home) but are **not** an execute list of 301s. If the bridge needs a default for unlisted paths, serve **410**. Never 301 leftover traffic to `https://confenge.com.br/` or `/consultoria-b2g/`.

No SmartLic-branded destination. No SaaS recovery. No Railway token/limit/redeploy. No Netcup application rebuild.

## Ready redirects (execute)

Single hop. HTTPS. Drop query string except the allowlist in the manifesto (`utm_*`, `jornada`, `origem`, `route_family`, `cta_id`, `asset_id`, `correlation_id`, `tema`). Never forward email/phone/name/cnpj.

| legacy_url | target_url | HTTP | owner |
|---|---|---:|---|
| `https://smartlic.tech/blog/aditivos-contratuais-o-que-sao-como-monitorar` | `https://confenge.com.br/aditivos-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/blog/orgaos-risco-atraso-pagamento-licitacao` | `https://confenge.com.br/conteudos/atraso-pagamento-contrato-publico-suspender/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/aditivo-contratual` | `https://confenge.com.br/aditivos-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/mapa-de-riscos` | `https://confenge.com.br/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/matriz-de-riscos` | `https://confenge.com.br/conteudos/matriz-de-riscos-reequilibrio-economico-financeiro/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/medicao` | `https://confenge.com.br/medicoes-glosas-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/reajuste` | `https://confenge.com.br/reequilibrio-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/glossario/reequilibrio-economico-financeiro` | `https://confenge.com.br/reequilibrio-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/perguntas/indice-reajuste-contrato-publico` | `https://confenge.com.br/reequilibrio-obras-publicas/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/perguntas/prazo-pagamento-contrato-publico` | `https://confenge.com.br/conteudos/atraso-pagamento-contrato-publico-suspender/` | 301 | SmartLic#2115 |
| `https://smartlic.tech/perguntas/reequilibrio-economico-financeiro` | `https://confenge.com.br/reequilibrio-obras-publicas/` | 301 | SmartLic#2115 |

Optional host aliases (`www.smartlic.tech`, `http://`) must 301 → the same `https://confenge.com.br/...` target in **one hop** (or 301 to https apex then 301 to target is a **forbidden chain** — collapse to one 301).

## Expected DNS / reverse proxy / TLS

| Item | Required | Status 2026-08-14 |
|---|---|---|
| Target origin | `https://confenge.com.br` (Netlify) | live 200 observed |
| Bridge hostname | `smartlic.tech` (+ www if it still receives traffic) | apex → Railway `69.46.46.88` fallback **404**; www TLS **SAN mismatch** on `*.up.railway.app` |
| Reverse proxy | static 301 map of the 11 rows; default 410 | **not authorized / not deployed** |
| TLS | certificate covering `smartlic.tech` and `www.smartlic.tech` | apex Railway cert; www **fails** |
| Owner | SmartLic#2115 operator (Gage / @devops for DNS) | human |

**Gate: BLOCKED.** Do not change DNS until a named proxy + cert + rollback record exist. This handoff does not authorize Railway usage-limit work.

### Post-#68 revalidation (2026-08-15)

`origin/main` at merge SHA `648b88796a50d331558fab9ac6ebea41c9615e18` carried v1 pin `c2cee836…`. This branch re-pins v2 `35aca764cc455fea3031286700e0310315c9bff34fcf41b883cb53e8f9277698` (11 ready 301s; HOLD fail-closed; WEB-017 remapped payment-delay blog off the work-delay pillar).

Live GET of the 11 ready CONFENGE destinations (twice): 11/11 HTTP 200, canonical host `confenge.com.br`, indexable, no SmartLic brand, no redirect chain, no soft-404. SmartLic production 301s / DNS / TLS / Cloudflare / Railway were **not** changed and were **not** observed. Cutover remains unobserved. #62 stays OPEN. Counterpart SmartLic#2115 / PR #2133 may start the bridge against this pin; web-cfg does not own that deploy.

## Observation window

- **Duration:** 28 days after the first production 301 of this hash.
- **Not started** in web-cfg#62.
- Compare against `docs/migration/smartlic-confenge/BASELINE-2026-08-14.md`.

### Investigate if

- Any ready target returns unexpected 404/5xx (threshold: **1** confirmed request).
- Redirect chain (>1 Location hop) or loop on a ready row.
- Soft 404 (200 with gone/empty body) on a ready target.
- TLS/DNS failure on `smartlic.tech` after cutover.
- Lead capture on a commercial target broken (form/function 5xx or persist miss).
- GSC clicks on the 11 legacy paths drop to **zero for 14 consecutive days** while impressions remain, after indexing lag of 7 days — investigate before rollback.

### Rollback if

- TLS or DNS outage > 30 minutes on the bridge host after cutover.
- ≥1 ready row loops or chains.
- ≥1 ready CONFENGE target 5xx for > 15 minutes.
- Lead persist path down on CONFENGE (`/.netlify/functions/lead`) during the window.

Rollback restores the **last functional CONFENGE release** with `/opt/confenge-web/bin/rollback FULL_SHA` and the **previous DNS/proxy** of `smartlic.tech`. It does **not** redeploy SmartLic as a product.

## Expiry and removal trigger

- Bridge expiry review: **28 days after cutover**, then weekly until removal.
- Remove `smartlic.tech` hosting/DNS only after: observation window complete, no residual priority errors, any later-discovered critical backlinks accepted or remapped, SmartLic#2111 archive gate.
- Temporary cost: DNS + TLS + a static 301/410 edge (should be cents-to-low-dollars; exact invoice **UNKNOWN** until a provider is chosen). Railway app cost should go to **zero** — do not keep the failed app as the bridge.

## Rollback procedure (CONFENGE side)

1. Note current production SHA from `https://confenge.com.br/.well-known/build-info.json` before any later publish.
2. `git revert` of the merge commit of this PR, or `/opt/confenge-web/bin/rollback <FULL_SHA>` per `docs/ops/ROLLBACK.md`.
3. Do not add SmartLic brand, CTAs or runtime back onto confenge.com.br.

## What SmartLic#2115 must not do

- Implement redirects for RETIRE rows (except default 410).
- 301 `/*` to CONFENGE home.
- Recreate FastAPI/Next/Redis/Supabase/billing.
- Execute against an unpinned or dirty manifesto.
