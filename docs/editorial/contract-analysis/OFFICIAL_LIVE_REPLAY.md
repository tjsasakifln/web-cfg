# Official-live replay runbook — contract analysis

Fail-closed consumer path for extra-cli
`authority-handoff-contract-analysis/1.0` (additive `1.1`) and
`public-read-contract-analysis/1.x`.

Official rendezvous is **READY**. One analysis of class
`ANALISE_TECNICA_CONTRATO_PUBLICO` was written from
`analysis_id=13ec615146b3d348190a9b0b9148831e` and remains
`PUBLISHABLE_NOINDEX` / `READY_FOR_HUMAN_REVIEW`. `index_count` stays
`0`. #83 stays open. No publication or INDEX authorization was applied.

## Rendezvous

```text
${CONFENGE_HANDOFF_DIR:-$HOME/.local/share/confenge/handoffs}/contract-analysis/official-live-01/
```

Required before ingest:

1. `READY.json` exists and `status=READY`.
2. `SHA256SUMS.txt` (1.1) or `SHA256SUMS` (1.0) matches every listed file.
3. `READY.manifest_sha256` (1.1) or `READY.manifest_sha` (1.0) equals SHA-256 of `manifest.json`.
4. 1.1: `READY.root_content_hash` equals the hash of `{ids, hashes: manifest.content_hashes}` (clocks stripped). 1.0: `READY.root_content_hash` equals `manifest.content_hash`.
5. `producer_commit` is present on READY or manifest.
6. `dossier_count` equals the listed `dossier_ids`.
7. `catalog_mode=official_live` and `official_live=true`.
8. `handoff_status=HANDOFF_READY` on the selected dossiers.
9. Source-claim matrix present. Replay command present.

If `BLOCKED.json` exists and `READY.json` does not, stay `noindex` and
record the blocker. Do not invent dossiers.

A sibling extra-cli fixture pack
(`exports/authority-handoff/contract-analysis/1.0`, `catalog_mode=fixture`)
is **not** official_live, even when individual dossiers say
`HANDOFF_READY`. Producer `publication_authorization` /
`index_authorization` / `no_index_authorization` never grant INDEX.

## Replay (producer)

From extra-cli, on an isolated official-live window:

```bash
python3 -m scripts.historical_contract_authority --mode live \
  --as-of "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --output "${CONFENGE_HANDOFF_DIR:-$HOME/.local/share/confenge/handoffs}/contract-analysis/official-live-01"
```

Two launches on the same snapshot must produce identical `SHA256SUMS`.

## Replay (consumer)

From this repository, after READY exists:

```bash
python3 -m scripts.contract_analysis build
python3 -m scripts.contract_analysis validate
python3 -m pytest scripts/contract_analysis/tests -q
```

Then evaluate at most 3 `HANDOFF_READY` dossiers, write at most 3 drafts
labeled **ANÁLISE TÉCNICA DE CONTRATO PÚBLICO**, and promote at most one
page to `PUBLISHABLE_INDEX` only when every owner-token condition holds
(`OWNER_CONDITIONAL_APPROVAL_CONTRACT_ANALYSIS_CANARY_2026_08_17`). Any
failed condition keeps `noindex,nofollow` off every sitemap.

## Observed this run

- Official rendezvous: **READY** (`official-live-authority-handoff/1.1`)
- analysis_id: `13ec615146b3d348190a9b0b9148831e`
- PNCP: `14862788000150-2-000069/2026`
- producer_commit: `5984750c14a4653bf64e16ba7547063f3e1cdab9`
- dossier content_hash: `f7ed6bcc70a74e274c222b89293afaf430ed88679264c4189bbe4c033fabcb1b`
- READY root_content_hash: `5957e02b7982e000ca7dda2a9a06b88769085bc2a163eadcd8d59bd134b26b3e`
- State: `PUBLISHABLE_NOINDEX` / `READY_FOR_HUMAN_REVIEW`
- `index_count`: **0**
- `publication_authorization` / `index_authorization`: **false**
- Decision: do not INDEX; do not close #83; wait for Tiago Sasaki to read the packet
