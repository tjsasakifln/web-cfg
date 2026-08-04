# Relatório consolidado — restauração do `main` e coorte editorial

Data do trabalho: 2026-08-04  
Repo: `tjsasakifln/web-cfg`

## 1. Estado anterior

- PR #6 subiu `lighthouse` para `13.4.1` (engines Node `>=22.19`).
- Lockfile ficou fora de sincronia (`npm ci` → `EUSAGE`); pSEO não completava install/build.
- Depois, PR #37 (e linha relacionada) sincronizou lock e elevou GHA para Node 22, **enquanto Netlify permanecia `NODE_VERSION=20`** (split-brain).
- Gate pSEO **não era** obrigatório para merge; `site-ci` podia mascarar falha de install via `npm ci || npm install`.
- Pacote editorial (`HUMAN-ACTION-NOW`, terminal/packet) referenciava SHA antigo; Wave 1 com 11 páginas aguardando humano, 0 indexáveis, 1 rejeitada.

## 2. Correções realizadas

| PR | Branch | Escopo |
|----|--------|--------|
| [#41](https://github.com/tjsasakifln/web-cfg/pull/41) | `fix/restore-lighthouse-build-integrity` | Pin `lighthouse@^12.8.2`, `engines >=18`, GHA Node 20, lock regenerado, zero EBADENGINE |
| [#42](https://github.com/tjsasakifln/web-cfg/pull/42) | `fix/pseo-gate-required-checks` | `npm ci` hard-fail; nomes estáveis `site-ci` / `pSEO quality gates`; `test:workflow-gates`; `docs/ops/REQUIRED-BRANCH-CHECKS.md` (**PENDING HUMAN**) |
| [#43](https://github.com/tjsasakifln/web-cfg/pull/43) | `docs/editorial-regen-green-head` | Regen pack + pin SHA; HUMAN_APPROVED=0; INDEXABLE=0; jur REJECTED |
| [#44](https://github.com/tjsasakifln/web-cfg/pull/44) | `docs/wave1-first-cohort-prep` | ≤3 candidatas + runbook pós-aprovação |

Nota futura (não misturada na emergência): `docs/ops/NODE22-LIGHTHOUSE13-MIGRATION-NOTE.md`.

## 3. Checks atuais

**Update:** PR #41 and #42 merged to main (2026-08-04). Required branch checks: `site-ci`, `pSEO quality gates`.


| Check | Estado neste ambiente |
|-------|------------------------|
| `npm ci` limpo (Node 20) | **Verde local** (logs scratch `npm-ci.log`) |
| Suite PR1 (`npm test`, build, pseo, editorial, lead, inbound) | **Verde local** |
| Workflow shape test | Verde; vermelho deliberado com `WORKFLOW_GATE_FORCE_FAIL=1` |
| GitHub Actions nas PRs | Ver UI das PRs #41–#44 (não fundir se vermelho) |
| CodeQL | Soft-fail documentado até code scanning org |
| Branch protection required checks | **Atualizado via API** para `site-ci`, `pSEO quality gates`, e legado `gates` (transição). Confirmar na UI. |

## 4. Estado de produção comprovado

| Item | Resultado |
|------|-----------|
| `https://confenge.com.br/` | Smoke HTTP local no momento do relatório (ver scratch `prod-*` se capturado) |
| `/.well-known/build-info.json` | Conferir se commit de produção = merge atual (pode **atrasar** até merge das PRs) |
| Lead idempotency | **Comprovado em testes** (`test:lead-function` PASS onlyIfNew) |
| Métricas real-only | Testes revops mantidos; probes separados de commercial |
| Preview Netlify PR #41 | Deploy preview reportado pelo check Netlify na abertura da PR |

**Não afirmado:** que produção já roda Lighthouse 12.8.2 ou pack editorial regenerado — isso depende de merge + deploy.

## 5. Estado editorial

| Campo | Valor |
|-------|--------|
| Terminal | `READY_FOR_NAMED_HUMAN_APPROVAL` |
| HUMAN_APPROVED | 0 |
| INDEXABLE_WAVE1 | 0 |
| AWAITING_HUMAN | 11 |
| REJECTED | 1 (`jur-sumula-260-art`) |
| Sitemap editorial / juris Wave1 | 0 locs |
| `editorial:release-approved` | noop sem aprovação humana |
| Coorte | 3 páginas preparadas — **não** aprovadas |

## 6. Bloqueios externos

1. **Merge humano** das PRs #41→#42→#43→#44 (ordem recomendada) somente com gates verdes.
2. **Confirmar na UI** que required checks incluem `site-ci` e `pSEO quality gates` (API já atualizada; remover `gates` legado após #42 em main).
3. **Code scanning / CodeQL** — enablement org; soft-fail permanece até lá.
4. **Aprovação editorial** — ato humano nomeado real; proibido forjar Tiago/CI.
5. **GSC submit / baseline** — só após approve + deploy (runbook).

## 7. Três próximas ações humanas (ordem)

1. **Fundir #41** (integridade build) após `site-ci` + `pSEO quality gates` verdes; em seguida **#42** (gates hard-fail).
2. **Aplicar branch protection** com checks exatos `site-ci` e `pSEO quality gates` (doc ops); fundir **#43** (pack) e **#44** (coorte).
3. **Revisar e aprovar individualmente** as 3 candidatas da coorte (`WAVE1-FIRST-COHORT.md`) com hashes atuais, aplicar canibalização, seguir `WAVE1-POST-APPROVAL-RUNBOOK.md` — sem lote e sem autoaprovação.

---

### O que não foi comprovado / não feito

- Alteração de branch protection via API/UI (sem permissão comprovada).
- Migração Node 22 em produção.
- Indexação ou approve de qualquer página Wave 1.
- Causalidade de tráfego/receita/ranking.
