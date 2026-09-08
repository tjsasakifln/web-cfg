# Audit — existing distribution surfaces (issue #66 Lane A)

**Date:** 2026-08-15  
**Proof asset chosen:** live Radar Nacional (`/radar/nacional-obras-publicas/`)  
**Not chosen:** PR #73 EDIÇÃO ZERO (preview / `NEEDS_DATA` / do not fire imprensa)

## Packs and surfaces

| Surface | What it is | Reuse decision |
| --- | --- | --- |
| `data/distribution/radar-outreach-kit.json` | PR #25. 30 contacts, templates, `auto_send: false`, statuses `nao_contatado`… | Audited source. Mapped through the fit gate. **Not** cloned as a second farm. Old status vocabulary is not the outcome enum. |
| PR #73 `data/distribution/edicao-zero-research-pack.json` | Open PR, dirty mergeable, `NEEDS_DATA`, `indexable: false`, “Não disparar imprensa nesta edição.” | Preview only. Utility gate must fail closed. Files not copied here. |
| `/radar/nacional-obras-publicas/` | Public methodology + GSC sample + JSON/PDF downloads + cite line. Contract recortes `em preparação`. | **Proof asset.** Citation primitives already present. |
| `/imprensa/` | Institutional kit, human outreach list, no auto-send. | Pointers only. Not restyled. |
| `seo/` GSC export `seo/gsc-2026-07-30` | Source of the published sample. | Quotable stat source. Not a national census. |
| `docs/strategy/MARKET-CAPTURE-OS.md` | Lane 1 = Earned Distribution (#66). | Already on `origin/main` via PR #75. Not edited. |

## Citation primitives vs missing

| Primitive | Status |
| --- | --- |
| Stable citation link | Already present (canonical URL + “Como citar”). |
| Quotable stat | Already present: GSC sample (88 impressions / 0 clicks on SINAPI desonerado; query “desonerado e não desonerado” = 10 impressions, pos. 9.2). Honest limitation stated on-page. |
| Chart card metadata | Already present as HTML tables (section 2). No separate PNG card; site not restyled. |
| Source/method block | Already present (section 1 `method-box`). |
| Safe download | Present: `gsc-demand-sample.json`. No PII. `radar-nacional.pdf` **withdrawn 2026-09-07** — see the correction note below. |

Nothing new was invented. National contract volumes remain unpublished.

## Inherited 30-row kit

Six publicly identifiable orgs have editorial fit with the *published* methodology page: CBIC, SINDUSCON-SP, ADN da Construção, InfraROI, Revista O Empreiteiro, IBAPE.

The other 24 rows fail fit (generic newsrooms, LinkedIn labels, newsletters without a named editor, government portals, regional syndicates without a published UF recorte, materials/SEBRAE/CREA spray). Prepare reports them as do-not-contact. Contact-list length is not a success metric; `scripts/site/test_tool_events.mjs` no longer treats `contacts.length < 30` as failure.

## Correction — 2026-09-07

The audit above was accurate about what the page *contained* and wrong about what the page
*promised*. Four defects were found and fixed after this audit was written; the audit is kept
as published and corrected here rather than rewritten.

1. **Entity renamed.** Title, `h1`, `og:title`, the schema.org `Dataset` name and the breadcrumb
   leaf advertised a *national* radar of public works and contractual margin while all six
   national cuts on the same page read `em preparação`. The served entity is now "Radar de obras
   públicas: método aberto e demanda observada". The URL and the canonical are unchanged — an
   established URL is not renamed to improve a label.
2. **Window and denominator disclosed.** The page cited only the export id. The export's saved
   filter says `Últimos 3 meses`, but `seo/gsc-2026-07-30/Grafico.csv` carries 15 daily rows,
   2026-07-14 to 2026-07-28, summing to 10 clicks and 325 impressions for the whole property.
   The observed window and that denominator are now on-page, and the published JSON no longer
   restamps the aggregate with a single per-row `date`.
3. **PDF withdrawn.** `radar-nacional.pdf` (133 120 bytes, md5 `75eb07a99716eeb62e99f89ae72d2b0c`, byte-identical to
   what production served) was a pre-correction render: it still said `pending_lineage`, named
   `extra-cli` and `data/revops/gsc/latest_import.json`, and every internal link in it was a dead
   `file:///` URL. It was removed rather than re-served. There is no PDF reader in
   `requirements-ci.txt`, so no gate here could prove a fresh render stays truthful; the HTML page
   is the citable version.
4. **Parent links down.** `/radar/` is the declared breadcrumb parent but never linked to
   `/radar/nacional-obras-publicas/`. It now carries one accurate card.

The window, the denominator and the row grain are re-derived from the export by
`scripts/demand_radar/public_sample.py` on every `npm run demand-radar:check`, and the properties
above are pinned with counter-cases in `tests/demand_radar/test_public_sample.py`.

## What was not observed

No external mention, live contact, branded-search lift, QCO, pipeline or revenue. Those fields stay `UNKNOWN`.
