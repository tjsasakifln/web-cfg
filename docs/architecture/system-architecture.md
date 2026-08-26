> **Authoritative architecture notice (2026-08-14):** [ADR-STRAT-002](ADR-STRAT-002-confenge-canonical-public-surface.md) governs current cross-repository ownership. `confenge.com.br` / `web-cfg` is the sole public surface, `extra-cli` is the truth plane, `warmbly` is the action plane, and SmartLic is only a legacy migration source. Where this brownfield snapshot conflicts, ADR-STRAT-002 wins.

# System Architecture — CONFENGE (confenge-site)

**Workflow:** brownfield-discovery · Phase 1  
**Agent:** @architect (Aria) via Orion YOLO orchestration  
**Date:** 2026-08-05  
**Branch analyzed:** `feat/visitor-experience-redesign` @ `948554b0`  
**Production:** https://confenge.com.br  

---

## 1. Executive overview

CONFENGE is a **static marketing + editorial + tools site** for B2G (business-to-government) engineering consulting focused on Brazilian public-works contracts (Lei 14.133, aditivos, reequilíbrio, medições).

It is **not** a SPA framework app. The product is:

1. **Public static HTML** generated/assembled into `_site/` and published on Netlify  
2. **Serverless functions** for lead capture, nurture, analytics collect, and authenticated ops  
3. **Python + Node pipelines** for pSEO, editorial governance, RevOps/GSC, design gates, and release evidence  

| Dimension | Reality |
|-----------|---------|
| Product type | Content + conversion site (inbound) |
| Runtime public | Static files + Netlify Functions |
| Primary languages | HTML/CSS/JS, Python 3.12, Node 20 |
| Database RDBMS | **None** (Netlify Blobs + JSON artifacts) |
| Package name | `confenge-site` v1.0.0 |

---

## 2. C4 — Context

```text
┌─────────────┐     HTTPS      ┌──────────────────────────────┐
│  Buyer ICP  │ ─────────────► │  confenge.com.br (_site)     │
│ Construtoras│ ◄───────────── │  Static pages + tools        │
└─────────────┘   HTML/CSS/JS  └───────────┬──────────────────┘
                                           │ POST
                     ┌─────────────────────┼──────────────────┐
                     ▼                     ▼                  ▼
              lead function          collect function    ops function
              (persist + notify)     (analytics events)  (auth ops)
                     │                     │                  │
                     └──────────┬──────────┴──────────────────┘
                                ▼
                     Netlify Blobs stores
                     (leads, analytics, nurture)
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
         ntfy / Resend    Plausible (opt)    GSC / JSON ops
         (notify)         (product analytics) (search demand)
```

**External systems:** Netlify (host + functions + blobs), ntfy, Resend, Cloudflare Turnstile, Google Search Console (import/API), optional Plausible, WhatsApp (handoff off-platform).

---

## 3. C4 — Containers

| Container | Tech | Responsibility |
|-----------|------|----------------|
| Public static site | HTML + `styles.css` + `styles-tools.css` + `script.js` + `assets/js/*` | SEO pages, hubs, offers, tools UI |
| Build pipeline | Python (`scripts/pseo`, `scripts/editorial`, `scripts/site`) | Generate pages, sitemaps, gates, `_site` assembly |
| Lead API | `netlify/functions/lead.cjs` + `lib/lead-*.cjs` | Intake, validate, rate-limit, persist, notify |
| Collect API | `netlify/functions/collect.cjs` | First-party analytics events → Blobs |
| Nurture API | `netlify/functions/nurture.cjs` | Post-lead nurture sequences |
| Ops API | `netlify/functions/ops.cjs` | Authenticated health, leads list, GSC insights |
| Data plane (files) | `data/**` JSON registries | Editorial registry, design tokens, GSC, pSEO schema/snapshots |
| Evidence plane | `docs/evidence/**`, `.well-known/*` | Release proof, audits, build identity |

---

## 4. Technology stack

### 4.1 Runtime / host

| Layer | Choice | Notes |
|-------|--------|-------|
| Host | Netlify | `publish = "_site"`, functions = `netlify/functions` |
| Build | `npm run build:site` → `python3 scripts/pseo/build_site.py` | Single deterministic public artifact |
| Node | 20 | Functions via esbuild; `@netlify/blobs` externalized |
| Python | 3.12 | Editorial/pSEO/gates |
| CDN / redirects | `_redirects` + `netlify.toml` | Host canonization `confenge.netlify.app` → `confenge.com.br`; unpublished `/intranet` 302 gateway to `ops.confenge.com.br` (see `docs/ops/INTRANET-GATEWAY.md`) |

### 4.2 Frontend (public)

| Asset | LOC (approx) | Role |
|-------|--------------|------|
| `styles.css` | ~965 | Global design system tokens + layout |
| `styles-tools.css` | ~883 | Tools / checklist progressive UI |
| `script.js` | ~1161 | Form funnel, nav, analytics hooks |
| `assets/js/tool-compute.js` | ~shared | Tool calculation logic |
| `assets/js/tool-persist.js` | small | localStorage persistence |
| `assets/js/tools-common.js` | ~6kB | Shared tool chrome |

**No React/Vue/Vite app shell.** UI is multi-page HTML with progressive enhancement.

### 4.3 Backend (serverless)

| Function | Lines | Store |
|----------|-------|-------|
| `lead.cjs` | ~441 | Host-owned filesystem; Blobs somente adapter legado; memory test-only |
| `nurture.cjs` | ~559 | Namespace host-owned + adapter Blobs legado |
| `ops.cjs` | ~720 | Store host-owned + fallback GSC empacotado |
| `collect.cjs` | ~241 | Namespace host-owned `analytics-events` + rollback Blobs |
| `lib/*` | ~2500 | Core lead/nurture/analytics modules |

### 4.4 Dependencies (`package.json`)

**Production npm:** `@netlify/blobs` permanece temporariamente somente para rollback Netlify; o perfil filesystem não o carrega.
**Dev:** `axe-core`, `chrome-launcher`, `lighthouse`, `puppeteer-core`  

Heavy logic lives in **first-party Python/Node scripts**, not npm frameworks.

### 4.5 Framework overlay (non-product)

Recently installed AIOX/Reversa tooling (`.aiox-core/`, `.claude/`, `.agents/`, etc.). These are **dev orchestration**, not runtime of confenge.com.br. Debt analysis scopes them as tooling cost, not product architecture.

---

## 5. Repository / folder structure (product-relevant)

```text
/
├── index.html, 404.html, obrigado*.html   # Shell / confirmation pages
├── styles.css, styles-tools.css, script.js
├── assets/js/                            # Tool runtime
├── conteudos/                            # Editorial articles (120+ dirs)
├── ferramentas/                          # Interactive tools (3 + hub)
├── {offer-slugs}/                        # Journey landing pages
├── data/
│   ├── editorial/                        # Registry + page JSON sources
│   ├── site/                             # brand, design-system, proof
│   ├── pseo/                             # Schema, snapshots, metrics
│   ├── ops/                              # GSC insights package
│   ├── revops/                           # Search demand imports
│   └── nurture/                          # Nurture config
├── scripts/{pseo,editorial,site,revops}/ # Build + gates + ops CLIs
├── netlify/functions/                    # Serverless APIs
├── seo/                                  # SEO reports / GSC inputs
├── docs/                                 # Evidence, ops, design, QA
├── _site/                                # Published artifact (build output)
├── _redirects, _headers, robots.txt, sitemap*.xml
└── .well-known/                          # build-info, release packets
```

**Scale signals:** ~211 `index.html` sources (excl. tooling trees); ~120 editorial content directories; multi-sitemap strategy (`sitemap.xml`, editorial, inteligencia, jurisprudencia, index).

---

## 6. Build & deploy pipeline

```text
Source HTML/JSON ──► pseo/editorial/site scripts ──► validate gates
                              │
                              ▼
                     assemble isolated _site/
                              │
                              ▼
              Netlify publish (_site) + Functions deploy
                              │
                              ▼
                  /.well-known/build-info.json identity
```

**Rules (from `netlify.toml`):**

- Netlify must **not** call private DBs; publish **only** public artifact  
- Every push to `main` builds; `build.ignore = "exit 1"` overrides Netlify's
  default skip detector, and the workflow gate forbids any path-based variant.
- Redirects live in `_redirects` (copied into `_site`)

---

## 7. Integration map

| Integration | Direction | Purpose | Status (from docs) |
|-------------|-----------|---------|---------------------|
| Netlify Blobs | R/W | Leads, analytics, nurture | Production path |
| ntfy | Out | Lead notify | Verified delivered |
| Resend | Out | Email notify | Config-dependent |
| FormSubmit | Out | Legacy email path | **PENDING** (403 activation) |
| Turnstile | In | Bot protection | Optional/env-gated |
| Plausible | Out | Analytics forward | Optional |
| GSC | In | Search demand observatory | Import/API scripts |
| WhatsApp | Out (deep links) | Human handoff + upload | Live CTAs |

---

## 8. Security & privacy posture (system level)

**Strengths observed:**

- Lead API: origin allowlist, rate limit (IP + fingerprint), Turnstile hook, persist-before-success, public responses strip secrets/PII free-text  
- Ops endpoints authenticated (not public static)  
- IP hashing salt support; retention policy hooks  
- Secrets scan tests (`test:secrets-scan`)  
- Static public surface minimizes server attack surface  

**Gaps / risks:**

- Durable store is **key-value Blobs**, not relational with RLS — access control is API-layer only  
- Memory fallback env (`LEAD_ALLOW_MEMORY_FALLBACK`) is dangerous if mis-set in production  
- `.env.example` is AIOX-generic (includes unused Supabase/Vercel/Railway) — confuses operators  
- Large generated tree + dual source vs `_site` increases risk of shipping stale/wrong artifact if gates skipped  

---

## 9. Testing & quality architecture

Extensive **gate-oriented** test suite (npm scripts):

| Domain | Examples |
|--------|----------|
| Editorial/pSEO | `pseo:test`, `editorial:test`, `editorial:truth` |
| Design/UX | `test:design`, `test:visitor-redesign`, `test:ui`, `test:copy`, `test:brand` |
| Conversion | `test:form-funnel`, `test:lead-function`, `test:cta-whatsapp` |
| SEO/inbound | `test:inbound-gates`, `validate:seo`, redirects |
| A11y/perf | `audit:axe`, lighthouse runners |
| Ops honesty | `test:ops-docs`, `test:workflow-gates` |

**Observation:** Quality is strong on **content/SEO/conversion contracts**. Weaker classical app concerns (typed module graph, component library, DB migrations) because architecture is static-first.

---

## 10. Code patterns & conventions

| Pattern | Practice |
|---------|----------|
| Content-as-data | Editorial pages as JSON → Python renderers |
| Gate-first merge | Python/Node scripts fail CI on contract violations |
| Design tokens | CSS variables + `data/site/design-system.json` + docs |
| Evidence-backed claims | `docs/evidence/**` required for production claims |
| Journey codes | A contrato / B edital / C operação |
| Idempotent lead write | `idempotency_key` + store `onlyIfNew` |

---

## 11. Débitos identificados (nível sistema)

| ID | Débito | Severidade | Impacto | Esforço est. |
|----|--------|------------|---------|--------------|
| SYS-01 | Árvore HTML gerada/commitada em escala (~200+ pages) aumenta ruído de diff e risco de drift source↔`_site` | **Alto** | Dev velocity, review quality | M–L |
| SYS-02 | Dual CSS monolítico (`styles.css` + `styles-tools.css`) sem modularização por superfície | Médio | Manutenção visual | M |
| SYS-03 | `script.js` monolítico (~1.1k LOC) mistura form, nav, analytics | Médio | Bugs de conversão, testability | M |
| SYS-04 | Duplicação `tool-compute.js` / `.cjs` e espelhos de assets | Baixo–Médio | Drift | S |
| SYS-05 | `.env.example` AIOX-genérico (Supabase/Vercel/etc.) não documenta stack real | Médio | Onboarding, misconfig | S |
| SYS-06 | Overlay AIOX/Reversa pesado no monorepo (muitos dirs de agentes) | Médio | Cognitive load, clone size | S–M |
| SYS-07 | Email FormSubmit path ainda PENDING (403) — dependência de canal | Médio | Ops redundancy | S (owner action) |
| SYS-08 | Field Core Web Vitals (CrUX) não claimable — só lab Lighthouse | Baixo–Médio | Product confidence | Observability |
| SYS-09 | Store de leads sem modelo relacional/query-first — ops via list/scan Blobs | **Alto** | RevOps scale, reporting | L |
| SYS-10 | Governança editorial/pSEO altamente procedural (muitos CLIs) — curva operacional | Médio | Bus factor | M |
| SYS-11 | Artefatos de release (`.well-known`, registries) frequentemente dirty no working tree | Médio | Release hygiene | S |
| SYS-12 | Sem TypeScript/build-time types nas functions — só CJS | Baixo–Médio | Refactor safety | M |
| SYS-13 | Memory fallback / multi-store abstraction complexity | Médio | Reliability if misconfigured | S–M |
| SYS-14 | Dependência de revisão humana Wave editorial (packet/approval) | Médio | Throughput de conteúdo | Process |

---

## 12. Non-goals of this architecture doc

- Does not redesign product positioning  
- Does not replace `docs/pseo/ARCHITECTURE.md` (pSEO-specific)  
- Does not treat AIOX framework internals as product modules  

---

## 13. Related documents

| Doc | Role |
|-----|------|
| `docs/pseo/ARCHITECTURE.md` | pSEO pipeline detail |
| `docs/DESIGN-SYSTEM.md` | Visual system |
| `docs/ops/ENV-VARS.md` | Runtime env names |
| `docs/FINAL-REPORT.md` | Production conversion remediation evidence |
| `docs/uiux-visitor-redesign/*` | Visitor UX redesign |

---

## 14. Summary for downstream phases

CONFENGE is a **high-maturity static inbound engine** with strong gates and conversion plumbing, running on **Netlify + Blobs + JSON data**. Primary technical debt is **scale/ops of content + data model for leads**, not missing modern SPA frameworks.

**Next (Phase 2):** Document the actual data plane (Blobs schema + JSON artifacts) as stand-in for RDBMS audit.
