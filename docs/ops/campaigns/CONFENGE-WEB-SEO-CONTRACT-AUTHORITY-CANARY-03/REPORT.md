# Campaign report — CONFENGE-WEB-SEO-CONTRACT-AUTHORITY-CANARY-03

Decision state: **EXECUTE_NOW** (canary of one analysis).  
Front: Inbound Engine / Authority.  
Time to evidence: this draft PR.  
Leverage: trust + distribution + customer adjacency (margin-defense CTA).  
100 repetitions: the *pipeline* (consume → quality → hash-bound owner token) compounds; page count does not.

## Candidate and why

`13ec615146b3d348190a9b0b9148831e` — PNCP `14862788000150-2-000069/2026`.

Score (qualitative, 1–5): singularidade 5 × utilidade AEC B2G 5 × evidência documental 5 × capacidade de explicação 5 × adjacency (reajuste / defesa de margem) 5 ÷ risco reputacional/manutenção 2 = **high**.

Not a ficha. Insight is the three clocks in one instrument (vigência ≠ orçamento estimado 12.1 ≠ orçamento da proposta 12.2) plus INCC Coluna 35 marked in the Parte Específica. Independent of names, city and the BRL/m² quotient. extra-cli #435 does not supply a peer group; the insight does not need one.

No other official-live READY handoff existed. Non-duplication: one URL, one analysis_id.

## Final decision

**INDEX_READY_FOR_INTEGRATION** (consumer `PUBLISHABLE_INDEX` for exactly one URL).

Reason codes: none blocking. Comparison remains `NOT_COMPARABLE` (`no_comparative_claim`, `singular_document_insight`). extra-cli #435 unmerged / `HOLD_FOR_DATA` is disclosed, not papered over.

Producer `READY` / `publication_authorization=false` / `index_authorization=false` were **not** treated as INDEX permission. INDEX is a consumer decision bound to:

- token `OWNER_PREAPPROVAL_CONTRACT_ANALYSIS_CANARY_2026_08_19`
- `approved_by=OWNER_CONFENGE`
- official payload / dossier `content_hash` `f7ed6bcc70a74e274c222b89293afaf430ed88679264c4189bbe4c033fabcb1b`
- READY `root_content_hash` `5957e02b7982e000ca7dda2a9a06b88769085bc2a163eadcd8d59bd134b26b3e`
- material_hash `eaa713a4c7cbf2af6ae5d4104edb5fb2d1799bee57c59f6d0099fcf12fa1a38a`
- rendered-content hash `8c29321e81d6ecfd086e63d4fdc554d0bc9c488c166e6b01fd1ed24bcf1f3ae7`

Any one-byte material or render drift refuses INDEX.

The 2026-08-17 token `OWNER_CONDITIONAL_APPROVAL_CONTRACT_ANALYSIS_CANARY_2026_08_17` cannot grant this campaign’s INDEX.

## Claims / sources matrix

| claim | class | grain / unit / date | source / locator |
|---|---|---|---|
| objeto pavimentação 4.710,00 m² em São Gonçalo do Piauí | FACT | area m²; listing as_of 2026-08-18 | PNCP JSON `$.objetoContrato` SHA `89a3ba4c…` |
| valorGlobal 719177.48 BRL | FACT | BRL; listing as_of 2026-08-18 | `$.valorGlobal` SHA `89a3ba4c…` |
| vigência 2026-07-08 → 2027-07-08 | FACT | calendar dates | `$.dataVigenciaInicio` / fim SHA `89a3ba4c…` |
| unidade município Teresina | FACT | published string | listing `unidadeOrgao.municipioNome` |
| cláusula 12.1 irreajustabilidade a partir do orçamento estimado | FACT | PDF p.13 | PDF SHA `64a238e6…` page 13 |
| cláusula 12.2 interregno a partir do orçamento da proposta; fórmula Io/I | FACT | PDF p.14 | PDF SHA `64a238e6…` page 14 |
| cláusula 12.3 INCC Coluna 35 / FGV | FACT | PDF p.14 | PDF SHA `64a238e6…` page 14 |
| Parte Específica 12.3 marcada (x) | FACT | PDF p.46 | PDF SHA `64a238e6…` page 46 |
| 719177.48 / 4710.00 = 152.6916 BRL/m² | CALCULATION | Decimal quantize 0.0001; valor_global ÷ área do objeto | same listing fields |
| três relógios não compartilham a mesma base de data | INFERENCE | — | PDF 12.1/12.2 + listing vigência |
| índice aplicável no instrumento é Coluna 35 | INFERENCE | not “pago” | PDF p.46 |
| 12.5 descreve procedimento, não reajuste vencido | INFERENCE | — | PDF p.14 |
| datas de orçamento; local da execução; medição; requerimento | UNKNOWN | — | absent from pack |
| peer benchmark / custo/km / SINAPI | NOT_COMPARABLE | reason_code `no_comparative_claim,singular_document_insight` | extra-cli #435 HOLD_FOR_DATA |

No irregularity, culpa, fraude, direito líquido, or CONFENGE commercial relation is claimed.

## Hashes

See `{SCRATCH}/hashes.json` and `data/editorial/contract-analysis/approvals.json`. Two consecutive builds on the same snapshot produced identical official-payload and rendered hashes.

## Tests

- `python3 -m pytest scripts/contract_analysis/tests -q` — 170 passed (includes `test_canary_03_preapproval.py` driving consume → quality → gate → render → token/hash binding + drift).
- `npm run test:authority` — pass.
- `npm run test:visible-parity` — pass.
- `npm run contract-analysis:build` ×2 + `validate` ×2 — `ok: true`, `index_count: 1`, `render_mismatch: []`.

## Files (exclusive tree)

- `scripts/contract_analysis/**` (token, preapproval, render/citation/refresh, crawler sync, consume reason_code/timeline label)
- `scripts/contract_analysis/tests/test_canary_03_preapproval.py` + focused updates
- `data/editorial/contract-analysis/overlays/13ec615146b3d348190a9b0b9148831e.json`
- `data/editorial/contract-analysis/approvals.json`
- preview + family sitemap/robots/_headers only as required by the single INDEX URL
- review packet + this campaign ops folder

`package.json` unchanged. No writes under revops/organic/data-desk/conteudos/offers/extra-cli.

## Preview

`/analises-contratos-publicos/reajuste-incc-coluna-35-paralelepipedo-sao-goncalo-piaui-2026/`

Hub remains `noindex` (family index_count < 3). Fixture previews remain `noindex` and off every sitemap.

## Rollback / kill switch

`withdraw_approval('13ec615146b3d348190a9b0b9148831e')` then rebuild: family Disallow + X-Robots noindex restored, family sitemap removed, page returns to noindex.

## Blockers / UNKNOWN

- Data do orçamento estimado e do orçamento da proposta: UNKNOWN.
- Local da execução (Teresina vs São Gonçalo do Piauí): UNKNOWN.
- extra-cli #435 peer group: HOLD_FOR_DATA; not a block for this insight.
- Revisão jurídica externa: ausente, não simulada.
- Merge/deploy: not done. Producer READY still does not authorize INDEX by itself.

## Recommendation

**INDEX_READY_FOR_INTEGRATION**

The family status report may say EXPAND; this campaign does **not** authorize a second analysis or a quota. Measure citation, correction and qualified engagement on this single URL first.
