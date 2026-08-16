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

Every public family names `author`, `reviewer`, `evidence`, `update_history`, `ai_disclosure` and `consent`. An unclassified public family fails closed.

| Surface | Author | Reviewer | AI disclosure | Consent / permission |
|---|---|---|---|---|
| Página de serviço | required | only if material legal claim | recommended | n/a |
| Conteúdo técnico | required | required if legal claim, else solo disclosure | recommended | n/a |
| Ferramenta | required | only if legal opinion claimed | required | n/a |
| Pesquisa / dataset | required | optional | required | n/a |
| Caso / proof | required | optional | recommended | required; Caso CONFENGE needs real consent |
| Análise técnica de contrato público | required | required (solo disclosure allowed) | required on-page | n/a; mutually exclusive with caso/proof |

Reviewer trigger: lei / jurisprudência / afirmação normativa material. Solo practice may disclose **não há segundo revisor nomeado** instead of inventing a second specialist.

## Proof limitation

`VERIFIED` + `perfil-publico-especialista` is **self-attested public copy**, not third-party verification. Tests treat that circularity as a limitation. Do not add CREA numbers, years of experience, ratings, badges or client names unless a new proof record exists.

## Cases

`data/site/cases.json` has zero `APPROVED` client cases. Published `/casos/` pages are `demonstrativo` and must not wear the label **CASO CONFENGE**. A consented/confidential/redacted class requires a real consent record before use.

`/analises-contratos-publicos/` is the taxonomy hub for **ANÁLISE TÉCNICA DE CONTRATO PÚBLICO**. It is not a Caso CONFENGE, not a customer-success page and does not publish a live contract payload. Live analyses wait for the extra-cli consume/INDEX canary (issue #83 / PR #85).

## Signals

Branded search, direct/returning, qualified referring domains and citation/reuse are `UNKNOWN` until a named source file measures that exact metric. GSC samples are not those metrics.

## Gates

`npm run test:authority` (and `python3 scripts/site/test_authority_contract.py`) fail-closed on: missing author/reviewer/AI-disclosure/consent slots; schema that contradicts visible byline/org/dates/crumbs/dataset; invented Review/rating/Award/association/reviewer/CaseStudy; analysis labeled as Caso CONFENGE; research without method/`as_of`; credential not in public VERIFIED proof; case without permission class; unclassified public family treated as pass.
