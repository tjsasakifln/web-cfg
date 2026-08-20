# SERP census by family — CONFENGE-WEB-BOFU-SAFE-EXECUTION-01

as_of: 2026-08-19.  
source_kind for live Search Analytics: `UNKNOWN` (`credential_failure` on PR #159; `ready_for_product_decisions=false`).  
source_kind for historical rows: in-repo GSC exports `seo/gsc-2026-08-09` (README: last 7 days to 2026-08-09) and `seo/gsc-2026-07-30`.  
Search Analytics top-row truncation applies: a URL or query not in the export is UNKNOWN, not zero.

## Family 1 — Defesa de margem (umbrella)

Target URL: `/defesa-margem-contratos-publicos/`.  
Job: recurring detecção / documentação / cálculo / decisão. Tool `#60` `/ferramentas/diagnostico-defesa-margem/` is out of scope.

| Window | URL in export | Impr | Clicks | Position | Notes |
|---|---|---:|---:|---:|---|
| gsc-2026-08-09 pages | not in 27-row file | UNKNOWN | UNKNOWN | UNKNOWN | Not listed. Not inferred as 0. |
| gsc-2026-07-30 pages | not in 59-row file | UNKNOWN | UNKNOWN | UNKNOWN | Not listed. Not inferred as 0. |
| live GSC 2026-08-19 | n/a | UNKNOWN | UNKNOWN | UNKNOWN | PR #159 credential_failure. |

Related queries in the 2026-08-09 consultas export map to frozen or sibling jobs (SINAPI, aditivos, glosa, BDI), not to this umbrella URL.

## Family 2 — Atrasos / prorrogações

Target URL: `/atrasos-prorrogacao-obras-publicas/`.  
Job: causa, responsabilidade, caminho crítico, registro contemporâneo.  
Do not restage the `#127` canary `/conteudos/chuva-prorrogacao-prazo-obra-publica/`.

| Window | Asset | Impr | Clicks | Position | source_kind |
|---|---|---:|---:|---:|---|
| gsc-2026-08-09 pages | `/atrasos-prorrogacao-obras-publicas/` | UNKNOWN | UNKNOWN | UNKNOWN | not in export |
| gsc-2026-08-09 pages | `/conteudos/chuva-prorrogacao-prazo-obra-publica/` | 17 | 0 | 3.35 | historical export; observe_only #127 |
| gsc-2026-08-09 pages | `/conteudos/prorrogacao-prazo-obra-publica-documentos/` | 15 | 0 | 9.2 | historical export; MOFU guide, not this landing |
| gsc-2026-08-09 queries | `prorrogação prazo obra pública chuva` | 10 | 0 | 3.5 | maps to canary, not the pillar |
| gsc-2026-07-30 pages | `/conteudos/prorrogacao-prazo-obra-publica-documentos/` | 6 | 1 | 5.67 | historical export |
| live GSC 2026-08-19 | all of the above | UNKNOWN | UNKNOWN | UNKNOWN | credential_failure |

## Family 3 — Defesa técnica (subsídio)

Target URL: `/defesa-tecnica-contratos-publicos/`.  
Job: subsídio técnico for notificação/sanção. Not advocacia, representação or promessa de êxito.

| Window | URL in export | Impr | Clicks | Position | Notes |
|---|---|---:|---:|---:|---|
| gsc-2026-08-09 pages | not listed | UNKNOWN | UNKNOWN | UNKNOWN | Absence ≠ 0. |
| gsc-2026-07-30 pages | not listed | UNKNOWN | UNKNOWN | UNKNOWN | Absence ≠ 0. |
| live GSC 2026-08-19 | n/a | UNKNOWN | UNKNOWN | UNKNOWN | credential_failure. |

No named query in either consultas export is a verified match for this service URL.

## Family 4 — Acompanhamento (rotina preventiva)

Target URL: `/acompanhamento-contratos-obras/`.  
Job: rotina preventiva/recorrente. Must not duplicate the three reactive landings.

| Window | URL in export | Impr | Clicks | Position | Notes |
|---|---|---:|---:|---:|---|
| gsc-2026-08-09 pages | not listed | UNKNOWN | UNKNOWN | UNKNOWN | Absence ≠ 0. |
| gsc-2026-07-30 pages | `/acompanhamento-contratos-obras/` | 1 | 0 | 7 | historical export, n=1, very_low. Not a live ranking claim. |
| live GSC 2026-08-19 | n/a | UNKNOWN | UNKNOWN | UNKNOWN | credential_failure. |

## What this census does not authorize

- Inventing CTR, click share or ranking lift.
- Treating missing live GSC as proven-zero demand.
- Editing `#126` / `#127` / `#128` URLs listed in PR #159 `observe_only`.
