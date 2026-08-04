# Relatório consolidado — restauração do `main` e coorte editorial

Data de verificação final: 2026-08-04  
Repo: `tjsasakifln/web-cfg`  
**Tip de `main` no momento deste relatório:** `057b55d3130fb6fc6f43455d923e2bdedd1c5c61` (merge #52)  
**Último tip com gates verdes no restore stack:** `b8af0b6f958969722c35d1ed12b9cd8c5324835a` (merge #50)  
**Marco restore coorte (#44):** `49d61778192c7c7fbf53409d9a1c7c9f37c32a2a`  
**Produção (`build-info.json`):** `commit` = `057b55d3130fb6fc6f43455d923e2bdedd1c5c61` (exact match ao tip)

## 1. Estado anterior

- PR #6 subiu `lighthouse` para `13.4.1` (engines Node `>=22.19`).
- Lockfile dessincronizado (`npm ci` → `EUSAGE`); pSEO não completava install/build.
- Follow-ups elevaram GHA para Node 22 enquanto Netlify permanecia `NODE_VERSION=20` (split-brain).
- Gate pSEO **não era** obrigatório; `site-ci` podia mascarar falha de install com `npm ci || npm install`.
- Pacote editorial apontava SHA antigo; Wave 1 com 11 páginas aguardando humano, 0 indexáveis, 1 rejeitada.
- Regressões posteriores (PR #48/#49) reescreveram footers de `ferramentas/*` e deixaram pSEO vermelho até PR #50.
- **Pós-#51:** merge de tools sem pin docs-only deixou `commit_sha` do pacote editorial em `58b6aa67…` enquanto HEAD era `bc394078…` → `site-ci` e `pSEO quality gates` **vermelhos** no tip (falha legítima de `test_live_registry_wave1_not_human_approved` / package SHA).

## 2. Correções realizadas (em `main`)

| PR | Status | Escopo |
|----|--------|--------|
| [#41](https://github.com/tjsasakifln/web-cfg/pull/41) | **Merged** | Pin `lighthouse@^12.8.2`, `engines >=18`, GHA Node 20, lock regenerado; type-floor `.related-card` 14px |
| [#42](https://github.com/tjsasakifln/web-cfg/pull/42) | **Merged** | `npm ci` hard-fail; nomes `site-ci` / `pSEO quality gates`; `test:workflow-gates`; docs de protection |
| [#43](https://github.com/tjsasakifln/web-cfg/pull/43) | **Merged** | Regen pack editorial + pin SHA; `HUMAN_APPROVED=0`; `INDEXABLE=0`; jur REJECTED |
| [#44](https://github.com/tjsasakifln/web-cfg/pull/44) | **Merged** | Coorte ≤3 + runbook + nota Node22 |
| [#47](https://github.com/tjsasakifln/web-cfg/pull/47) | **Merged** | Docs honesty (APPLIED protection) + `test:ops-docs` |
| [#50](https://github.com/tjsasakifln/web-cfg/pull/50) | **Merged** | Restore full brand footer em `ferramentas/*` + `test:ferramentas-footer` (reverte regressão #48) |
| [#51](https://github.com/tjsasakifln/web-cfg/pull/51) | **Merged** | Tools reeq/matriz fixes; **sem** pin editorial → tip vermelho (SHA lag) |
| [#52](https://github.com/tjsasakifln/web-cfg/pull/52) | **Merged** | Relatório consolidado + pin docs-only do pacote editorial no tip pós-#51 |

Nota futura: `docs/ops/NODE22-LIGHTHOUSE13-MIGRATION-NOTE.md` (não misturada na emergência).

## 3. Checks atuais (comprovados em 2026-08-04)

### 3.1 Tip verde pós-#50 (`b8af0b6f`)

| Check | Estado | Evidência |
|-------|--------|-----------|
| `npm ci` limpo (2×) | **Verde**, zero `EBADENGINE` | local Node v20.19.3 |
| `lighthouse` / engines | `^12.8.2` / `node >=18` | `package.json` |
| GHA / Netlify Node | `"20"` / `NODE_VERSION=20` | workflows + `netlify.toml` |
| `site-ci` (push main #50) | **success** | run `30922993443` |
| `pSEO quality gates` (push main #50) | **success** | run `30922989876` |
| CodeQL (push main #50) | **success** | run `30922989778` (soft-fail still configured in workflow) |
| Branch protection API | **APPLIED** strict | contexts: `site-ci`, `pSEO quality gates` |
| `test:workflow-gates` | green; deliberate red exit 1 | local |
| `test:ops-docs` / `test:ferramentas-footer` | green | local |
| `editorial:test` | 40 passed | local clean tip #50 |
| Material hashes dual-build | stable | two `editorial:build` runs identical |

### 3.2 Tip pós-#51 (`bc394078`) — lag de SHA (comprovado vermelho)

| Check | Estado | Evidência |
|-------|--------|-----------|
| `site-ci` (push main #51) | **failure** | run `30924287228` — package SHA `58b6aa67…!=bc394078…` |
| `pSEO quality gates` (push main #51) | **failure** | run `30924288147` — mesma asserção editorial |
| Produção `build-info` | deploy do tip | `commit` = `bc394078…`, `deploy_id` `6a7205013a551f0008796b9b` |

### 3.3 Pós-#52 — pin restaurado; tip verde comprovado

| Check | Estado | Evidência |
|-------|--------|-----------|
| Pin docs-only | **OK** | `commit_sha` = `b43b9391…` (parent do pin); tip merge `057b55d3` |
| `site-ci` (push main #52) | **success** | run `30925113697` |
| `pSEO quality gates` (push main #52) | **success** | run `30925113240` |
| `editorial:test` local no tip | 40 passed | pin acceptable no merge commit |
| CodeQL | **não** required; soft-fail no workflow | não bloqueia merge |
| Branch protection API | **APPLIED** strict | `site-ci`, `pSEO quality gates` |

## 4. Estado de produção comprovado

| Item | Resultado |
|------|-----------|
| `https://confenge.com.br/` | HTTP 200 |
| `/.well-known/build-info.json` | HTTP 200 |
| `commit` | **`057b55d3130fb6fc6f43455d923e2bdedd1c5c61`** (= `origin/main` tip) |
| `build_time` | `2026-08-04T15:38:07Z` |
| `deploy_id` | `6a72074afabf0000082de189` |
| `/ferramentas/` | HTTP 200 |
| robots / sitemap-index | HTTP 200 |
| Lead idempotency | **PASS** `test:lead-function` (onlyIfNew) |
| Métricas real-only | Testes revops intactos; probes separados |

## 5. Estado editorial

| Campo | Valor |
|-------|--------|
| Terminal | `READY_FOR_NAMED_HUMAN_APPROVAL` |
| HUMAN_APPROVED | 0 |
| INDEXABLE_WAVE1 | 0 |
| AWAITING_HUMAN | 11 |
| REJECTED | 1 (`jur-sumula-260-art`) |
| Sitemap editorial / juris | 0 locs |
| `editorial:release-approved` | **noop** — `no_valid_human_approvals` |
| Coorte | 3 páginas preparadas em `docs/editorial/WAVE1-FIRST-COHORT.md` — **não** aprovadas |

## 6. Bloqueios externos remanescentes

1. **UI glance** Settings → Branches (API já aplicada; confirmação visual humana opcional).
2. **Code scanning org** — workflow ainda `continue-on-error: true`; CodeQL **não** é required check.
3. **Aprovação editorial humana** — zero páginas Wave 1 aprovadas (fail-closed por desenho).
4. **GSC submit / baseline pós-approve** — só após runbook.
5. **Disciplina de pin** — qualquer merge em `main` que altere HEAD sem pin docs-only do pacote editorial reabre o tip vermelho (como #51).

## 7. Três próximas ações humanas (ordem)

1. **Confirmar na UI** (opcional) que required checks são **`site-ci`** e **`pSEO quality gates`**.
2. **Aprovar individualmente** ≤3 candidatas da coorte (`WAVE1-FIRST-COHORT.md` / `HUMAN-ACTION-NOW.md`) com nome real, checklist e material hash — sem lote, sem CI/bot/agente.
3. **Executar** `WAVE1-POST-APPROVAL-RUNBOOK.md` pós-approve (canibalização → rebuild → robots/sitemap → GSC → smoke → baselines reais).

---

### Não feito / não inventado

- Migração Node 22 / Lighthouse 13.
- Autoaprovação ou indexação Wave 1 / piloto / `jur-sumula-260-art`.
- Afirmações de tráfego, receita, leads ou ranking.
- Screenshot da UI de branch protection (só API).
- Forjar verde no tip #51 sem pin (evidência de failure mantida acima).
