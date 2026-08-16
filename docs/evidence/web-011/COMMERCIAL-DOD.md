# WEB-011 — Defesa de Margem commercial DoD

Campaign residual after #76 / #79 / #80 / #81 / #82 on `origin/main`
`3ae70c6b0e5b878ccbfc646cffc421a8722ebb98`. This is not a second diagnose
engine.

## Decision

`NEED_MORE_DATA` on ICP × trigger × offer × friction.

Campaign exit: **`BLOCKED`**.

A real page→use→CTA→lead→action/outcome event was not produced. The
recorder fail-closes instead of minting a person, a WON, or INBOUND NOW
from a synthetic 201.

## Outcome

Revalidated the live money asset and pillar. Drove the shipped diagnose
transform (use path). Ran the shipped persist-first / inbound / prod probe
harness. Did **not** POST a fabricated contact and did **not** send
WhatsApp or email.

## Scope

- Audit of `/ferramentas/diagnostico-defesa-margem/` and
  `/defesa-margem-contratos-publicos/`.
- Fail-closed review functions + operator CLI.
- Tests that drive shipped HTML, `diagnoseMargin`, `lead.cjs`, and
  `collect._scrubProps`.

## Out of scope

- New public pages, INDEX flips, or a second DataLake / CRM / crawler.
- Reimplementing persist-first lead or inbound HMAC.
- Merge, deploy, DNS, spend, message send, mass approval, close of #60 / #64.
- Landing PRs #85 / #94 / #95 / #96 / #97.
- SmartLic brand or runtime.

## Live vertical (2026-08-16, two GETs, identical SHA)

| Surface | HTTP | Canonical | robots | Utility before CTA | CTA | fonte / as_of / UNKNOWN | SmartLic |
|---|---:|---|---|---|---|---|---|
| Diagnóstico | 200 | `https://confenge.com.br/ferramentas/diagnostico-defesa-margem/` | `index,follow` | yes | `Quero uma segunda leitura deste contrato` | yes | absent |
| Pillar | 200 | `https://confenge.com.br/defesa-margem-contratos-publicos/` | `index,follow` | offer page (links to Diagnóstico) | segunda leitura link | offer, not diagnose | absent |

Production `/.well-known/build-info.json` commit =
`3ae70c6b0e5b878ccbfc646cffc421a8722ebb98`. Sitemap `<loc>` includes both
URLs. `robots.txt` does not Disallow the money asset.

User job: a contractor recognizes official identity / vigência / signed
value and the UNKNOWN families (reajuste, reequilíbrio, medição, …), then
optionally asks for a human segunda leitura.

BDI is not in the diagnose utility (footer cluster only →
`/auditoria-orcamento-licitacao/`).

## Real loop

`BLOCKED`.

| Prerequisite | Status |
|---|---|
| consented real contact | MISSING — not invented |
| `CONFENGE_INBOUND_WEBHOOK_URL` | UNSET in this shell; Netlify unverified (no Netlify token) |
| `CONFENGE_INBOUND_WEBHOOK_SECRET` | UNSET |
| `OPS_TOKEN` | UNSET |
| Warmbly `CONFENGE_AUTO_SEND_ENABLED=false` | UNKNOWN |

Inbound host observation (not PUBLIC_READY, not INBOUND NOW):

- `POST https://api.confenge.com.br/api/v1/webhooks/confenge/inbound` with `{}`
  → HTTP 401 `invalid inbound signature`.
- `api.warmbly.com` → NXDOMAIN.
- `warmbly.com/health` and `app.warmbly.com/health` → 404.

PII: lead/collect responses drop `nome` / `email` / `telefone` / `mensagem`.
Synthetic `@example.com` is not pipeline.

## Learning

`NEED_MORE_DATA`. Zero real conversations. Do not CHANGE the offer or STOP
the vertical from a missing inbound env.

## Next command

```text
# Netlify production
CONFENGE_INBOUND_WEBHOOK_URL=https://api.confenge.com.br/api/v1/webhooks/confenge/inbound
CONFENGE_INBOUND_WEBHOOK_SECRET=<shared>
# Warmbly
CONFENGE_AUTO_SEND_ENABLED=false
# This shell, to read ops counters
export OPS_TOKEN='<production ops token>'
export CONFENGE_AUTO_SEND_EVIDENCE=OFF
node scripts/site/money_asset_prod_proof.mjs https://confenge.com.br
# Then a consented real visitor uses /ferramentas/diagnostico-defesa-margem/ → segunda leitura.
# Do not invent a person. Do not send WhatsApp/email from this repo.
```

## Commands actually executed

```text
node v24.19.0  npm 11.17.0  python 3.12.3  git 2.43.0
origin/main = 3ae70c6b0e5b878ccbfc646cffc421a8722ebb98  (match observed base)
production /.well-known/build-info.json commit = 3ae70c6b0e5b878ccbfc646cffc421a8722ebb98

# live GET ×2 (identical SHA)
https://confenge.com.br/ferramentas/diagnostico-defesa-margem/  200  robots=index,follow
https://confenge.com.br/defesa-margem-contratos-publicos/       200  robots=index,follow

# inbound fail-closed (no person)
POST https://api.confenge.com.br/api/v1/webhooks/confenge/inbound  {}  → 401 invalid inbound signature
api.warmbly.com → NXDOMAIN

# shipped proofs ×2
npm run test:diagnose-margin     exit 0, 0
npm run test:lead-function       exit 0, 0
npm run test:inbound-handoff     exit 0, 0
npm run probe:money-asset:prod   proven_as=capture_only_synthetic ×2
  run1 lead_id=e2a1be4432a6d1c493f2563e
  run2 lead_id=e34abd803275234016bede80
  inbound_now=BLOCKED  (synthetic ≠ commercial)

# shipped use path on live snapshot
selectContract + diagnoseMargin → public_id 83102277000152-2-000626/2026
official=12 unknown=13 as_of=2026-08-14T11:27:51+02:00

# this residual
node scripts/site/test_margin_defense_commercial_dod.mjs   exit 0 ×2
node scripts/money_asset/audit_commercial_dod.mjs          exit 2  learning=NEED_MORE_DATA exit=BLOCKED
```

Chrome/Playwright was not installed in this environment (`/opt/google/chrome/chrome` missing). The use path was driven through the shipped `selectContract` / `diagnoseMargin` on the live snapshot, not a browser click.

## Residual

1. Consented real lead (or real rejection) from the money asset.
2. Netlify inbound URL + secret.
3. Warmbly auto-send proven OFF.
4. `OPS_TOKEN` to read `ops?action=inbound_handoff`.
5. Human-route action and outcome — UNKNOWN until then.
6. Issues #60 and #64 stay OPEN.

## Rollback

Revert this branch. No public HTML, robots, sitemap, INDEX, DNS, or env
changed.

## Refs

ADR-STRAT-002, RUNTIME-AUTHORITY, MARKET-CAPTURE-OS,
`docs/ops/WARMBLY-INBOUND.md`, `docs/ops/LEAD-HANDLING.md`.
Issues #60 #64. PRs #85 #94 #95 #96 #97 (context only; not landed).
