# EVIDENCE — CONFENGE-WEB-INBOUND-INDEX-CONVERSION-03

## P0 Market Answer SC

Class: `CODE_PROVEN`

- Visitor surfaces (title, H1, pergunta, resumo, meta, OG, JSON-LD, breadcrumbs, first fold, labels) name Santa Catarina and do not use Brasil / nacional / mercado brasileiro / média nacional.
- Grain remains valor integral nominal; custo/km is refused.
- Period, n=5038, P25, mediana, P75, fonte, método, as_of, cobertura COMPLETE, missingness 25/5063 and limitações are visible.
- Comparáveis and contract drill-down stay limited (payload NOT_COMPARABLE; refs are identifiers, not a combinatorial URL set).
- Scope-aware gate: UF=SC does not wait on extra-cli #302; a national geography still requires #302.
- Approval token `OWNER_APPROVAL_MARKET_ANSWER_SC_INDEX_2026_08_17` / `approved_by=OWNER_CONFENGE` bound to:
  - payload_content_hash `568880b7eacf30e2adaf7481945fa50cfc77039be10b27ffc6af0959bf6c6d9d`
  - rendered_content_hash `185dcd038951689ef1482973c7bdc51d858c01b77bfeb460a2d05e2ece8d39fa`
- Index flip limited to `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/` (`index,follow` + `sitemap-inteligencia.xml`). Query filters stay noindex and off-sitemap.
- Stale data cannot publish a new INDEX version; LKG preserves a matching healthy pair; stale approval is `STALE_APPROVAL`.
- Tests: `python3 -m pytest tests/market_answers` — 54 passed.

## P1 catalog / journey

Class: `CODE_PROVEN`

- Frozen registry: 800000 / 2000000 / 1500000×6=9000000 / 1250000×12=15000000.
- Extra R$10k is private and cannot serialize on `publicCatalog()`.
- Flags default off: catalog public false, ASAAS_MODE=disabled, production checkout/webhook/real money false.
- Preview pages under `/piloto/ofertas/` are noindex; prices visible; CTAs are “Solicitar contratacao” / “Verificar capacidade”; no generic payment link.
- Eligibility → capacity → immutable terms → sandbox create. Created objects are not payment/receita. Onboarding refused before confirmation.
- No Asaas network, no stored key, no hardcoded provider URL.
- Tests: `node tests/offers/test_offers.mjs` green.

## Live (2026-08-17)

Class: `LIVE_PROVEN` for the SC Market Answer only.

Two probes of `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/` after merge `#113` / SHA `6cc46a1a99f1af4c20778f5fcfa947d4758aaf94`:
HTTP 200, build-info commit match, robots `index,follow`, sitemap-inteligencia loc only, title/H1/schema Santa Catarina, n=5038 and limitations visible, no SmartLic, no PII in URL.

## Not claimed

- LIVE_PROVEN, INBOUND NOW, qualified pipeline, receita: not claimed from fixtures.
- #84 #88 #60 #64 remain open.
- Lockfiles and PRs #92/#93 were not edited.
