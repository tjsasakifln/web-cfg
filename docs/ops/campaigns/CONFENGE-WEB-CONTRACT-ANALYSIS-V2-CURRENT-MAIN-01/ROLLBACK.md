# Rollback — CONFENGE-WEB-CONTRACT-ANALYSIS-V2-CURRENT-MAIN-01

## Command

```text
python3 -c "from scripts.contract_analysis.approval import withdraw_approval; withdraw_approval('13ec615146b3d348190a9b0b9148831e', actor='OWNER_CONFENGE_CONDITIONAL', reason='rollback')"
python3 -m scripts.contract_analysis build
```

## Exercised 2026-08-20T12:13:30Z

Withdraw count=1. Rebuild `index_count=0`.

| Surface | After withdraw+rebuild |
|---|---|
| robots meta | `noindex,nofollow,noarchive` |
| family sitemap file | absent |
| robots Allow canary | false |
| X-Robots `index, follow` | false |
| sitemap-index family member | false |
| canary in graph locs | false |
| graph_count | 64 (same as BEFORE) |

No leftover `index,follow` last-match for the canary. No ghost loc in derived sitemaps.

Re-approval with token `OWNER_CONDITIONAL_PREAPPROVAL_CONTRACT_ANALYSIS_CANARY_V2_2026_08_20` restored INDEX with identical material/render hashes.

## Emergency

If production is INDEX and hashes drift: withdraw, rebuild, deploy that SHA. Do not edit robots/headers by hand; the pipeline rewrites the family block.

## Shared-shell recapture

A changed `rendered_content_hash` does not by itself authorize a new editorial
approval. When an expressly authorized shared-shell change causes the drift,
first compare the generated source HTML with the previously approved page and
prove that the material hash, factual content, sources, calculations, limits,
authorship, canonical, robots, JSON-LD and contextual CTA are unchanged. Record
the prior and resulting rendered hashes, the exact presentation delta and the
authorization in `approvals.json`, then rebuild and validate the family.

Any difference outside that bounded presentation comparison remains a real
approval drift: leave the gate fail-closed and obtain an individual human
approval. Never use a shell recapture to alter the editorial decision.
