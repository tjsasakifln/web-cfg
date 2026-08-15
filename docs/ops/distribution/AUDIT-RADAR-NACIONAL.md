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
| Safe download | Already present: `gsc-demand-sample.json`, `radar-nacional.pdf`. No PII. |

Nothing new was invented. National contract volumes remain unpublished.

## Inherited 30-row kit

Six publicly identifiable orgs have editorial fit with the *published* methodology page: CBIC, SINDUSCON-SP, ADN da Construção, InfraROI, Revista O Empreiteiro, IBAPE.

The other 24 rows fail fit (generic newsrooms, LinkedIn labels, newsletters without a named editor, government portals, regional syndicates without a published UF recorte, materials/SEBRAE/CREA spray). Prepare reports them as do-not-contact. Contact-list length is not a success metric; `scripts/site/test_tool_events.mjs` no longer treats `contacts.length < 30` as failure.

## What was not observed

No external mention, live contact, branded-search lift, QCO, pipeline or revenue. Those fields stay `UNKNOWN`.
