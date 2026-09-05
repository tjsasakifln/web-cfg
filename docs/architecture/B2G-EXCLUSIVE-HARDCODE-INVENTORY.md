# Inventário de travas B2G exclusivas

Campanha 02 / #578. Toda asserção que trata B2G como **única categoria
corporativa** precisa de classificação. Proteções de verdade, privacidade,
segurança, escopo profissional, proveniência e rollback não são removidas.

Classificações: `KEEP_VERTICAL` | `GENERALIZE_CORPORATE` | `REPLACE` | `REMOVE_OBSOLETE`.

| arquivo | símbolo/trecho | função | classificação | substituição | teste |
| --- | --- | --- | --- | --- | --- |
| docs/architecture/ADR-STRAT-002-confenge-canonical-public-surface.md | principal ativo brasileiro de aquisição B2G | tese corporativa 2026-08-14 | REPLACE | amendment 2026-09-04 + bloco SUPERSEDED_THESIS | tests/corporate_taxonomy/test_claims.py |
| docs/strategy/MARKET-CAPTURE-OS.md | CONFENGE is a B2G intelligence company | tese operacional | REPLACE | umbrella + QCO por núcleo | tests/corporate_taxonomy/test_claims.py |
| AGENTS.md | (não afirmava B2G como única categoria; só superfície única) | guardrail de agentes | GENERALIZE_CORPORATE | núcleos, taxonomia, planos de owner, QCO por núcleo | tests/corporate_taxonomy/test_claims.py |
| docs/architecture/system-architecture.md | static marketing site for B2G engineering consulting | overview brownfield | GENERALIZE_CORPORATE | umbrella + vertical B2G publicado | tests/corporate_taxonomy/test_claims.py |
| data/corporate/taxonomy.v1.json | public_works_b2g + b2g_is_corporate_category=false | autoridade de conteúdo | REPLACE | contrato CONFENGE_CORPORATE_TAXONOMY/1.0.0 | tests/corporate_taxonomy/test_validate.py |
| data/site/brand.json | positioning.label Consultoria para licitações… | copy canônica da home atual | KEEP_VERTICAL | fragmento brand-json.corporate-positioning.md (campanhas 08/10) | scripts/site/test_brand_contract.py |
| data/site/brand.json | hero.h1 / org_description obras públicas | schema e home atuais | KEEP_VERTICAL | fragmento; não editar HTML nesta campanha | scripts/site/test_brand_contract.py |
| data/site/public-ia-map.json | journeys edital/contrato/operacao B2G | IA pública atual | KEEP_VERTICAL | fragmento public-ia-map.taxonomy-consumer.md | scripts/site/test_public_ia.py |
| data/organic/public-family-registry.json | home visitor_job contrato de obra pública | famílias indexáveis | KEEP_VERTICAL | fragmento nucleus_id; goal 97 aplica o campo | scripts/site/test_inbound_gates.py |
| data/commercial/deliverables-registry.v1.json | 54 entregáveis B2G | catálogo do vertical | KEEP_VERTICAL | campanha 08 referencia nucleus_id; não duplicar aqui | tests/commercial/test_deliverables_registry.mjs |
| index.html | H1/hero/form obras públicas | superfície publicada | KEEP_VERTICAL | campanha 08; não tocar HTML | scripts/site/test_brand_contract.py::test_home_has_canonical_copy |
| scripts/site/test_brand_contract.py | Consultoria para licitações… in html | gate da home atual | KEEP_VERTICAL | permanece até a home mudar | python3 scripts/site/test_brand_contract.py |
| scripts/site/test_copy_gates.py | Diretoria B2G labels | copy visitor-facing | KEEP_VERTICAL | não exigir copy guarda-chuva na HTML atual | python3 scripts/site/test_copy_gates.py |
| scripts/site/test_truthful_gates.py | forbidden-phrase fixture | gate de verdade | KEEP_VERTICAL | não remover em nome do reposicionamento | tests/corporate_taxonomy/test_truth_guards.py |
| scripts/site/fixtures/truthful_gates/forbidden-phrase.html | Conversão com utilidade real | fixture adversária | KEEP_VERTICAL | scanner de copy continua fail-closed | test_forbidden_phrase_fixture_fails_shipped_copy_scanner |
| scripts/site/test_nav_taskflow.py | header does not name a purchase situation without B2G | IA visitor language | KEEP_VERTICAL | header atual sem jargão B2G; cinco núcleos só após campanha 08 | python3 scripts/site/test_nav_taskflow.py |
| scripts/site/public_ia.py | header requires the term B2G | proíbe jargão B2G no header | KEEP_VERTICAL | regra de linguagem visitor, não tese corporativa | scripts/site/test_public_ia.py |
| scripts/site/test_authority_contract.py | Inteligência aplicada à decisão B2G | fixture de autoridade | KEEP_VERTICAL | prova do vertical; não apagar gate | npm run test:authority |
| scripts/site/test_structured_identity.py | consultor B2G no ProfilePage | schema do especialista atual | KEEP_VERTICAL | campanha 09 autoridade profissional | python3 -m pytest scripts/site/test_structured_identity.py |
| scripts/site/inbound_gates.py | old_footer Diretoria B2G fracionada | impede footer obsoleto | KEEP_VERTICAL | verdade da superfície atual | npm run test:inbound-gates |
| scripts/site/test_home_conversion_contract.py | jornadas contrato/edital/operacao | conversão da home | KEEP_VERTICAL | campanha 08 | python3 -m pytest scripts/site/test_home_conversion_contract.py |
| scripts/pseo/html_shell.py | org_description fallback | chrome pSEO | KEEP_VERTICAL | fragmento; shell lê brand.json | scripts/site/test_brand_contract.py::test_org_description_consistent |
| data/site/authority-matrix.json | superfícies B2G | slots de prova | KEEP_VERTICAL | campanha 09; não inventar credencial | scripts/site/test_authority_contract.py |
| docs/DESIGN-SYSTEM.md | Engenheiro Civil e consultor B2G | identidade do especialista no vertical | KEEP_VERTICAL | campanha 09 | scripts/site/test_authority_contract.py |
| docs/SEO-ENTITY-CLEANUP.md | soft-404 to B2G home not used | higiene de URL legado | KEEP_VERTICAL | MIGRATE/REDIRECT/RETIRE por URL | scripts/site/test_redirects.mjs |
| docs/architecture/ADR-STRAT-003-panorama-de-mercado-como-familia-publica.md | família panorama obras públicas | família do vertical | KEEP_VERTICAL | extra-cli dossier; não é tese corporativa | python3 -m pytest scripts/market_panorama/tests |
| docs/strategy/MARKET-CAPTURE-OS.md | primeira vertical inbound defesa de margem | vertical publicado | KEEP_VERTICAL | coexistência explícita no texto emendado | tests/corporate_taxonomy/test_claims.py |
| package.json | scripts de teste sem taxonomia | wiring CI | GENERALIZE_CORPORATE | fragmento package-json.test-corporate-taxonomy.md | python3 -m pytest tests/corporate_taxonomy |
| .github/workflows/site-ci.yml | job Unit and brand/copy/design gates | CI não invoca taxonomia | GENERALIZE_CORPORATE | fragmento github-workflows.site-ci-taxonomy.md | evidência local pytest; PASS_WITH_FRAGMENTS |
| scripts/site/test_lead_function.mjs | offer_id CFG-DIRB2G-FLEX-v1 | fixture de captura B2G | KEEP_VERTICAL | campanha 03 intake multi-núcleo | node scripts/site/test_lead_function.mjs |
| scripts/conversion/intake-core.cjs | jornada contrato/edital/operacao | triagem atual | KEEP_VERTICAL | fragmento CONFENGE_WEB_INTAKE para campanha 03 | tests/conversion/test_conversion.mjs |
| docs/security/lgpd-operators.md | Atendimento comercial B2G | finalidade LGPD do fluxo atual | KEEP_VERTICAL | ampliar finalidade quando captura multi-núcleo existir | scripts/revops/test_privacy.mjs |
| docs/FINAL-REPORT.md | categoria hero obras públicas | relatório histórico | KEEP_VERTICAL | evidência datada; não é autoridade vigente | n/a histórico |
| docs/ops/ORGANIC-ACQUISITION-BEFORE-DIAGNOSIS.md | Organic B2G acquisition | diagnóstico 2026-08-09 | KEEP_VERTICAL | histórico do vertical | npm run organic:test |
| scripts/corporate_taxonomy/claims.py | EXCLUSIVE_B2G_CORPORATE | scanner da tese | REPLACE | falha se a tese exclusiva voltar | tests/corporate_taxonomy/test_claims.py |
| scripts/corporate_taxonomy/validate.py | b2g_is_corporate_category must be false | invariante de categoria | REPLACE | shipped validator | tests/corporate_taxonomy/test_validate.py |
| scripts/corporate_taxonomy/validate.py | PROTECTED_VERTICAL_ID public_works_b2g | vertical protegido | KEEP_VERTICAL | não depreciar B2G | test_missing_b2g_vertical_fails |
| scripts/corporate_taxonomy/validate.py | WEB_CFG_FORBIDDEN crm/dispatch | anti-autoridade CRM | KEEP_VERTICAL | verdade/ownership; não remover | test_web_cfg_crm_authority_fails |
| scripts/site/commercial_surface_truth.py | 8↔54 catalog honesty | verdade comercial B2G | KEEP_VERTICAL | gate de verdade do catálogo vigente | python3 scripts/site/test_truthful_gates.py |
| scripts/editorial/truth.py | UNKNOWN stays UNKNOWN | verdade editorial | KEEP_VERTICAL | não afrouxar | python3 -m pytest scripts/editorial/tests |
| data/organic/bofu-intent-matrix.json | rotas canônicas B2G | BOFU do vertical | KEEP_VERTICAL | campanha 08 adiciona rotas de outros núcleos | npm run test:bofu-dominance |
| especialist/tiago-jun-sasaki (HTML) | consultor B2G | perfil publicado | KEEP_VERTICAL | campanha 09 | scripts/site/test_authority_contract.py |
| conflitos/ (HTML) | política de conflito atual | escopo profissional | KEEP_VERTICAL | não editar /conflitos/ nesta campanha | scripts/site/test_authority_contract.py |
| forms lead HTML | campos contrato público/margem | triagem B2G | KEEP_VERTICAL | campanha 03; não tocar formulário | scripts/site/test_home_conversion_contract.py |

Nenhuma linha `REMOVE_OBSOLETE` apaga gate de verdade. Ausência de
`REMOVE_OBSOLETE` nesta onda é intencional: o que era exclusivo B2G na tese
foi `REPLACE`/`GENERALIZE_CORPORATE`; o que descreve a superfície publicada
fica `KEEP_VERTICAL` até a campanha dona daquela HTML.
