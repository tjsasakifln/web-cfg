# CONFENGE site excellence

- Contract: `CFG-SITE-EXCELLENCE-2026-08-29-v1`
- Base SHA: `83bcce42cdd742a98583d14ce69c581b472137fa`
- Commit: `4cfa6adca47ae2691aae2c687bbe4649ad7ecb36`
- Overall: **MEASURED_PASS**
- Addressable: **10/10**
- Global excellence claim: **10/10**
- External blockers: **0**

| Dimension | State | Evidence | Owner |
|---|---|---|---|
| Value proposition and copy | MEASURED_PASS | copy-contract: measured pass; route=derived census; viewport=not applicable | web-cfg #327 |
| Information architecture | MEASURED_PASS | published-route-census: measured pass; route=derived census; viewport=not applicable<br>internal-link-reachability: measured pass; route=derived census; viewport=not applicable | web-cfg public artifact; web-cfg #481 |
| Responsive behavior | MEASURED_PASS | responsive-geometry: measured pass; route=/entregas/; viewport=1024x768, 1200x800, 1366x768, 1440x900, 1661x939, ... +6 in JSON artifact | web-cfg #468 |
| Conversion | MEASURED_PASS | conversion-capture: measured pass; route=/, derived census; viewport=1000xauto, 1120xauto, 1240xauto, 1366xauto, 1661xauto, ... +4 in JSON artifact<br>turnstile-coverage: measured pass; route=capture-form census; viewport=all | web-cfg #267; web-cfg #482 |
| Offer truth | MEASURED_PASS | offer-truth: measured pass; route=derived census; viewport=not applicable<br>price-geometry: measured pass; route=; viewport= | web-cfg #343; web-cfg #468 |
| Trust and proof | MEASURED_PASS | permissioned-proof: measured pass; route=permissioned-proof registry; viewport=not applicable | web-cfg #328 |
| SEO | MEASURED_PASS | seo-contract: measured pass; route=derived census; viewport=not applicable | web-cfg #61 |
| Editorial originality | MEASURED_PASS | editorial-originality: measured pass; route=derived census; viewport=not applicable | web-cfg #83 |
| Performance | MEASURED_PASS | performance-budget: measured pass; route=/, /404.html, /acompanhamento-contratos-obras/, /analise-cnpj/, /analise-cnpj/r/, ... +42 in JSON artifact; viewport=mobile 390x844 | web-cfg public runtime |
| Accessibility | MEASURED_PASS | accessibility-audit: measured pass; route=/, /acompanhamento-contratos-obras/, /aditivos-obras-publicas/, /assets/data-desk/valor-tipico-contratos-pavimentacao-sc/v1/, /assistencia-tecnica-pericial-engenharia/, ... +46 in JSON artifact; viewport=desktop, mobile | web-cfg public surface |
| Security and privacy | MEASURED_PASS | security-privacy: measured pass; route=/_headers, public artifact; viewport=not applicable | web-cfg public runtime |
| Analytics and RevOps | MEASURED_PASS | analytics-revops: measured pass; route=/entregas/; viewport=390x844 | web-cfg #267; Warmbly downstream |
| Deploy and runtime | MEASURED_PASS | deploy-identity: measured pass; route=/.well-known/build-info.json; viewport=not applicable | RUNTIME-AUTHORITY; web-cfg #466 |
| Freshness | MEASURED_PASS | gsc-freshness: measured pass; route=search observation aggregate; viewport=not applicable | web-cfg #413 |

`BLOCKED_EXTERNAL` is never converted to zero or PASS. It is outside the addressable denominator and withholds the global 10/10 claim, but it does not hard-fail CI or promotion -- no code PR can clear an external blocker (see issue #328). Only `MEASURED_FAIL` blocks CI.
