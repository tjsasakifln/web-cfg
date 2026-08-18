# CONTRACT_ANALYSIS_EDITORIAL_STATUS

Superseded by `CONTRACT_ANALYSIS_CANARY_STATUS`.

# CONTRACT_ANALYSIS_CANARY_STATUS

- Gate: `contract-analysis-publication-gate/1.0`
- Generated: `2026-08-18T01:45:58Z`
- Evaluated: **8** (cap 10)
- Source: `test_only_fixture` (`scripts/contract_analysis/fixtures/extra-cli-export`)
- catalog_mode: `fixture` claimed_live=`False`
- Fixture / test-only: **True**
- official_live absent: **True**
- `index_count`: **0**
- Recommendation: **ADJUST**
- expand/adjust/kill: **ADJUST**
- nenhum INDEX ativo: **True**
- FACTUAL_HANDOFF_PENDING: **True**
- Reason: Família e gate prontos. Consumer aceita authority-handoff-contract-analysis/1.0 e 1.1 além de public-read-contract-analysis/1.x. O rendezvous `$CONFENGE_HANDOFF_DIR/contract-analysis/official-live-01/` está `FACTUAL_HANDOFF_PENDING`. index_count=0. Nenhum INDEX ativo. Não expandir. Replay o produtor até READY.json + SHA256SUMS conferirem; só então avaliar ≤3 dossiês. Producer publication/index flags nunca autorizam INDEX.

## State counts

| State | N |
|---|---:|
| `REJECT` | 0 |
| `HOLD_FOR_DATA` | 0 |
| `EDITORIAL_REVIEW` | 8 |
| `PUBLISHABLE_NOINDEX` | 0 |
| `PUBLISHABLE_INDEX` | 0 |

## Items

- `cand-preco-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-reajuste-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-aditivo-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-prazo-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-comparavel-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-exceptional-01` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, intent_implausivel, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-preco-02` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-prazo-02, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent
- `cand-prazo-02` · `EDITORIAL_REVIEW` · source=`test_only_fixture` · fixture=True · robots=`noindex,nofollow` · reasons: author_or_reviewer_absent, conteudo_insubstancial, coverage_absent, editorial_review_pending, insight_singular_absent_or_generic, maintenance_owner_absent, method_or_limitations_absent, producer_status_not_official_live, unique_content_near_duplicate:cand-aditivo-01, unique_content_near_duplicate:cand-comparavel-01, unique_content_near_duplicate:cand-exceptional-01, unique_content_near_duplicate:cand-prazo-01, unique_content_near_duplicate:cand-preco-01, unique_content_near_duplicate:cand-preco-02, unique_content_near_duplicate:cand-reajuste-01, unique_content_too_thin_after_strip, utilidade_alem_da_fonte_absent

## Rendered

- `analises-contratos-publicos/aditivo-saldo-art125-item-novo/index.html`
- `analises-contratos-publicos/atraso-eventos-sem-comunicacao-contemporanea/index.html`
- `analises-contratos-publicos/bdi-composicao-vs-referencia-sc/index.html`
- `analises-contratos-publicos/comparaveis-rejeitados-regime-distinto/index.html`
- `analises-contratos-publicos/index.html`
- `analises-contratos-publicos/reajuste-aniversario-serie-indice/index.html`
