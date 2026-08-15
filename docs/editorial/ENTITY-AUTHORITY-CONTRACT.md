# Entity Authority contract (issue #74)

Versioned public-surface contract: a relevant CONFENGE claim must be auditable as **quem afirma → competência → método/dado → revisão → atualização → limitações → como corrigir**.

Decision state: **VALIDATE**. Leverage: trust. This is not a page-count or badge program.

## Sources of truth

| Artifact | Role |
|---|---|
| `data/site/authority-matrix.json` | Requirements by surface type |
| `data/site/authority-governance.json` | Owner, SLA, policy URLs |
| `data/site/authority-signals-baseline-2026-08-15.json` | Measurable signals or `UNKNOWN` |
| `data/site/brand.json` | Canonical org copy |
| `data/site/proof.json` | Allowed public claims (self-attested unless noted) |
| `data/site/cases.json` | Client cases + demonstrative permission classes |
| `scripts/site/authority.py` | Fail-closed checkers |
| `/politica-editorial/`, `/correcoes/`, `/uso-de-ia/`, `/conflitos/` | Public policies |

Reuse, do not replica: specialist page, methodology page, demonstrative `/casos/`, editorial gates, Organization/Person/Article/Dataset builders in `html_shell` / `editorial/render`.

## Surface matrix (summary)

| Surface | Author | Reviewer | Method / `as_of` | Permission class |
|---|---|---|---|---|
| Página de serviço | required | only if material legal claim | optional / optional | n/a |
| Conteúdo técnico | required | required if legal claim, else solo disclosure | recommended | n/a |
| Ferramenta | required | only if legal opinion claimed | required / required | n/a |
| Pesquisa / dataset | required | optional | required / required | n/a |
| Caso / proof | required | optional | required / recommended | required |

Reviewer trigger: lei / jurisprudência / afirmação normativa material. Solo practice may disclose **não há segundo revisor nomeado** instead of inventing a second specialist.

## Proof limitation

`VERIFIED` + `perfil-publico-especialista` is **self-attested public copy**, not third-party verification. Tests treat that circularity as a limitation. Do not add CREA numbers, years of experience, ratings, badges or client names unless a new proof record exists.

## Cases

`data/site/cases.json` has zero `APPROVED` client cases. Published `/casos/` pages are `demonstrativo`. A consented/confidential/redacted class requires a real consent record before use.

## Signals

Branded search, direct/returning, qualified referring domains and citation/reuse are `UNKNOWN` until a named source file measures that exact metric. GSC samples are not those metrics.

## Gates

`npm run test:authority` (and `python3 scripts/site/test_authority_contract.py`) fail-closed on: missing author/reviewer; schema that contradicts visible byline/org/dates; invented Review/rating; research without method/`as_of`; credential not in public VERIFIED proof; case without permission class.
