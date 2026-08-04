# Relatório consolidado — restauração do `main` e coorte editorial

Data: 2026-08-04  
Repo: `tjsasakifln/web-cfg`  
**HEAD de referência do restore (#44):** `49d61778192c7c7fbf53409d9a1c7c9f37c32a2a`  
**Tip de `main` após merges subsequentes de coorte/UI:** ver `git rev-parse origin/main`

## 1. Estado anterior

- PR #6 subiu `lighthouse` para `13.4.1` (engines Node `>=22.19`).
- Lockfile dessincronizado (`npm ci` → `EUSAGE`); pSEO não completava install/build.
- Follow-ups elevaram GHA para Node 22 enquanto Netlify permanecia `NODE_VERSION=20` (split-brain).
- Gate pSEO **não era** obrigatório; `site-ci` podia mascarar falha de install com `npm ci || npm install`.
- Pacote editorial apontava SHA antigo; Wave 1 com 11 páginas aguardando humano, 0 indexáveis, 1 rejeitada.

## 2. Correções realizadas (e incorporadas em `main`)

| PR | Status | Escopo |
|----|--------|--------|
| [#41](https://github.com/tjsasakifln/web-cfg/pull/41) | **Merged** | Pin `lighthouse@^12.8.2`, `engines >=18`, GHA Node 20, lock regenerado; fix type-floor `.related-card` (14px) |
| [#42](https://github.com/tjsasakifln/web-cfg/pull/42) | **Merged** | `npm ci` hard-fail; nomes estáveis `site-ci` / `pSEO quality gates`; `test:workflow-gates`; docs de protection |
| [#43](https://github.com/tjsasakifln/web-cfg/pull/43) | **Merged** | Regen pack editorial + pin SHA; `HUMAN_APPROVED=0`; `INDEXABLE=0`; jur REJECTED |
| [#44](https://github.com/tjsasakifln/web-cfg/pull/44) | **Merged** | Coorte ≤3 + runbook + nota Node22 + relatório consolidado |

Nota futura (não misturada na emergência): `docs/ops/NODE22-LIGHTHOUSE13-MIGRATION-NOTE.md`.

## 3. Checks atuais (comprovados)

| Check | Estado |
|-------|--------|
| `npm ci` limpo (Node 20) | **Verde** no tip de restore (zero `EBADENGINE`) |
| `site-ci` / `pSEO quality gates` em push a `main` pós-#43/#44 | **Verde** (GitHub Actions) |
| `test:workflow-gates` | **Verde**; falha deliberada com `WORKFLOW_GATE_FORCE_FAIL=1` |
| Branch protection (API) | **Aplicada**, `strict: true`, contextos: **`site-ci`**, **`pSEO quality gates`** |
| CodeQL | Workflow com `continue-on-error: true` até code scanning org; **não** é required check |

## 4. Estado de produção comprovado

| Item | Resultado |
|------|-----------|
| `https://confenge.com.br/` | HTTP 200 |
| `/.well-known/build-info.json` | HTTP 200; **`commit` = `49d61778192c7c7fbf53409d9a1c7c9f37c32a2a`** no deploy pós-#44 |
| `build_time` (prod) | `2026-08-04T14:36:09Z` |
| `deploy_id` | `6a71f8bdc9c23b00083247ff` |
| robots / sitemap-index | HTTP 200 |
| Lead idempotency | **Comprovado em testes** (`test:lead-function`, onlyIfNew) |
| Métricas real-only | Testes revops mantidos; probes fora do commercial |

Produção recebeu o tip do restore (LH 12.8.2, gates hard-fail, pack editorial). Merges posteriores em `main` podem avançar o tip sem invalidar a restauração.

## 5. Estado editorial

| Campo | Valor |
|-------|--------|
| Terminal | `READY_FOR_NAMED_HUMAN_APPROVAL` |
| HUMAN_APPROVED | 0 |
| INDEXABLE_WAVE1 | 0 |
| AWAITING_HUMAN | 11 |
| REJECTED | 1 (`jur-sumula-260-art`) |
| Sitemap editorial / juris Wave1 | 0 locs |
| `editorial:release-approved` | noop sem aprovação humana válida |
| Coorte | 3 páginas **preparadas**, não aprovadas — `docs/editorial/WAVE1-FIRST-COHORT.md` |

## 6. Bloqueios externos remanescentes

1. **Confirmação visual** da branch protection na UI do GitHub (API já aplicada).
2. **Code scanning / CodeQL org** — soft-fail permanece até enablement; não bloqueia merge.
3. **Aprovação editorial humana** — ainda não executada (por desenho fail-closed).
4. **GSC submit / baseline pós-approve** — só após runbook de publicação.

## 7. Três próximas ações humanas (ordem)

1. **Confirmar na UI** Settings → Branches → `main` que os required checks são exatamente **`site-ci`** e **`pSEO quality gates`** (strict).
2. **Aprovar individualmente** no máximo as 3 candidatas da coorte (`docs/editorial/WAVE1-FIRST-COHORT.md` / `HUMAN-ACTION-NOW.md`) com nome real, checklist e material hash — sem lote, sem CI/bot/agente como revisor.
3. **Seguir** `docs/editorial/WAVE1-POST-APPROVAL-RUNBOOK.md` após cada approve (canibalização → rebuild → robots/sitemap → lista GSC → smoke → baselines reais).

---

### O que não foi feito / não inventado

- Migração Node 22 / Lighthouse 13 em produção (só nota futura).
- Indexação ou approve de qualquer página Wave 1.
- Causalidade de tráfego, receita, leads ou ranking.
- Screenshot da UI do GitHub (API + deploy/prod comprovados).
