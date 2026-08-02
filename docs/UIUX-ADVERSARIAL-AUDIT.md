# UI/UX Adversarial Audit — confenge.com.br

**Baseline SHA:** `7f111f117b493d4d249d7aab01ea19b0be76c9c2`  
**Date:** 2026-08-01  
**Surfaces:** home, Diretoria B2G, Diagnóstico B2G 360°, Bid Room, Contract Defense & Margin, inteligência (chrome), conteúdos (chrome), especialista, formulário, obrigado, navegação móvel, pSEO sample via shared CSS/shell.

**Baseline metrics (rendered, pre-change):**

| Viewport | scrollHeight | visible chars (main) | sections | primary CTAs |
|---|---:|---:|---:|---:|
| 1440×1000 | 11 599 px | 8 920 | 13 | 7 |
| 390×844 | 19 071 px | 8 916 | 13 | 7 |

Screenshots: `docs/uiux-evidence/baseline/`.

---

## Validation of the 14 suspected problems

| # | Suspected problem | Verdict | Evidence |
|---|---|---|---|
| 1 | Home excessively long/dense | **CONFIRMED** | 11.6k px @1440; 13 sections; ~1.8k words |
| 2 | Conceptual repetition (tension / model / journey / matrix) | **CONFIRMED** | Four parallel models of “select → decide → execute → learn” |
| 3 | Archetypes without perceptual variation | **CONFIRMED** | Many sections shared eyebrow+H2+lead+num pattern |
| 4 | Hero visual risks fake dashboard | **CONFIRMED** | Multi-node decision map with mono labels looked product-like |
| 5 | Mobile hero large visual, small labels | **CONFIRMED** | Full map kept on mobile; labels &lt;14px |
| 6 | Two equal-weight CTAs in first block | **CONFIRMED** | Dual `button-lg` primary+secondary in hero |
| 7 | Internal/implementation language in commercial copy | **CONFIRMED** | “sem JavaScript”, “sem inventar case” |
| 8 | Defensive proof language reduces trust | **CONFIRMED** | “sem inventar case e sem métrica fictícia” |
| 9 | Too many primary buttons | **CONFIRMED** | 7× `button-primary` on home |
| 10 | Content library as pre-conversion exit maze | **CONFIRMED** | Full editorial section + 6 trails + 3 reads before form |
| 11 | English terms not always explained | **PARTIAL** | Bid Room / Contract Defense present without PT gloss on first use in some surfaces |
| 12 | Matrix/journey not truly mobile-redesigned | **CONFIRMED** | Wide table min-width 860px; 8-tab journey |
| 13 | Audits mostly static | **CONFIRMED** | `audit_accessibility.py` is string checks only |
| 14 | Tests can pass while UX is mediocre | **CONFIRMED** | Primary CTA cap was ≤12; archetypes counted by attribute only |

---

## Findings (by severity)

### CRITICAL

#### C1 — Home length and cognitive load block 5-second clarity
- **Problem:** 13 narrative sections force the buyer through model, journey, matrix, content library before conversion.
- **Evidence:** Baseline 11 599 px / 13 sections; multiple redundant decision frameworks.
- **User impact:** Decisor abandons or skims past proof/CTA.
- **Commercial impact:** Lower diagnostic conversion; weak first impression of selectivity.
- **Fix:** Restructure to ≤7 blocks; consolidate method into 4 macro-phases.
- **Files:** `index.html`, `styles.css`
- **Regression test:** `test_home_card_grid_limit`, `test:ui` height/section gates

#### C2 — Primary CTA hierarchy broken
- **Problem:** 7 primary buttons; hero dual CTAs equal weight.
- **Evidence:** `button-primary` count=7; hero secondary was `button-secondary button-lg`.
- **User impact:** Unclear next step.
- **Commercial impact:** Split intent between WhatsApp and diagnostic form.
- **Fix:** ≤4 primaries (header, mobile nav, hero, submit); WhatsApp as text-link secondary “Enviar decisão crítica”.
- **Files:** `index.html`, `data/site/brand.json`
- **Regression test:** `test_primary_cta_not_spam`, `test:ui` hero CTA

### HIGH

#### H1 — Defensive public copy
- **Problem:** “sem inventar case”, “sem métrica fictícia”, “sem JavaScript” expose internal fears.
- **Evidence:** Home trace lead + journey lead (baseline HTML).
- **Fix:** Positive method language; expand `public_copy_leaks`.
- **Files:** `index.html`, `diretoria-b2g/index.html`, `data/site/brand.json`, `data/site/design-system.json`
- **Regression test:** `test_trace_matrix_and_tension_present`, `test_microcopy_preferences`

#### H2 — Mobile matrix unusable
- **Problem:** 7-column table with horizontal scroll only.
- **Evidence:** `.trace-matrix{min-width:860px}` without stacked alternative.
- **Fix:** `.trace-cards` stacked records; hide table &lt;700px.
- **Files:** `index.html`, `styles.css`
- **Regression test:** `test_mobile_matrix_composition`, `test:ui` matrix_mobile

#### H3 — Hero mobile decorative cost
- **Problem:** Large visual before/around decision content; small labels.
- **Fix:** Hide `.hero-visual` ≤700px; desktop spine simplified to 4 phases, ≥14px type.
- **Files:** `styles.css`, `index.html`
- **Regression test:** `test:ui` mobile_hero_cta_without_decor_panel

#### H4 — Form friction
- **Problem:** Email required + WhatsApp optional + long message required.
- **Fix:** Email **or** WhatsApp; message optional; situation + urgency retained.
- **Files:** `index.html`, `script.js`
- **Regression test:** `test_form_qualification_minimal`

### MEDIUM

#### M1 — Section header monotony
- **Problem:** Repeated section-num + eyebrow + H2 + lead.
- **Fix:** Removed section numbers; varied surfaces (soft / navy / white); different compositions per block.
- **Files:** `index.html`, `styles.css`
- **Regression test:** `test_home_archetypes_diverse`

#### M2 — Content library pre-conversion exits
- **Problem:** Full library on home.
- **Fix:** One content link near conversion; library in footer.
- **Files:** `index.html`
- **Regression test:** section count ≤7; no `home-content-section`

#### M3 — English jargon
- **Problem:** Bid Room / Contract Defense without PT gloss.
- **Fix:** First-use explanations on home paths and footer.
- **Files:** `index.html`
- **Regression test:** `test_microcopy_preferences`

### LOW

#### L1 — Glass header / heavy shadows
- **Fix:** Reduced backdrop-filter; calmer primary shadow.
- **Files:** `styles.css`

#### L2 — Static-only a11y audits
- **Fix:** Added `npm run audit:axe` (axe-core in real browser) + geometry suite.
- **Files:** `scripts/site/audit_axe.mjs`, `scripts/site/test_ui_geometry.mjs`

---

## Surface notes (post-remediation intent)

| Surface | Key residual risks |
|---|---|
| Home | Must stay ≤7 blocks; dual matrix (table+cards) adds DOM weight for a11y |
| Diretoria B2G | Deeper page; keep CTA family aligned |
| Diagnóstico / Bid Room / Defense | Offer-specific depth OK; avoid reintroducing defensive FAQ |
| Inteligência / pSEO | Shared chrome only in this pass |
| Especialista | Photo + credentials remain proof source |
| Form / obrigado | Netlify form name preserved; success path unchanged |
| Mobile nav | Escape/focus return covered in `script.js` + UI test |

---

## After metrics (target check)

Recorded after remediation (see `docs/UIUX-REMEDIATION-RESULT.json`):

- Height −38% @1440 (≈7 162 px ≤ 8 000)
- Height −35% @390 (≈12 396 px ≤ 12 500)
- Visible text −30%+
- Sections 13 → 7
- Primary CTAs 7 → 4
