# Evidence — CONFENGE-SEARCH-OBSERVABILITY-DISTRIBUTION-01

Generated: `2026-08-18T14:20:00Z`
Related issue: [#86](https://github.com/tjsasakifln/web-cfg/issues/86)
Decision: VALIDATE / EXECUTE_NOW for observability + unsent distribution kit.
Leverage: data + distribution + trust. Time to evidence: this PR.

## Frozen cohort

- `https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/` intent=`limite_aditivo_25_50`
- `https://confenge.com.br/aditivos-obras-publicas/` intent=`aditivos_servicos_extras`
- `https://confenge.com.br/reequilibrio-obras-publicas/` intent=`reequilibrio_economico_financeiro`
- `https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/` intent=`quanto_custa_ticket_contratual`

## Technical reproof

| URL | HTTP | self-canonical | robots | sitemap | SD | CTA | copy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/ | 200 | True | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 | True | Organization,Country,ContactPoint,Person,CollegeOrUniversity,Article,WebPage,Thing,BreadcrumbList,ListItem,FAQPage,Question,Answer | True | unchanged |
| https://confenge.com.br/aditivos-obras-publicas/ | 200 | True | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 | True | Organization,Country,ContactPoint,Person,CollegeOrUniversity,CollectionPage,WebSite,ItemList,ListItem,Service,BreadcrumbList,FAQPage,Question,Answer | True | unchanged |
| https://confenge.com.br/reequilibrio-obras-publicas/ | 200 | True | index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1 | True | Organization,Country,ContactPoint,Person,CollegeOrUniversity,CollectionPage,WebSite,ItemList,ListItem,Service,BreadcrumbList,FAQPage,Question,Answer | True | unchanged |
| https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/ | 200 | True | index,follow | True | FAQPage,Question,Answer,Dataset,Organization,BreadcrumbList,ListItem | True | unchanged |

## Stages

Impression ≠ engagement ≠ referral ≠ lead. IndexNow receipt ≠ index. Crawler hit ≠ citation. URL Inspection ≠ appearance.

### limite-aditivo-25-50-obra-publica
- **eligibility**: `TRUE` · source `live_http+local_inspect` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `keep_observe_do_not_change_copy`
- **appearance**: `TRUE` · source `url_inspection+gsc_search_analytics` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engagement_and_referral_separately` · observation `search_analytics_api_returned_page_rows; impressions=4; clicks=0; returned_rows=4; max_date=2026-08-10; impression_is_not_engagement`
- **referral**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `import_referral_when_available` · observation `referral_is_not_lead; impression_is_not_referral`
- **engagement**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engaged_sessions_separately` · observation `impression_is_not_engagement`
- **cta_lead**: `UNKNOWN` · source `lead_store_not_joined` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_infer_lead_from_cta_presence` · observation `cta_present=true; cta_is_not_lead`
- **pipeline**: `UNKNOWN` · source `warmbly_not_observed` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_invent_pipeline` · observation `lead_is_not_pipeline`

### aditivos-obras-publicas
- **eligibility**: `TRUE` · source `live_http+local_inspect` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `keep_observe_do_not_change_copy`
- **appearance**: `TRUE` · source `url_inspection+gsc_search_analytics` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engagement_and_referral_separately` · observation `search_analytics_api_returned_page_rows; impressions=10; clicks=0; returned_rows=10; max_date=2026-08-12; impression_is_not_engagement`
- **referral**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `import_referral_when_available` · observation `referral_is_not_lead; impression_is_not_referral`
- **engagement**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engaged_sessions_separately` · observation `impression_is_not_engagement`
- **cta_lead**: `UNKNOWN` · source `lead_store_not_joined` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_infer_lead_from_cta_presence` · observation `cta_present=true; cta_is_not_lead`
- **pipeline**: `UNKNOWN` · source `warmbly_not_observed` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_invent_pipeline` · observation `lead_is_not_pipeline`

### reequilibrio-obras-publicas
- **eligibility**: `TRUE` · source `live_http+local_inspect` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `keep_observe_do_not_change_copy`
- **appearance**: `UNKNOWN` · source `url_inspection+gsc_search_analytics` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `continue_gsc_observation_missing_is_not_zero` · observation `url_inspection_pass_but_no_page_row_returned_by_search_analytics; missing_top_row_is_not_zero`
- **referral**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `import_referral_when_available` · observation `referral_is_not_lead; impression_is_not_referral`
- **engagement**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engaged_sessions_separately` · observation `impression_is_not_engagement`
- **cta_lead**: `UNKNOWN` · source `lead_store_not_joined` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_infer_lead_from_cta_presence` · observation `cta_present=true; cta_is_not_lead`
- **pipeline**: `UNKNOWN` · source `warmbly_not_observed` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_invent_pipeline` · observation `lead_is_not_pipeline`

### valor-tipico-contratos-pavimentacao
- **eligibility**: `TRUE` · source `live_http+local_inspect` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `keep_observe_do_not_change_copy`
- **appearance**: `UNKNOWN` · source `url_inspection+gsc_search_analytics` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `continue_gsc_observation_missing_is_not_zero` · observation `url_inspection_pass_but_no_page_row_returned_by_search_analytics; missing_top_row_is_not_zero`
- **referral**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `import_referral_when_available` · observation `referral_is_not_lead; impression_is_not_referral`
- **engagement**: `UNKNOWN` · source `analytics_not_imported` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `observe_engaged_sessions_separately` · observation `impression_is_not_engagement`
- **cta_lead**: `UNKNOWN` · source `lead_store_not_joined` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_infer_lead_from_cta_presence` · observation `cta_present=true; cta_is_not_lead`
- **pipeline**: `UNKNOWN` · source `warmbly_not_observed` · freshness `2026-08-18T14:20:00Z` · owner `Tiago Sasaki` · next `do_not_invent_pipeline` · observation `lead_is_not_pipeline`

## GSC collector

- credential present: `True`
- ready_for_product_decisions: `True`
- live baseline invented: `false`
- sync source: `search_analytics_api`
- max_date: `2026-08-13`
- latency_ms: `1764`
- limitation: Search Analytics may return top rows only and is not an exhaustive total. Row counts describe the returned set, not the property universe.

## Reproduction

```bash
python3 scripts/revops/search_demand_observatory.py sync --fixture
python3 scripts/revops/search_demand_observatory.py pull-api --days 7 --smoke
python3 -m scripts.discovery campaign-report --as-of 2026-08-18T14:20:00Z
python3 -m scripts.discovery indexnow --url https://confenge.com.br/conteudos/limite-aditivo-25-50-obra-publica/ --url https://confenge.com.br/aditivos-obras-publicas/ --url https://confenge.com.br/reequilibrio-obras-publicas/ --url https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/
```

Raw query rows stay out of git. See `.gitignore` `data/revops/gsc/private/`.

