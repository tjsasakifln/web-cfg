# Surface decision

Token: **USE_EXISTING_SERVICE**  
`new_public_landing_created: false`  
Decision state: VALIDATE

This PR does not add a new public landing URL, city page or LocalBusiness node.

## Why this token

CONFENGE already publishes:

- Person entity: `/especialista/tiago-jun-sasaki/`
- National service pages (`/diagnostico-b2g-360/`, `/diretoria-b2g/`, Bid Room, defesa de margem, clusters)

There is no public street address. `areaServed` is Country Brasil / atendimento nacional. DDD 48 on the public phone is contact, not a verified city service area. A regional landing would be page-count without distinct local utility (forbidden city-page farm).

## Alternatives not selected

| Enum | Why not |
|---|---|
| `REGIONAL_SECTION_ONLY` | A regional section still needs a city-level fact with visitor utility. Phone DDD is not that fact. |
| `REGIONAL_LANDING_CANDIDATE` | No third-party VERIFIED city `areaServed` or local dataset justifies a candidate landing. Candidate withheld. |
| `NO_LOCAL_SURFACE` | Would erase the specialist Person page and national service URLs that already carry Organization/Person recognition. |

A future service-area Google Business Profile with hidden address is a founder action outside this PR. It is not a new `confenge.com.br` URL.
