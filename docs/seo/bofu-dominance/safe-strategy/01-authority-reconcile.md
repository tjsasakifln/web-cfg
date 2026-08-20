# Authority reconcile — #88 / local registry / flags / published checkout+terms

As of 2026-08-19. Read-only consumers. No edit to `scripts/offers/**`, `data/offers/flags.json`, or `comercial/termos-diagnostico-b2g/`.

## Sources

| Source | Locator | Role |
|---|---|---|
| GitHub #88 | https://github.com/tjsasakifln/web-cfg/issues/88 | Canonical parent for versioned public catalog + contracting |
| Local registry | `scripts/offers/registry.cjs` | Frozen fixture `web-cfg#88/Governance#1-fixture-local` |
| Flags | `data/offers/flags.json` | Catalog/checkout/kill switches |
| Terms snapshot (registry) | `scripts/offers/terms.cjs` | `CFG-TERMS-B2B-2026-08-17-v1`, `PREVIEW_NOT_LEGAL_VALIDATION` |
| Published Diagnóstico terms | `/comercial/termos-diagnostico-b2g/` | Founder-approved production-limited text |
| Extra histórico | `data/offers/private/extra-historical.json` | Private exception only |
| Capacity | `scripts/offers/capacity.cjs` | Full cap 50, 1 slot, 72h hold |

Registry header:

- `authority_source`: `web-cfg#88/Governance#1-fixture-local`
- `authority_version`: `CFG-OFFER-REGISTRY-2026-08-17-v1`
- `terms_version`: `CFG-TERMS-B2B-2026-08-17-v1`
- `scope_version`: `CFG-SCOPE-B2B-2026-08-17-v1`
- `frozen_at`: `2026-08-17`

Issue #88 remains OPEN. Catalog public / Asaas production remain NO_GO (comment 2026-08-17).

## Public offers (APPROVED)

Read via `getOffer` / `listPublicOffers`. Status of all four: `APPROVED`. Kill switch: false. `public: true` inside the registry; **visitor catalog flag is still off**.

| offer_id | public_name | amount_cents | billing | commitment | checkout_mode | capacity |
|---|---|---|---|---|---|---|
| CFG-DIAG-EXP-v1 | CONFENGE - Diagnóstico B2G de Expansão | 800000 | one_time | 0 months; sla 10-15 business days; credit_on_upgrade_cents 200000 / 60 days | detached | not required (units 0) |
| CFG-DIRB2G-FLEX-v1 | CONFENGE - Diretoria B2G Fracionada - Flex | 2000000 | subscription MONTHLY | no minimum; notice_days 30; max_payments null | subscription | required, units 1 |
| CFG-DIRB2G-180-v1 | CONFENGE - Diretoria B2G Fracionada - 180 | 1500000 | subscription MONTHLY | 6 × ; total 9000000; max_payments 6; notice 30 | subscription | required, units 1 |
| CFG-DIRB2G-365-v1 | CONFENGE - Diretoria B2G Fracionada - 365 | 1250000 | subscription MONTHLY | 12 × ; total 15000000; max_payments 12; notice 30 | subscription | required, units 1 |

Visible BRL (derived from cents, not invented): R$ 8.000; R$ 20.000 / mês; 6 × R$ 15.000 (R$ 90.000); 12 × R$ 12.500 (R$ 150.000); credit R$ 2.000.

No Bid Room offer_id exists. Bid Room must not show a price.

## #88 operational scope (Diretoria Flex/180/365 share one scope)

- Contract Defense for **one** active public work/contract.
- Bid Room WIP **up to four** accepted active opportunities. Four is concurrent WIP, not a monthly quota.
- Kickoff ≤90 min; one monthly executive meeting ≤90 min; up to two tactical 30-min meetings/month when needed; asynchronous channel; one-business-day receipt confirmation; shared demand/decision board.
- Fifth item, second simultaneous contract, urgency below the five-business-day reference, or other listed expansions: capacity + addendum.
- Out of standard scope: legal work, filing/representation/influence, execution, financial guarantees, full budget from zero, physical survey/design/ART/RRT/testing/expert work, on-site inspection, full-time dedicated staff.
- Client owns certificates, final document assembly, signatures/filing/portals, internal validation, pricing/margins, technical/legal responsibility.

Diagnóstico Expansão deliverables (authority list only): buyer map, 15 competitors, price panel, expiring contracts, screened active notices, recommendations, executive PDF, spreadsheets, kickoff, final presentation. Not a 90-day implantation plan (that is Diagnóstico B2G 360°, frozen).

## Flags (`data/offers/flags.json`)

```
CONFENGE_OFFER_CATALOG_PUBLIC: false
ASAAS_MODE: disabled
production_checkout_enabled: false
production_webhook_enabled: false
real_money_mutation_enabled: false
```

Capacity invariant from #88: never charge before capacity approval. No capacity means no checkout. Diagnóstico has no commercial slot cap but still requires legality/completeness/conflict/feasibility acceptance before checkout. Recurring Full cap: 50 active slots.

## Extra histórico (must never appear on public pages)

`CFG-DIRB2G-EXTRA-HIST-v1` / internal `CFG-DIRB2G-EXTRA-HIST`, 1000000 cents (R$ 10.000/mês), `serializable_public: false`. Not a coupon. Not in `PUBLIC_OFFER_IDS`.

## Published pages vs registry (before this campaign)

| Surface | Published | Registry / flags | Verdict |
|---|---|---|---|
| `/diagnostico-b2g-expansao/` price | R$ 8.000, pagamento único | 800000 cents, one_time | MATCH |
| `/diagnostico-b2g-expansao/` SKU | CFG-DIAG-EXP-v1 in checkout JS | CFG-DIAG-EXP-v1 APPROVED | MATCH |
| `/diagnostico-b2g-expansao/` SLA | 10 a 15 dias úteis | sla_business_days 10-15 | MATCH |
| `/diagnostico-b2g-expansao/` checkout form | looks live (`offer-terms-accept` / `offer-checkout`) | catalog public false, production_checkout_enabled false | AUTHORITY_MISMATCH |
| `/comercial/termos-diagnostico-b2g/` terms id | `CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1` | `CFG-TERMS-B2B-2026-08-17-v1` | AUTHORITY_MISMATCH |
| `/diretoria-b2g/` prices | none shown | Flex/180/365 exist | copy gap, not a mismatch until a wrong number is printed |
| `/bid-room-licitacoes-obras/` price | none | no SKU | MATCH (must stay none) |

See [04-authority-mismatch.md](04-authority-mismatch.md).
