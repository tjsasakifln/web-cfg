# Fragment: piloto inventory

CAMPAIGN_ID=09
ISSUE_OWNER=589

- target_path: `data/offers/piloto-checkout-decision.v1.json` and `scripts/offers/piloto-decision.cjs`
- operation: `append_url_decision` (only if the integrator parks the canary under `/piloto/` instead of promoting straight to `/ferramentas/`)
- stable_key: `/piloto/prontidao-tecnica-obra-privada/`
- dependency: #251 owner; expected_html_pages today is 24 and fail-closed
- test: `node tests/offers/test_piloto_decision.mjs`
- rollback: restore expected_html_pages=24 and the frozen EXPECTED_URLS list

Recomendação: **não** colocar o canário em `/piloto/`. O inventário está travado em 24 URLs. Preferir promoção para `/ferramentas/prontidao-tecnica-obra-privada/` com família própria.

Se o owner de #251 autorizar o estacionamento temporário:

1. append `{ "url": "/piloto/prontidao-tecnica-obra-privada/", "decision": "DEFER" }`
2. `expected_html_pages: 25`
3. mirror the URL in `EXPECTED_URLS` inside `piloto-decision.cjs`
4. keep `noindex,nofollow,noarchive`
5. do not add price, checkout or Asaas
