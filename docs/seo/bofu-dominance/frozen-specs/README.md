# Frozen BOFU pillar specs (PREPARE-ONLY)

Campaign `CONFENGE-WEB-BOFU-FROZEN-PILLAR-SPECS-01`. Exclusive trees only.
This campaign **must not** mutate pillar HTML, `script.js`, CSS, analytics, sitemap, robots, redirects, content-service-map or offer code.

- `earliest_safe_action_at`: `2026-09-16`
- corresponding issue: #128 `LANDED_AWAITING_LIVE_EVIDENCE`
- PR #159: `authorizes_html_edit=false`, `source_kind=LIVE_JOB_OK`, BOFU `observe_only`
- extra-cli #435 COMPARABLE / #437 PARTIAL: `publication_authorization=false` / `national_claim_authorized=false`

## Specs

- [aditivos-obras-publicas](aditivos-obras-publicas.md) — `/aditivos-obras-publicas/`
- [medicoes-glosas-obras-publicas](medicoes-glosas-obras-publicas.md) — `/medicoes-glosas-obras-publicas/`
- [reequilibrio-obras-publicas](reequilibrio-obras-publicas.md) — `/reequilibrio-obras-publicas/`
- [auditoria-orcamento-licitacao](auditoria-orcamento-licitacao.md) — `/auditoria-orcamento-licitacao/`
- [diagnostico-b2g-360](diagnostico-b2g-360.md) — `/diagnostico-b2g-360/`
- [diagnostico-pre-licitacao](diagnostico-pre-licitacao.md) — `/diagnostico-pre-licitacao/`

## Apply gate

Application is refused while `now < 2026-09-16` **and** issue #128 is not evidentially closed.
Shipped entry: `python3 -m scripts.bofu_dominance.frozen_specs` (mutate always false here).
