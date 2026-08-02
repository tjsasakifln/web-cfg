# FINAL — Editorial + pSEO inbound (Wave 1)

**Terminal status:** `BLOCKED_WITH_EXACT_EXTERNAL_ACTIONS`

Machine-readable: `docs/editorial/TERMINAL-RESULT.json` · Skeptic closed: `seo/editorial-evidence/SKEPTIC-CLOSED-PROOF.json` (`all_skeptic_closed: true`).

**Date:** 2026-08-02  
**Repo tip after remediation:** (see git log)  
**pSEO intelligence:** 0 publishable (fail-closed preserved)

## Why not COMPLETE

The objective forbids automated `HUMAN_APPROVED` stamps and false Tiago bylines.  
Automated build now advances at most to **`EDITORIAL_REVIEWED`**.  
**0 pages are INDEXABLE** until a named human runs `approve_cli.py`.

Claiming COMPLETE while `editorial-wave1-operator` auto-approved was incorrect; those stamps were **revoked**.

## Initial state (revalidated)
| Metric | Value |
|--------|------:|
| pSEO candidates | 23 |
| pSEO publishable | 0 |
| reject / noindex (pSEO) | 18 / 5 |
| sitemap-inteligencia | empty |

## Wave 1 material (gates-passed, not indexable)
| Status | Count |
|--------|------:|
| EDITORIAL_REVIEWED (awaiting human) | 11 |
| REJECTED (jurisprudence incomplete) | 1 |
| INDEXABLE | 0 |

### Awaiting human approval (11)
- `/lei-14133-obras/art-124-alteracao-contratual-obra/`
- `/lei-14133-obras/limite-25-50-aditivo-obra/`
- `/lei-14133-obras/preco-item-novo-desconto-proposta/`
- `/lei-14133-obras/reequilibrio-reajuste-repactuacao/`
- `/lei-14133-obras/atraso-imputavel-administracao/`
- `/lei-14133-obras/parcela-incontroversa-medicao-pagamento/`
- `/lei-14133-obras/servico-executado-sem-termo-aditivo/`
- `/guias-contratos-obras/checklist-pedido-aditivo/`
- `/guias-contratos-obras/documentos-pedido-reequilibrio/`
- `/guias-contratos-obras/contestar-glosa-medicao/`
- `/guias-contratos-obras/responder-notificacao-atraso/`

All live with **`noindex,follow`**, out of editorial sitemaps.

### Rejected
- `/jurisprudencia-contratos-obras/tcu-sumula-260-art-obras/` — generic TCU portal URL + missing sumula date/text verification.

## Exact external actions to unblock

### 1) Named human legal + editorial approval (required for INDEXABLE)
For each page_id in `data/editorial/EDITORIAL-REGISTRY.json` with status `EDITORIAL_REVIEWED`:

```bash
python3 scripts/editorial/approve_cli.py \
  --reviewer "Tiago Sasaki" \
  --page-id lei-art124-alteracao-obra \
  --notes "Planalto arts. 124–126 conferidos; CTAs e naturalidade OK; sem promessa de resultado." \
  --sources lei-14133-art124,lei-14133-art125,lei-14133-planalto,agu-alteracoes-contratuais-2024 \
  --indexable
```

Reviewer must be a **real person name** (not `operator`/`bot`/`ci`).  
Notes ≥ 20 chars; sources_verified non-empty.

Then:

```bash
npm run editorial:build
npm run build:site   # or Netlify deploy
```

### 2) Jurisprudence dossier (optional for Wave 1 B)
Before approving any case-law page:
- Capture official Súmula TCU nº 260 full text + approval date from TCU official source
- Store stable official URL (not generic `/jurisprudencia/`)
- Set `decision_date`, source hash, limitations
- Re-run gates; only then approve

### 3) Search Console (after first INDEXABLE set)
- Submit `sitemap-editorial.xml` / `sitemap-jurisprudencia.xml` only when non-empty with approved URLs

### 4) Cannibalization follow-up after first approvals
When a Wave 1 URL becomes INDEXABLE and overlaps a `manter` `/conteudos/` page:
- Choose canonical winner
- noindex or canonicalize loser
- See `CONTENT-CANNIBALIZATION-REPORT.md`

### 5) Intelligence pSEO
- Improve `extra-cli` snapshot (sample size, prefixes, evidence) without lowering gates

## System delivered (ready for human unlock)
- Editorial engine: sources, registry progression LEGAL→TECH→EDITORIAL→HUMAN→INDEXABLE
- Naturalness / AI-residue / CTA / source gates + tests (14 passed)
- Build refuses `--auto-approve`
- Hubs + pages rendered; CTAs WhatsApp+mailto contextual
- Analytics hooks in `script.js` → `/.netlify/functions/collect`
- Segmented sitemaps (empty while 0 indexable — honest)
- Evidence: deep review 36%, screenshots desktop/mobile, conversion smoke, env notes

## Production posture after this remediation deploy
- Wave 1 HTML may be reachable but **noindex**
- Editorial/jurisprudência sitemaps **empty** (0 indexable)
- Intelligence still 0 publishable

## Evidence paths
- `docs/editorial/*`
- `seo/editorial-evidence/*` (screenshots, deep-review, conversion, env-limit)
- `scripts/editorial/tests/test_editorial_gates.py`
EOF

write docs/editorial/WAVE-1-APPROVALS.md << 'EOF'
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
See FINAL-EDITORIAL-PSEO-INBOUND.md section “Exact external actions”.

## Autoria pública
`author_is_tiago=false` until Tiago explicitly approves with byline flag change in page JSON + re-approval.
EOF

cp docs/editorial/FINAL-EDITORIAL-PSEO-INBOUND.md seo/editorial-evidence/
cp docs/editorial/WAVE-1-APPROVALS.md seo/editorial-evidence/ 2>/dev/null || true
cp data/editorial/EDITORIAL-REGISTRY.json docs/editorial/EDITORIAL-REGISTRY.json
cp seo/editorial-build-report.json seo/editorial-evidence/
