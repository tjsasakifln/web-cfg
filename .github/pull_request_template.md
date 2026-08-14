## Summary

<!-- What visitor/business job does this solve, and why now? -->

## Architecture and acquisition evidence

- Visitor job:
- Executive front: REVENUE NOW / INBOUND ENGINE / MARKET INTELLIGENCE MOAT / COMPOUNDING SYSTEM / SCALE-SUNSET
- Decision state: EXECUTE_NOW / VALIDATE / DEFER / SUNSET / SUPERSEDED
- Leverage: revenue / distribution / data / automation / trust / customer
- Time to evidence:
- Data owner and versioned contract:
- Acquisition/conversion hypothesis:
- After 100 repetitions, what becomes easier/better?
- ADR affected: none / link

## Checklist

- [ ] Read `docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md`
- [ ] Keeps `confenge.com.br` as the only public brand/domain; no SmartLic brand, handoff, CTA or runtime
- [ ] Does not add a crawler, parallel DataLake or competing identity model
- [ ] Uses normalized source `CONFENGE_WEB` and preserves attribution/next action when applicable
- [ ] Security: no secrets; lead path validated (`npm run test:lead-function` + `test:secrets-scan`)
- [ ] Conversion: form / WhatsApp / mailto / confirmation validated
- [ ] Analytics: no PII (`npm run test:analytics`)
- [ ] SEO: canonical, redirects, sitemap and robots validated if touched
- [ ] Public intelligence: distinct utility, source/provenance, freshness and empty/error states
- [ ] pSEO: no wave expansion without editorial/data quality gate
- [ ] Rollback or reversible migration path documented
- [ ] CI green
