# authority-content-quality/1.0

Review recommendation on top of `contract-analysis-publication-gate/1.0`.
It does not mint a sixth publication state and never grants INDEX.

## Weights

| Dimension | Weight |
|---|---:|
| profundidade documental | 20 |
| singularidade/novidade | 20 |
| utilidade decisória | 20 |
| integridade epistêmica | 15 |
| cálculos/engenharia | 10 |
| comunicação | 10 |
| SEO/citabilidade/manutenção | 5 |

Total is the integer sum of `(dimension_score * weight) // 100`. No rounding.

## INDEX_READY_HUMAN_REVIEW

Requires all of:

- score >= 90
- no dimension below 80
- every hard gate true
- zero P0/P1 findings
- zero unsourced material claims
- zero reputational red flags
- zero near-duplicates

Score never compensates a failed hard gate.

Below 1.500 non-boilerplate words: `DEPTH_REVIEW_REQUIRED` (does not auto-advance).
Long low-density text is `REJECT`.

Delivered pages that pass stay `HUMAN_REVIEW_PENDING` + `PUBLISHABLE_NOINDEX`
until a hash-bound human approval. This campaign does not call `approve_one`.
