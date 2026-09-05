# Technical Debt Assessment — DRAFT

**Workflow:** brownfield-discovery · Phase 4  
**Agent:** @architect consolidation  
**Date:** 2026-08-05  
**Status:** DRAFT — pending specialist validation (Phases 5–7)  
**Project:** CONFENGE / confenge-site  

> Historical pre-cutover assessment. Runtime and deployment statements were superseded on 2026-08-29 by `docs/architecture/RUNTIME-AUTHORITY.md`.

Sources:

1. `docs/architecture/system-architecture.md`  
2. `supabase/docs/SCHEMA.md`  
3. `supabase/docs/DB-AUDIT.md`  
4. `docs/frontend/frontend-spec.md`  

---

## 0. Context

Historical pre-cutover context: on 2026-08-05, CONFENGE ran as a static inbound site on Netlify with serverless lead/ops functions and heavy editorial/pSEO governance. Overall conversion and SEO maturity was **high**. Debt concentrated in **data queryability**, **content/repo scale**, and **frontend maintainability** during visitor redesign.

---

## 1. Débitos de Sistema

| ID | Débito | Severidade | Horas est. | Prioridade | Notas |
|----|--------|------------|------------|------------|-------|
| SYS-01 | Árvore HTML em escala (~200+ pages) + risco de drift source↔`_site` | Alto | 24–40 | P1 | Review noise, wrong-artifact risk |
| SYS-02 | Dual CSS monolítico sem package de primitivos | Médio | 16–24 | P2 | `styles.css` + `styles-tools.css` |
| SYS-03 | `script.js` monolítico (~1.1k LOC) | Médio | 12–20 | P2 | Form/nav/analytics acoplados |
| SYS-04 | Duplicação tool-compute `.js`/`.cjs` | Baixo | 2–4 | P3 | Drift |
| SYS-05 | `.env.example` AIOX-genérico ≠ stack real | Médio | 2–4 | P1 | Onboarding/misconfig |
| SYS-06 | Overlay AIOX/Reversa no monorepo (peso cognitivo) | Médio | 4–8 | P3 | Isolar ou documentar boundary |
| SYS-07 | Canal e-mail FormSubmit PENDING (403) | Médio | 2–8 | P2 | Owner activation / Resend SLA |
| SYS-08 | CrUX field CWV não claimable | Baixo–Médio | 4–8 | P3 | Observability |
| SYS-09 | Leads sem tier relacional/query | **Alto** | 40–80 | P0–P1 | Ver DATA-* |
| SYS-10 | Muitos CLIs de governança (bus factor) | Médio | 8–16 | P2 | Runbooks |
| SYS-11 | Working tree sujo de artefatos release/registry | Médio | 4–8 | P2 | Hygiene |
| SYS-12 | Functions em CJS sem TypeScript | Baixo–Médio | 16–32 | P3 | Safety |
| SYS-13 | Multi-store fallback (memory) risco prod | Médio | 4–8 | P0 | Fail-closed |
| SYS-14 | Throughput editorial depende de revisão humana | Médio | process | P2 | Não só eng |

---

## 2. Débitos de Database / Data Plane

⚠️ **PENDENTE: Revisão do @data-engineer**

| ID | Débito | Severidade | Horas est. | Prioridade | Notas |
|----|--------|------------|------------|------------|-------|
| DATA-01 | List leads = full Blobs scan | **Crítico@scale** | 24–40 | P1 | Warehouse/export |
| DATA-02 | Sem schema relacional para CRM/ops | Alto | 40–80 | P1 | Dual-write optional |
| DATA-03 | Sem `schema_version` formal em records | Médio | 4–8 | P2 | |
| DATA-04 | Misconfig multi-backend / memory fallback | **Alto** | 4–8 | P0 | Fail-closed |
| DATA-05 | Sem transações multi-entidade | Médio | 8–16 | P3 | Documentar + jobs |
| DATA-06 | Dual path GSC insights drift | Médio | 4–8 | P2 | Single source |
| DATA-07 | JSON registries grandes e dirty | Médio | 4–12 | P2 | Ownership |
| DATA-08 | Env template confuso (Supabase fantasma) | Médio | 2–4 | P1 | Align SYS-05 |
| DATA-09 | Email delivery incompleto | Médio | 2–8 | P2 | Align SYS-07 |
| DATA-10 | Retention purge evidence unclear | Médio | 4–8 | P2 | LGPD ops |
| DATA-11 | Join analytics×leads só em memória ops | Médio | 16–24 | P1 | Precompute |
| DATA-12 | Segurança ops = token only (sem RLS DB) | Alto | 8–16 | P0 | Rotation/audit |
| DATA-13 | Backup Blobs → owner storage | Médio | 8–16 | P2 | Export job |
| DATA-14 | pSEO data pesado | Baixo–Médio | ongoing | P3 | Snapshots OK |
| DATA-15 | Tool results só localStorage | Baixo | 0–2 | P3 | By design |
| DATA-16 | DSAR (acesso/delete lead) não productizado | Médio | 8–16 | P2 | Processo + script |

---

## 3. Débitos de Frontend/UX

⚠️ **PENDENTE: Revisão do @ux-design-expert**

| ID | Débito | Severidade | Horas est. | Prioridade | Impacto UX |
|----|--------|------------|------------|------------|------------|
| UX-01 | Dual CSS sem primitivos compartilhados | Médio | 16–24 | P2 | Consistência |
| UX-02 | Risco de regressão card-soup/dashboard | **Alto** | 4–8 + process | P0 | Trust premium |
| UX-03 | Taxonomia residual no hub/editorial | Médio | 8–16 | P1 | Clareza (branch ativa) |
| UX-04 | Mensagens de fallback de form | Médio | 2–4 | P2 | Trust |
| UX-05 | Estados do checklist progressive | Médio | 4–8 | P1 | Completion |
| UX-06 | Ritmo de seções nas offers | Médio | ongoing | P2 | Diferenciação |
| UX-07 | Sem storybook/playground | Médio | 16–24 | P3 | Design QA cost |
| UX-08 | Contact float oculto em mobile estreito | Baixo | 2–4 | P3 | Reach |
| UX-09 | Tool JS fragmentado | Médio | 8–16 | P2 | Manutenção |
| UX-10 | Thank-you pages mais simples | Baixo | 4–8 | P3 | Continuidade |
| UX-11 | Empty hubs (remediação em curso) | Médio | 2–6 | P1 | Dead ends |
| UX-12 | Visual regression não full CI | Médio | 8–16 | P2 | Drift |

---

## 4. Matriz preliminar (top 15)

| ID | Débito | Área | Impacto | Esforço | Prioridade |
|----|--------|------|---------|---------|------------|
| DATA-04 | Fail-closed store prod | Data | Alto | S | **P0** |
| DATA-12 | Ops auth hardening | Data | Alto | S–M | **P0** |
| UX-02 | Guardrails anti-dashboard | UX | Alto | S | **P0** |
| SYS-13 | Memory fallback ban prod | Sistema | Alto | S | **P0** |
| DATA-01 | Export/query path leads | Data | Alto@scale | M–L | **P1** |
| DATA-02 | Ops warehouse/DB optional | Data | Alto | L | **P1** |
| SYS-01 | Content tree / artifact hygiene | Sistema | Alto | M–L | **P1** |
| SYS-05 / DATA-08 | Env template real | Sistema/Data | Médio | S | **P1** |
| UX-03 | Hub language cleanup | UX | Médio | S–M | **P1** |
| UX-05 / UX-11 | Tools/hub completion | UX | Médio | S | **P1** |
| DATA-11 | Precompute attribution | Data | Médio | M | **P1** |
| SYS-02 / UX-01 | CSS modularization | Sys/UX | Médio | M | **P2** |
| SYS-03 | Split script.js | Sistema | Médio | M | **P2** |
| DATA-06/07/10/13/16 | Hygiene & compliance ops | Data | Médio | M | **P2** |
| SYS-12 / UX-07 | TS / storybook | Sys/UX | Baixo–Médio | L | **P3** |

---

## 5. Perguntas para especialistas

### @data-engineer

1. Qual volume atual/estimado de leads nos próximos 12 meses? O scan Blobs já dói hoje?  
2. Preferência: **export nightly** vs **dual-write Supabase** vs **HTTP CRM**?  
3. No antigo runtime Netlify, `LEAD_ALLOW_MEMORY_FALLBACK` estava garantidamente off?
4. Existe procedimento DSAR documentado para apagar lead por contato?  
5. Os dual files GSC (`data/ops` vs `netlify/functions/data`) são gerados por um único comando canônico?  

### @ux-design-expert

1. O redesign em `feat/visitor-experience-redesign` cobre 100% de ferramentas + obrigado + offers?  
2. Quais gates são hard-fail vs advisory? Algum false positive frequente?  
3. Contact float mobile: intencional esconder, ou gap?  
4. Checklist progressive: há métrica de abandono por step?  
5. Prioridade: modularizar CSS agora vs fechar consistency do redesign primeiro?  

### @qa (prep)

1. Coverage de smoke em tools pós-redesign é suficiente para P0 UX-02?  
2. Existe teste que falha se memory store for usado em “prod-like” config?  

---

## 6. Explicit non-debts (do not “fix”)

- Choosing static HTML over React — **intentional architecture**  
- Client-only tool persistence — **privacy by design**  
- Human approval for Wave editorial — **governance**, optimize process not remove  
- Strong SEO/a11y lab scores — keep gates  

---

## 7. Next

- Phase 5: `docs/reviews/db-specialist-review.md`  
- Phase 6: `docs/reviews/ux-specialist-review.md`  
- Phase 7: `docs/reviews/qa-review.md`  
