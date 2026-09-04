# Distinct-answer proof — campaign 11

`as_of`: 2026-09-04
Question: does any of the seven demand families mint a new URL?

**Answer: no.** All families resolve to anchors on the single candidate slug `/grande-florianopolis/`.

## Test applied

A family earns a new URL only if a visitor with that job would receive a materially different answer that cannot be given on the hub without dumping another city's or nucleus's job. The bar is the visitor job, not keyword coverage.

| Family | Distinct job on the hub? | Distinct URL required? | Why |
|---|---|---|---|
| Assistência técnica / perícia | Yes: nexo, papel, autos protegidos | No | Decision rule and document list fit one section. City of the sítio is a field, not a page. |
| Avaliação de imóvel | Yes: finalidade de valor vs sintoma | No | Purpose-of-value is an H2, not `/avaliacao-*`. |
| Laudo de reforma / condomínio | Yes: decisão de reforma vs inspeção de sintoma | No | Same nucleus (`building_engineering_documentation`); different problem_type. |
| Inspeção / patologia | Yes: NBR 16747 vs NBR 13752 | No | The distinction is the educational payload of the hub. |
| Orçamento / quantitativos | Yes for private work; B2G already has national hubs | No | Public-contract jobs leave this hub toward unmodified B2G routes. |
| BIM / compatibilização | Yes: remote model vs sítio | No | Upload belongs to canary 09, not a BIM city page. |
| SST | Yes: occupational vs building | No | Nucleus switch on the same URL. |

## Forbidden expansions (blocked as new scope)

- `/florianopolis/`, `/sao-jose/`, `/palhoca/`, `/biguacu/`
- city × serviço (`/pericia-florianopolis/`, `/avaliacao-sao-jose/`, …)
- bairro, fórum, comarca, or beach slugs
- B2G hubs with location modifiers (`/diretoria-b2g-florianopolis/`)

## Cannibalization check

Existing B2G and nucleus-adjacent routes remain the canonical answer for public-contract jobs. This hub links them without rewriting titles or adding city suffixes. Specialist `/especialista/tiago-jun-sasaki/` remains the Person URL. `/conflitos/` remains the conflict policy URL.

## 100-repetition

One hundred local opportunities should enrich the hub's decision table (when to visit, which nucleus, which documents). They must not produce one hundred near-duplicate pages.
