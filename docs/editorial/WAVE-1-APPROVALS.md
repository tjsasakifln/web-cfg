# Wave 1 approvals

## Current state
| Stage | Count |
|-------|------:|
| EDITORIAL_REVIEWED (machine gates passed) | 11 |
| HUMAN_APPROVED | 0 |
| INDEXABLE | 0 |
| REJECTED | 1 |

**No automated HUMAN_APPROVED is valid.**  
Revoked stamps from `editorial-wave1-operator` on 2026-08-02.

## Who may approve
A real named human (e.g. `Tiago Sasaki`). Blocked patterns: `*operator*`, `ci-*`, `bot-*`, `auto-*`, `system`, `pipeline`, `test-*`.

## Required progression per page
1. DRAFT  
2. LEGAL_SOURCE_VALIDATED (sources in SOURCE-MANIFEST)  
3. TECHNICAL_REVIEWED (devices, CTAs, schema)  
4. EDITORIAL_REVIEWED (naturalness gates) — **automated build stops here**  
5. HUMAN_APPROVED — **`approve_cli.py` only**  
6. INDEXABLE — `--indexable` flag on approve CLI  
7. PUBLISHED — after production deploy confirmation (optional status)

## Command

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-art124-alteracao-obra \
  --notes "Planalto arts. 124–126 conferidos; CTAs e naturalidade OK; sem promessa de resultado." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --indexable
```

Then `npm run editorial:build` and deploy.

## Autoria pública
`author_is_tiago=false` until Tiago explicitly approves with byline flag change in page JSON + re-approval.
