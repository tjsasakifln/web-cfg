# Funil fechado visita → oportunidade → receita

Visitor analytics and Warmbly commercial stages stay two layers, joined only by stable non-PII ids. Qualified / proposal / won are observed inputs. They are never derived from `page_view`, CTA, form or `lead_persisted`.

```mermaid
flowchart LR
  view["view"] --> cta["CTA"]
  cta --> start["form start"]
  start --> step1["step1"]
  step1 --> step2["step2"]
  step2 --> persisted["persisted lead"]
  persisted -.->|"not a qualified opportunity"| raw["raw message / lead"]
  persisted --> qualified["qualified opportunity"]
  qualified --> proposal["proposal"]
  proposal --> won["won sale"]

  subgraph visitor ["web-cfg: analytics, no PII"]
    view
    cta
    start
    step1
    step2
    persisted
  end

  subgraph commercial ["warmbly: observed stages"]
    qualified
    proposal
    won
  end
```

Join keys (prefixes, never email / phone / free text):

| Entity | Prefix | Field |
| --- | --- | --- |
| session | `sess-` | `session_id` |
| lead | `lead-` | `lead_id` |
| opportunity | `opp-` | `opportunity_id` |
| proposal | `prop-` | `proposal_id` |
| sale | `sale-` | `sale_id` |

CI proof: `scripts/revops/fixtures/closed-loop-synthetic.v1.json` and `npm run revops:closed-loop`. Production counts stay out of this fixture report.
