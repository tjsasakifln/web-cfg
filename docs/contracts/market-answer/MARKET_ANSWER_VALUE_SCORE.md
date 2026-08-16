# MARKET_ANSWER_VALUE_SCORE / 1.0

Versioned, auditable, explainable. Implemented in
`scripts/market_answers/score.py`.

## Components

`demand`, `data_quality`, `answerability`, `singularity`, `utility`,
`freshness`, `citation_potential`, `commercial_fit`, `maintenance_cost`.

Each component is 0–1 or `UNKNOWN`. `maintenance_cost` is stored as cost
(higher = worse) and inverted before the weighted sum.

## Demand

If GSC/search evidence of the question is missing, the component is
`UNKNOWN` and is **excluded** from the weighted total. It is never coerced
to 0. The canary question currently has **UNKNOWN** demand.

## Method

Normalized weighted sum over known components. Not multiplicative. Reason
codes are emitted per component (`demand_UNKNOWN`, `answerability_sufficient`,
`maintenance_cost_acceptable`, …).

## Who decides what

- extra-cli may supply factual `data_quality` / `freshness` inputs.
- web-cfg owns demand, editorial, commercial fit and INDEX.
- extra-cli never authorizes `PUBLISHABLE_INDEX`.
