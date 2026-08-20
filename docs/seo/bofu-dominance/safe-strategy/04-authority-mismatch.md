# AUTHORITY_MISMATCH — recorded, not “fixed” by invention

Copy on the three pages must not invent a number, term, SKU, terms version, or checkout state to close these gaps. Authority files stay read-only.

## MM-01 — Diagnóstico terms id

- Published: `/comercial/termos-diagnostico-b2g/` shows `CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1` (founder-approved-v1, deferred counsel review, hash `sha256:5fd69a314d6b6aab74ba2ab87ae5e90d12ade6360193a18275c9c3377e1fd778`).
- Registry: `CFG-TERMS-B2B-2026-08-17-v1` (`scripts/offers/registry.cjs` `AUTHORITY.terms_version` and `scripts/offers/terms.cjs`).
- Production mapping also pins founder id in `scripts/offers/providers/config-production.cjs` (`TERMS_VERSION = "CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1"`). That file is outside the exclusive area.
- Action in this campaign: keep linking to the published terms page. Do not print the registry terms id as if it were the published instrument. Do not mint a new terms version.

## MM-02 — Checkout form vs flags

- Published: `/diagnostico-b2g-expansao/` hosts `#contratar` posting to `/.netlify/functions/offer-terms-accept` then `/.netlify/functions/offer-checkout` for `CFG-DIAG-EXP-v1`. Button copy: “Contratar Diagnóstico B2G - R$ 8.000”.
- Flags: `CONFENGE_OFFER_CATALOG_PUBLIC=false`, `production_checkout_enabled=false`, `ASAAS_MODE=disabled`.
- Action: do not strip or rewire `offer-terms-accept` / `offer-checkout` / OTP (`otp-input`, `btn-confirmar`). Add visible capacity/eligibility honesty: public catalog and production checkout are off. Next best action is enquadramento, not a generic payment link.

## MM-03 — Bid Room is a job, not a SKU

- Registry `PUBLIC_OFFER_IDS` has no Bid Room offer. #88 prices only Diagnóstico and Diretoria Flex/180/365.
- Action: no standalone Bid Room price, SKU, or invented WIP quota on `/bid-room-licitacoes-obras/`. Recurring staffing of this job, when sold, is the Diretoria Bid Room WIP (four concurrent accepted opportunities) — that number lives on Diretoria, not as a Bid Room SKU.

## Explicit non-actions

- Do not restore Extra / R$ 10.000 / `CFG-DIRB2G-EXTRA`.
- Do not turn checkout on.
- Do not edit frozen pages.
- Do not resolve MM-01 by editing `comercial/termos-diagnostico-b2g/` (outside exclusive area).
