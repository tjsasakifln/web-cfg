# Official-live replay runbook — contract analysis

Fail-closed consumer path for extra-cli
`authority-handoff-contract-analysis/1.0` (additive `1.1`) and
`public-read-contract-analysis/1.x`.

This campaign did **not** find a verified official rendezvous. No analysis
was written. `index_count` stays `0`. #83 stays open.

## Rendezvous

```text
${CONFENGE_HANDOFF_DIR:-$HOME/.local/share/confenge/handoffs}/contract-analysis/official-live-01/
```

Required before ingest:

1. `READY.json` exists and `status=READY`.
2. `SHA256SUMS` matches every listed file byte-for-byte.
3. `READY.manifest_sha` equals SHA-256 of `manifest.json`.
4. `READY.root_content_hash` equals `manifest.content_hash`.
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

- Official rendezvous: **absent**
- READY.json: **absent**
- BLOCKED.json: **absent**
- Sibling fixture pack: present, `catalog_mode=fixture`, not consumed as live
- Decision: land Faixa A fail-closed infrastructure; do not close #83
