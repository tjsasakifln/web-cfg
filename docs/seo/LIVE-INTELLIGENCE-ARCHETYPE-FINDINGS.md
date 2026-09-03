# Live Intelligence — archetype/editorial-copy audit (read-only, P3)

**Scope:** PR #573 / branch `feat/live-intelligence-w1` — Live Intelligence Surface A
(`/oportunidades/<id>/`, rendered by `scripts/live_intelligence/render.py`) and
Surface B (`/analise-cnpj/`, `/analise-cnpj/r/`, rendered client-side by
`assets/js/live-intelligence.js` and server-side by
`netlify/functions/live-intelligence-analyze.cjs:renderResultPage`).

**Summary:** across the 7 captured page renders (4 opportunity pages, the
CNPJ tool landing, the CNPJ result shell, and 1 reconstructed CNPJ result
page), a literal grep for the internal-jargon string set (`UNKNOWN`,
`(as_of)`, `(generated_at)`, `Classe epistêmica`, `content_hash da fonte`)
returns **33 occurrences** in visible body copy (17 × `UNKNOWN`, 4 ×
`(as_of)`, 4 × `(generated_at)`, 4 × `Classe epistêmica`, 4 × `content_hash
da fonte`). On top of that string-literal count, 2 more finding *types* exist
where the **label** is legitimate PT-BR but the **value** is a raw internal
enum token (`Estado editorial` → `PUBLISHABLE_NOINDEX`; `Origem dos dados` →
`test_only_fixture`/`fixture`), present on every opportunity page and on the
CNPJ result render — these are not grep-countable by a fixed string, so they
are reported as findings, not folded into the 33. All 13 finding types below
are correctly `noindex,nofollow`
(this is a jargon/reader-clarity finding, not an indexation finding), and the
offending strings are genuine visible copy — not inside
`<script type="application/ld+json">` or an HTML comment; no such block exists
on any of these pages, so no exclusions were needed. The pattern repeats
identically across the four `oportunidades/*/index.html` instances because
they share one template (`render_opportunity_html`); line numbers below are
representative of every instance unless noted. These findings feed the new
`ARCHETYPE_EDITORIAL_READY` gate check being added to
`scripts/site/inbound_gates.py` by a parallel task — that gate is not
confirmed shipped yet as of this audit.

Fixtures backing this audit: `scripts/contract_analysis/fixtures/live-intelligence-regression/`
(see `MANIFEST.json` there for capture method and source SHA `3c26b5e494a4c816d0bb6f4ac86d43811c263131`).

---

## Surface A — opportunity pages

Template: `scripts/live_intelligence/render.py:render_opportunity_html()`.
Example instance: `oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/index.html`
(fixture: `opportunity/opportunity-example.html`). The same four findings
recur verbatim in the other three `oportunidades/*/index.html` files.

| # | File / line | Snippet | Why it fails | Suggested direction |
|---|---|---|---|---|
| 1 | `oportunidades/*/index.html:49` (row label) | `Classe epistêmica do valor` | "Classe epistêmica" is internal epistemics-modeling vocabulary (from `epistemic_class`), not a term a bidding contractor or public-sector visitor uses or needs. Its value is also a raw enum token (`FACT`, `UNKNOWN`) rather than PT-BR prose. | Rename the row to something like "Como o valor foi declarado" and translate the enum value into a short PT-BR phrase (e.g. `FACT` → "declarado como fato no edital") rather than showing the code. |
| 2 | `oportunidades/*/index.html:60` | `Data de referência da fonte (as_of)` | Literal internal field name `as_of` in parentheses, leaked straight from the data contract into a visitor-facing label. | Drop the parenthetical; the PT-BR label alone ("Data de referência da fonte") already carries the meaning. |
| 3 | `oportunidades/*/index.html:60` | `Exportação declarada (generated_at)` | Same pattern: literal internal field name `generated_at` leaked as a parenthetical. | Drop the parenthetical; keep "Exportação declarada". |
| 4 | `oportunidades/*/index.html:86` | `content_hash da fonte` | Literal snake_case internal field/column name used as a visible row label, followed by a raw hex digest as the value. | Replace with a plain PT-BR label such as "Hash de integridade da fonte" (or move the raw hash to a `<details>`/technical-appendix pattern rather than the primary reading flow). |
| 5 | `oportunidades/*/index.html:86` | `Estado editorial` → value `PUBLISHABLE_NOINDEX` | The label is fine in PT-BR, but the value is a raw internal enum/state-machine token, not natural language. | Map the enum to a short PT-BR phrase, e.g. "publicado, fora de indexação" — never the bare constant. |
| 6 | `oportunidades/*/index.html:86` | `Origem dos dados` → value `test_only_fixture` | Value is a raw internal `source_kind` enum token (test/fixture plumbing), not something a reader can interpret. | Map to PT-BR, e.g. "dado de teste (fixture), não corresponde a uma licitação real" — and consider whether a fixture-sourced record should say so more prominently given the page is otherwise readable as a real opportunity. |
| 7 | `oportunidades/*/index.html:49,50` (repeated) | Literal `UNKNOWN` shown as a table-cell value (several rows) and in body copy: *"Campo UNKNOWN significa que a fonte não publicou o dado — não significa zero."* | `UNKNOWN` is an English constant from the data pipeline shown as if it were PT-BR reader copy. It is explained once inline, which mitigates but does not fix the underlying leak — a first-time reader still meets a bare English token in a Portuguese sentence before the explanation lands. | Render the concept in PT-BR directly, e.g. "não informado pela fonte" as the cell value, keeping the explanatory sentence as reinforcement rather than a decoder for a raw token. |

## Surface B — CNPJ analysis tool landing and result shell

Files: `analise-cnpj/index.html` (fixture: `cnpj-tool-landing/cnpj-tool-landing.html`)
and `analise-cnpj/r/index.html` (fixture: `cnpj-result-shell/cnpj-result-shell.html`).
Both share the same static markup for this section.

| # | File / line | Snippet | Why it fails | Suggested direction |
|---|---|---|---|---|
| 8 | `analise-cnpj/index.html:76`, `analise-cnpj/r/index.html:55` | `Campos marcados como UNKNOWN não foram publicados pelas fontes consultadas. UNKNOWN não vale zero e não vale ausência de histórico.` | Same `UNKNOWN`-as-literal-English-token pattern as finding 7, present on the static shell before any result loads. | Same direction as finding 7 — use a PT-BR stand-in token/phrase consistently instead of the English constant. |

Note: `data-section-archetype="epistemic_boundary"` on both files (`analise-cnpj/index.html:73`,
`analise-cnpj/r/index.html:52`) is a data attribute, not visible copy, and is
**not** a finding — it is the same legitimate machine-readable pattern as
`application/ld+json`, matching the section-archetype system described in
`render.py`'s `ARCHETYPE_BY_SECTION_ID`.

## Surface B — CNPJ result page (client- and server-rendered)

The actual result content has no static file on disk — it is rendered at
request time by `assets/js/live-intelligence.js:renderResult()` (client path)
or `netlify/functions/live-intelligence-analyze.cjs:renderResultPage()`
(server, JS-absent path). Both implement the same field mapping. Findings
below cite `renderResultPage()`'s source (it is unexported, so line numbers
are file lines in `netlify/functions/live-intelligence-analyze.cjs` at
the captured SHA) and are illustrated concretely in the reconstructed fixture
`cnpj-result-example/cnpj-result-example.html` (see its line numbers too;
`renderResult()` in `assets/js/live-intelligence.js` has the equivalent
findings at the lines noted).

| # | Source / line | Snippet | Why it fails | Suggested direction |
|---|---|---|---|---|
| 9 | `netlify/functions/live-intelligence-analyze.cjs:233` (perfil row values); JS equivalent `assets/js/live-intelligence.js:181`; fixture line 24 | `const shown = raw === null || raw === "" ? "UNKNOWN" : raw;` → rendered as e.g. `<dt>porte declarado</dt><dd>UNKNOWN</dd>` | Same bare-English-token pattern as findings 7–8, here with **no explanatory sentence anywhere near it** in the `perfil` block itself (the explanation is a separate paragraph earlier on the page). | PT-BR stand-in value (e.g. "não informado") directly in the cell. |
| 10 | `netlify/functions/live-intelligence-analyze.cjs:281` (`listBlock` call); JS equivalent line 194; fixture line 31 | `UNKNOWN nas fontes` used as a visible `<h3>` section heading | An English constant used as a PT-BR section title. | Rename the heading, e.g. "O que as fontes não informaram" — and keep the list itself as the PT-BR limitation strings it already is. |
| 11 | `netlify/functions/live-intelligence-analyze.cjs:245`; JS equivalent line 210; fixture line ~ (present only when an adherent opportunity has no declared dimensions) | `const dims = (row.dimensoes || []).join(", ") || "UNKNOWN";` | Same pattern, inline in a sentence fragment rather than a table cell. | Same PT-BR stand-in. |
| 12 | `netlify/functions/live-intelligence-analyze.cjs:295`; JS equivalent line 221 (label) / 227 (value fallback); fixture line 45 | `Origem dos dados` → value from `result.fonte_kind` (raw `source_kind`/`producer_status` enum, e.g. `fixture`, `test_only_fixture`) | Same as Surface A finding 6 — raw internal enum shown as the value of an otherwise-PT-BR label. | Map to PT-BR phrase per value, consistent with the Surface A fix. |
| 13 | `netlify/functions/live-intelligence-analyze.cjs:154` (`matchResult` explicacao), `:288` (`renderResultPage` disclaimer paragraph); JS equivalent line 169 renders the same `explicacao` string; fixture lines 21, 38 | *"Campos marcados como UNKNOWN não foram publicados e não valem zero."* (result `explicacao`, shown once) and the always-appended repeat *"Campos marcados como UNKNOWN não foram publicados pelas fontes consultadas. UNKNOWN não vale zero..."* (hardcoded in `renderResultPage`, right after the disclaimer) | Two instances of the same explanatory sentence on the same rendered page, both still built around the bare English token rather than translating the concept. | Same direction as finding 7; also consider collapsing the two near-duplicate explanatory sentences into one, since the CNPJ result page currently states the same UNKNOWN caveat twice in different words. |

---

## Occurrence count by file

Literal grep count of `UNKNOWN` / `(as_of)` / `(generated_at)` / `Classe
epistêmica` / `content_hash da fonte` in each captured fixture's visible body
copy:

| File | `UNKNOWN` | `(as_of)` | `(generated_at)` | `Classe epistêmica` | `content_hash da fonte` |
|---|---|---|---|---|---|
| `oportunidades/cc-2026-000047-ponte-rio-do-sul-sc/index.html` | 5 | 1 | 1 | 1 | 1 |
| `oportunidades/pe-2026-000188-reforma-ubs-londrina-pr/index.html` | 1 | 1 | 1 | 1 | 1 |
| `oportunidades/pe-2026-000412-pav-urbana-chapeco-sc/index.html` | 1 | 1 | 1 | 1 | 1 |
| `oportunidades/pe-2026-000903-sinalizacao-viaria-caxias-rs/index.html` | 1 | 1 | 1 | 1 | 1 |
| `analise-cnpj/index.html` | 2 | 0 | 0 | 0 | 0 |
| `analise-cnpj/r/index.html` | 2 | 0 | 0 | 0 | 0 |
| `cnpj-result-example.html` (reconstructed) | 5 | 0 | 0 | 0 | 0 |
| **Total** | **17** | **4** | **4** | **4** | **4** |

Grand total of grep-countable literal occurrences: **33**. The
`cc-2026-000047-ponte-rio-do-sul-sc` opportunity is a records-with-more-gaps
example (an UNSPECIFIED/SUSPENSA session with several undeclared fields), so
it carries more `UNKNOWN` cells than the other three; the per-file pattern
otherwise repeats identically because all four share one template.

Two further finding types (raw enum values under otherwise-clean PT-BR labels
— `Estado editorial` and `Origem dos dados`) are not part of the 33 above
because they are not tied to a fixed grep string; they are present once per
opportunity page (4 instances each, findings 5–6) and once on the CNPJ result
render (finding 12).

## What was explicitly checked and excluded

- `<script type="application/ld+json">`: absent from every page in this
  surface (`oportunidades/*`, `analise-cnpj/*`) — nothing to exclude.
- HTML comments: none of the audited files carry an HTML comment containing
  any of the grepped terms.
- `data-section-archetype="epistemic_boundary"` and the other
  `data-section-archetype`/`data-*` attributes throughout these pages: not
  visible copy, not findings (see note above).
- `UNKNOWN` used as a `data-*` attribute value or in `robots`/meta content:
  none found; every `UNKNOWN` occurrence audited above is inside visible body
  text (`<td>`, `<p>`, `<h3>`, `<dd>`, or an inline sentence fragment).

## Not fixed by this audit

This document is read-only findings only. No renderer, template, or output
file was modified to produce it. The fix belongs to the Live Intelligence
renderer owner (`scripts/live_intelligence/render.py`,
`assets/js/live-intelligence.js`, `netlify/functions/live-intelligence-analyze.cjs`).
