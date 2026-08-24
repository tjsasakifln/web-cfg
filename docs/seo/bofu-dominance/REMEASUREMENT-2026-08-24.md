# BOFU remeasurement — 2026-08-24 UTC

Issue: #292

Decision: **VALIDATE**

Front: **INBOUND ENGINE**

Leverage: **data**

Time to evidence: this dated measurement, with a same-method SERP follow-up by 2026-09-09.

## Result

The live GSC pull succeeded with 75 returned, query-redacted rows and a provider
maximum date of 2026-08-18. The immutable export is in
`seo/gsc-2026-08-24/`; `seo/gsc-2026-08-09/` remains untouched.
The UTC pull timestamp falls on 2026-08-23 in the property timezone
(`America/Sao_Paulo`), making the observed provider date 5 calendar days old at
pull time and 2 days behind the requested window end. The readiness rule uses
that explicit property-local date, not the later UTC document date.

The SERP sentinel was also rerun for all 11 families. It used one representative
query per family, while the 2026-08-19 comparator used up to four. That makes a
directional observation possible but a change claim impossible. All 11 families
are therefore `AMOSTRA_INSUFICIENTE`, never a filled-in number or an inferred
zero. `official_position_claimed` remains `false`.

| Family | Fresh sentinel | Historical family sample | Decision diff |
|---|---|---|---|
| aditivos | observed | not observed | AMOSTRA_INSUFICIENTE |
| bid-readiness | not observed | not observed | AMOSTRA_INSUFICIENTE |
| carteira-operacao | not observed | observed | AMOSTRA_INSUFICIENTE |
| defesa-margem | not observed | observed | AMOSTRA_INSUFICIENTE |
| diagnostico-expansao | not observed | not observed | AMOSTRA_INSUFICIENTE |
| diretoria-b2g | not observed | not observed | AMOSTRA_INSUFICIENTE |
| edital-proposta | observed | observed | AMOSTRA_INSUFICIENTE |
| medicoes-pagamentos | not observed | observed | AMOSTRA_INSUFICIENTE |
| orcamento-bdi | observed | observed | AMOSTRA_INSUFICIENTE |
| partner-integrity | not observed | not observed | AMOSTRA_INSUFICIENTE |
| reequilibrio | not observed | not observed | AMOSTRA_INSUFICIENTE |

The Search Analytics artifact is current enough for the GSC mechanism, but the
combined BOFU decision remains closed until the same query set and collector
class are rerun for all families. The machine-readable owner, criteria and
fallback are in `data/bofu-dominance/remeasurements/2026-08-24/decision.json`.

## 2026-09-16 fallback

If the like-for-like census is still absent, the six frozen pillars remain
unchanged. No HTML mutation, hash rebaseline, robots/canonical change or early
date edit is authorized. A dated human decision is recorded and the comparable
census is rescheduled; `UNKNOWN` does not turn into permission through age.

## Architecture, analytics and rollback

No public HTML, canonical, robots, analytics event or PII contract changes.
`confenge.com.br` remains the only surface and the files consume measurement
evidence without creating a crawler or identity model. Rollback is a revert of
this measurement commit; historical exports remain immutable.
