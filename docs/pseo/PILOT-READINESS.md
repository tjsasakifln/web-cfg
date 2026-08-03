# pSEO pilot readiness (post-recovery)

## Status

`PSEO_PILOT = BLOCKED_ON_DATA_LINEAGE`

Bulk ~1.937 HTMLs **não** serão restaurados.

## O que já existe no repo

- `data/pseo/`: archetypes, markets, agencies, metrics descriptors, registry tooling
- Gates: similarity, human review, naturalness, public artifact isolation
- Capacity to generate pages: **yes** (engine scripts)
- Publishable national pilot pages with singular evidence: **no** until contract-level aggregates with hash + period land in-repo

## Thresholds by archetype (technical)

| Archetype | Min observations | Temporal diversity | Entity diversity | Notes |
|-----------|-----------------:|--------------------|------------------|-------|
| market/segment | 50 contracts | ≥ 4 quarters | ≥ 5 buyers | Volume + ticket quartiles required |
| agency/buyer | 30 contracts | ≥ 3 quarters | n/a (single buyer) | Behavior must differ from national median |
| price band | 40 line items | ≥ 2 years | ≥ 8 suppliers | Method for outliers published |
| risk/edital pattern | 25 cases | ≥ 3 quarters | ≥ 5 agencies | Qualitative codes documented |
| margin decision scenario | 20 linked contract+aditivo pairs | ≥ 2 years | ≥ 5 buyers | Aditivo must be linked in source |
| temporal trend | 8 periods | continuous series | stable filter | No sparse series |

## Pilot selection rule (when data arrives)

1. Join GSC commercial queries (Observatory) × archetype with highest ICP fit.
2. Generate **10–20** candidates max.
3. Keep `noindex` through factual QA, similarity, entity, natural language, conversion review.
4. Human packet page-by-page (same governance as Wave 1).
5. Expand only after impressions + non-zero assisted leads.

## Immediate alternative (shipped)

Until lineage lands: tools + Radar demand + editorial Wave 1 + nurture — not geographic keyword permutations.
