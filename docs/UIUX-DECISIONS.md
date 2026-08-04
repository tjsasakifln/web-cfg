# UI/UX Decisions, confenge.com.br remediation

**Baseline SHA:** `7f111f117b493d4d249d7aab01ea19b0be76c9c2`  
**Principle:** Subtrair antes de acrescentar. Buyer = cético decisor de construtora.

---

## Removed

| Item | Why |
|---|---|
| Separate “modelo operacional” section (4 vectors + nucleus) | Repeated the same decision cycle as journey/matrix |
| 8-stage interactive journey as home default | Forced study before proof/CTA; JS enhancement story irrelevant to buyer |
| Platform-vs-responsibility full compare section | Folded into one line under authority |
| Full content library section on home | Pre-conversion exit maze |
| Final CTA band separate from form | Redundant primary; merged into conversion block |
| Section numbers (02…11) | Decorative, non-navigational |
| Dual equal CTAs in hero | Split conversion intent |
| Defensive phrases (“sem inventar case”, “sem métrica fictícia”, “sem JavaScript”) | Reduced trust; internal voice |
| Glassmorphism-heavy header treatment | Decorative, not orienting |
| Complex multi-node hero map on mobile | Costly, low decision value |

## Consolidated

| From | Into |
|---|---|
| Model + 8-stage journey + part of matrix narrative | **4 macro-phases** (selecionar → decidir e preparar → executar e proteger → medir e aprender) with `<details>` for depth |
| Desktop table + mobile UX | Same content as **table (desktop)** and **stacked records (mobile)** |
| ICP + FAQ | Single **adequação e objeções** block (4 decisive FAQs) |
| Final CTA + contact form | Single **conversão final** section |
| Hero proof + authority | Credentials in hero (5-second trust) + deeper authority section |

## Kept

| Item | Why |
|---|---|
| Thesis H1 “Licitação vencida não paga a conta…” | Strong economic claim; survives 5-second test |
| Three economic risk moments | Clear, non-redundant problem framing when other models removed |
| Diretoria as dominant offer + situational paths | Correct commercial hierarchy |
| Netlify form `diagnostico-b2g`, honeypot, origem, analytics hooks | SEO/ops contracts |
| Schema.org graph, canonical, OG, FAQPage (trimmed to visible) | SEO integrity |
| WhatsApp routes + float | Urgency path without replacing primary |
| Brand colors (navy, green decision, rare lime) | Institutional identity |
| Specialist photo (real asset) | Only non-fictional visual proof of person |

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Invent client logos / ROI metrics | Forbidden; no public authorized cases |
| Keep 8-stage journey “collapsed by default” with JS tabs | Still heavy; requires learning UI; no-JS shows all 8 |
| Single long scroll of identical cards for offers | Hierarchy collapse |
| Remove matrix entirely | Method proof materiality would drop too far |
| Replace H1 with softer “consultoria B2G” | Loses economic edge that differentiates from edital platforms |
| SPA/React rewrite | Violates static performance/no-framework rule |

## Buyer rationale (skeptical construtora)

1. **5 seconds:** What (Diretoria B2G), who (construtoras), problem (margem no contrato), trust (EESC-USP + lados da mesa), next step (Diagnosticar operação B2G).
2. **Selectivity:** “Não faz sentido quando” stays visible, signals we are not a volume shop.
3. **No theater:** No fake dashboard, no fabricated cases, no AI demo language.
4. **Economic consequence over method theater:** Three risk moments + four phases beat eight panels + seven columns.
5. **One dominant ask:** Diagnosticar operação B2G; WhatsApp is secondary urgency.

## Justified metric notes

- Height reduction ≥30% achieved (≈38% @1440, ≈35% @390).
- Visible text ≥30% achieved after final trim.
- Dual matrix representation (table + cards) slightly increases DOM size vs pure removal; kept for WCAG table alternative on mobile without JS.
- Offer detail pages retain depth; home is the compression surface.
