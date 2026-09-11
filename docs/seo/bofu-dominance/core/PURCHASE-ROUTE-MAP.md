# Purchase-to-route map

**As of:** `2026-09-11`  
**Authority:** `data/bofu-dominance/core/purchase-route-map.v1.json`  
**Intent contract:** `CONFENGE_PUBLIC_INTENT_MATRIX/1.0.0`  
**Consumer:** INB-10 reads this file (or `project_intent_route_table()`). The campaign folder is a private receipt, not a site data source.

This layer sits beside the 15-family BOFU projection. It does not replace `intent-registry.v2`, does not invent a second taxonomy and does not change commercial-consumer IDs.

## Rule

The unit is the **purchase**, not a keyword. Every declared corporate intent family has a purchase with exactly one owner decision (`KEEP` / `ENRICH` / `CREATE`) or an explicit gap. An existing destination that already serves the same purchase is preserved; suggested slugs stay aliases.

Cannibalization is two commercial URLs for the same purchase without function differentiation. Lexical similarity or a shared family, alone, is a warning.

## Priority reconciliation

| Purchase | Intent family | Current source of truth | Alias / proposed | Decision | Context | Owner |
|---|---|---|---|---|---|---|
| Quantitativos e orçamento | `orcar_planejar_decidir` | `/quantitativos-orcamento-obras/` | — | KEEP | mixed | INB-03 |
| Compatibilização | `projetar_revisar_compatibilizar` | `/servicos/#servico-projeto` | `/compatibilizacao-projetos-engenharia/` | CREATE | mixed | INB-04 |
| Revisão técnica | `projetar_revisar_compatibilizar` | `/servicos/#servico-projeto` | `/revisao-tecnica-projetos-engenharia/` | CREATE | mixed | INB-05 |
| Projetos complementares | `projetar_revisar_compatibilizar` | `/servicos/#servico-projeto` | `/projetos-complementares-engenharia/` | CREATE | mixed | INB-12 |
| Demonstrativo | `projetar_revisar_compatibilizar` | `/casos/` | child of `/casos/` | CREATE (prova, not contracting) | mixed | INB-06 |
| Auditoria de orçamento do edital | `orcar_planejar_decidir` | `/auditoria-orcamento-licitacao/` | — | KEEP | public | existing B2G |
| SINAPI (informational) | `orcar_planejar_decidir` | `/conteudos/sinapi-desonerado-nao-desonerado/` | — | KEEP | public | existing |
| Hub `/servicos/` | `outra_demanda_tecnica` | `/servicos/` | — | KEEP | mixed | INB-09 |

B2G protected routes remain: `/diagnostico-pre-licitacao/`, `/auditoria-orcamento-licitacao/`, `/medicoes-glosas-obras-publicas/`, `/aditivos-obras-publicas/`, `/reequilibrio-obras-publicas/`, `/diagnostico-b2g-360/`.

## Prontidão noindex (observed 11/09)

`/ferramentas/prontidao-tecnica-obra-privada/` is `noindex,follow` in page meta because `data/organic/noindex-governance-registry.json` records `commercial_surface_deferred` (false-positive readiness at planning stage). `robots.txt` does not Disallow that path. This is not URL removal and not an obsolete maturity inventory. Reindex only if the tool is useful, complete and materially unblocked (INB-07).

## Check

```
python3 -m scripts.bofu_dominance.core.buyer_decision_map --check
```

The 15-family projection remains fail-closed. The purchase layer is merged into the same `--check`.
