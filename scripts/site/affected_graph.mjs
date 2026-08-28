/**
 * Path → suite → artifact → public-surface graph for local `test:affected`.
 *
 * Pure data + pure select/promote. No git, no suite execution.
 * Merge gates stay on `npm test`; this module never authorizes a skip.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PACKAGE_JSON = path.join(ROOT, "package.json");

/** Suites that scan shipped public HTML / copy / brand surfaces. */
const PUBLIC_HTML_SUITES = Object.freeze([
  "test:brand",
  "test:authority",
  "test:design",
  "test:copy",
  "audit:accessibility",
  "test:skip-link",
  "test:ui",
  "test:inbound-gates",
  "test:cta-whatsapp",
  "test:tools",
  "test:nurture-pages",
  "test:ferramentas-footer",
  "test:hub-truth",
  "test:nav",
  "test:first-fold-contract",
  "test:real-proof-registry",
  "test:integrity-promotion-gate",
  "test:logo-contract",
  "test:wave1-fields",
]);

const PUBLIC_SURFACE_PREFIXES = Object.freeze([
  "conteudos/",
  "ferramentas/",
  "casos/",
  "radar/",
  "lei-14133-obras/",
  "nurture/",
  "imprensa/",
  "defesa-margem-contratos-publicos/",
  "bid-room-licitacoes-obras/",
  "diretoria-b2g/",
  "diagnostico-b2g-360/",
  "especialista/",
  "metodologia-inteligencia/",
  "politica-editorial/",
  "privacidade/",
  "termos-de-uso/",
  "obrigado",
  "ops/",
  "inteligencia/",
]);

/**
 * Explicit producer prefixes/files per npm-test suite.
 * Auto-extracted entry files from package.json are unioned at select time.
 * Artifacts and surfaces are documentation for the report, not a second selector.
 */
export const SUITE_GRAPH = Object.freeze({
  "test:host-contract": {
    producers: [
      "scripts/migration/netcup/",
      "scripts/site/test_production_cutover.mjs",
      "_headers",
      "_redirects",
      "netlify.toml",
      "404.html",
      "robots.txt",
      "sitemap*.xml",
      "sitemap.txt",
      ".well-known/README.md",
      "01ce18c7219b7c7dcb2ab06e226c2681.txt",
    ],
    artifacts: ["build/netcup-host-contract/"],
    surfaces: ["/", "/robots.txt", "/sitemap.xml", "/.well-known/"],
  },
  "pseo:test": {
    producers: [
      "scripts/pseo/",
      "data/pseo/",
      "sitemap.txt",
      "sitemap.xml",
      "sitemap-index.xml",
    ],
    artifacts: ["_site/", "seo/pseo-operational-result.json", "sitemap-index.xml"],
    surfaces: ["/inteligencia/", "/radar/", "/sitemap-index.xml"],
  },
  "editorial:test": {
    producers: [
      "scripts/editorial/",
      "data/editorial/",
      "docs/editorial/",
      "assets/editorial-a11y-v293.css",
    ],
    artifacts: ["docs/editorial/"],
    surfaces: ["/conteudos/", "/politica-editorial/"],
  },
  "test:analytics": {
    producers: [
      ".env.example",
      "data/ops/third-party-conversion-decision.v1.json",
      "docs/ops/ENV-VARS.md",
      "docs/ops/EXTERNAL-ACTIONS.md",
      "docs/ops/THIRD-PARTY-CONVERSION-DECISION.md",
      "seo/scripts/test_analytics_pii.mjs",
      "seo/scripts/test_editorial_analytics.mjs",
      "seo/scripts/test_event_dictionary.mjs",
      "seo/scripts/test_third_party_analytics_gate.mjs",
      "scripts/site/third_party_analytics_gate.mjs",
      "netlify/functions/lib/event-registry.json",
      "netlify/functions/lib/event-contract.cjs",
      "script.js",
      "js/modules/",
      "netlify/functions/collect.cjs",
      "netlify/functions/lib/analytics-agg.cjs",
    ],
    artifacts: [],
    surfaces: ["/", "/.netlify/functions/collect"],
  },
  "test:form-funnel": {
    producers: ["seo/scripts/test_form_funnel.mjs", "script.js", "js/modules/form.js", "index.html"],
    artifacts: [],
    surfaces: ["/", "/obrigado.html"],
  },
  "test:lead-function": {
    producers: [
      "scripts/site/test_lead_function.mjs",
      "netlify/functions/lead.cjs",
      "netlify/functions/lib/lead-delivery.cjs",
      "netlify/functions/lib/record-kind.cjs",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/lead"],
  },
  "test:inbound-handoff": {
    producers: [
      "scripts/site/test_inbound_handoff.mjs",
      "netlify/functions/lib/inbound-handoff.cjs",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/lead"],
  },
  "test:search-observation": {
    producers: [
      "scripts/site/test_search_observation.mjs",
      "netlify/functions/lib/search-observation.cjs",
      "netlify/functions/lib/inbound-handoff.cjs",
      "netlify/functions/lib/lead-store.cjs",
      "netlify/functions/ops.cjs",
      "netlify/functions/search-observation-tick.cjs",
      "scripts/revops/scheduled_daily.mjs",
      "data/bofu-dominance/core/gsc-live-overlay.v1.json",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/ops", "/.netlify/functions/search-observation-tick"],
  },
  "test:commercial-event": {
    producers: [
      "scripts/site/test_commercial_event.mjs",
      "netlify/functions/lib/commercial-event.cjs",
      "netlify/functions/lib/inbound-handoff.cjs",
      "netlify/functions/lib/lead-store.cjs",
      "scripts/offers/events.cjs",
      "scripts/offers/flags.cjs",
      "scripts/offers/commercial_event_canary.mjs",
      "data/offers/flags.json",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/ops"],
  },
  "test:checkout-negatives": {
    producers: [
      "tests/offers/test_checkout_negatives.mjs",
      "diagnostico-b2g-expansao/index.html",
      "netlify/functions/offer-checkout.cjs",
      "netlify/functions/lib/lead-core.cjs",
      "data/offers/flags.json",
    ],
    artifacts: [],
    surfaces: ["/diagnostico-b2g-expansao/"],
  },
  "test:deliverables-registry": {
    producers: [
      "tests/commercial/",
      "scripts/commercial/",
      "data/commercial/",
      "data/offers/catalog.snapshot.json",
      "entregas/index.html",
    ],
    artifacts: [],
    surfaces: ["/entregas/"],
  },
  "test:offer-naming": {
    producers: ["tests/commercial/test_offer_naming.mjs", "data/commercial/offer-naming.v1.json", "entregas/index.html", "data/offers/catalog.snapshot.json"],
    artifacts: [],
    surfaces: ["/entregas/"],
  },
  "test:page-contract-pre-edital": {
    producers: [
      "tests/commercial/test_page_contract_pre_edital.mjs",
      "data/commercial/page-contract-pre-edital.v1.json",
      "data/commercial/deliverables-registry.v1.json",
      "data/offers/catalog.snapshot.json",
      "entregas/index.html",
      "diagnostico-b2g-expansao/index.html",
    ],
    artifacts: [],
    surfaces: ["/entregas/", "/diagnostico-b2g-expansao/"],
  },
  "test:pricing-policy": {
    producers: [
      "tests/commercial/test_pricing_policy.mjs",
      "data/commercial/pricing-policy.v1.json",
      "data/offers/catalog.snapshot.json",
      "entregas/index.html",
    ],
    artifacts: [],
    surfaces: ["/entregas/"],
  },
  "test:integrity-promotion-gate": {
    producers: [
      "tests/commercial/test_integrity_promotion_gate.mjs",
      "data/quality/integrity-promotion-gate.v1.json",
      "data/commercial/deliverables-registry.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:page-contract-eight": {
    producers: [
      "tests/commercial/test_page_contract_eight.mjs",
      "data/commercial/page-contract-eight.v1.json",
      "entregas/index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
      "casos/modelo-base-quantitativa-canonica/index.html",
      "casos/modelo-apresentacao-executiva-resultados/index.html",
      "casos/modelo-mapa-compradores-publicos/index.html",
      "casos/modelo-contratos-vincendos-relicitacao/index.html",
      "casos/modelo-mapeamento-concorrentes-publicos/index.html",
      "casos/modelo-painel-precos-obras-publicas/index.html",
      "casos/modelo-relatorio-executivo-consolidado/index.html",
      "data/offers/catalog.snapshot.json",
    ],
    artifacts: [],
    surfaces: [
      "/entregas/",
      "/casos/modelo-relatorio-inteligencia-licitacoes/",
      "/casos/modelo-base-quantitativa-canonica/",
      "/casos/modelo-apresentacao-executiva-resultados/",
      "/casos/modelo-mapa-compradores-publicos/",
      "/casos/modelo-contratos-vincendos-relicitacao/",
      "/casos/modelo-mapeamento-concorrentes-publicos/",
      "/casos/modelo-painel-precos-obras-publicas/",
      "/casos/modelo-relatorio-executivo-consolidado/",
    ],
  },
  "test:first-fold-contract": {
    producers: [
      "tests/commercial/test_first_fold_contract.mjs",
      "data/commercial/first-fold-contract.v1.json",
      "data/organic/public-family-registry.json",
      "data/organic/bofu-intent-matrix.json",
      "index.html",
      "entregas/index.html",
      "problemas-que-resolvemos/index.html",
      "servicos-obras-publicas/index.html",
      "acompanhamento-contratos-obras/index.html",
      "aditivos-obras-publicas/index.html",
      "atrasos-prorrogacao-obras-publicas/index.html",
      "auditoria-orcamento-licitacao/index.html",
      "bid-room-licitacoes-obras/index.html",
      "defesa-margem-contratos-publicos/index.html",
      "defesa-tecnica-contratos-publicos/index.html",
      "diagnostico-b2g-360/index.html",
      "diagnostico-b2g-expansao/index.html",
      "diagnostico-pre-licitacao/index.html",
      "diretoria-b2g/index.html",
      "medicoes-glosas-obras-publicas/index.html",
      "reequilibrio-obras-publicas/index.html",
      "casos/modelo-apresentacao-executiva-resultados/index.html",
      "casos/modelo-base-quantitativa-canonica/index.html",
      "casos/modelo-contratos-vincendos-relicitacao/index.html",
      "casos/modelo-mapa-compradores-publicos/index.html",
      "casos/modelo-mapeamento-concorrentes-publicos/index.html",
      "casos/modelo-painel-precos-obras-publicas/index.html",
      "casos/modelo-relatorio-executivo-consolidado/index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
    ],
    artifacts: [],
    surfaces: [
      "/",
      "/entregas/",
      "/problemas-que-resolvemos/",
      "/servicos-obras-publicas/",
      "/acompanhamento-contratos-obras/",
      "/aditivos-obras-publicas/",
      "/atrasos-prorrogacao-obras-publicas/",
      "/auditoria-orcamento-licitacao/",
      "/bid-room-licitacoes-obras/",
      "/defesa-margem-contratos-publicos/",
      "/defesa-tecnica-contratos-publicos/",
      "/diagnostico-b2g-360/",
      "/diagnostico-b2g-expansao/",
      "/diagnostico-pre-licitacao/",
      "/diretoria-b2g/",
      "/medicoes-glosas-obras-publicas/",
      "/reequilibrio-obras-publicas/",
      "/casos/modelo-apresentacao-executiva-resultados/",
      "/casos/modelo-base-quantitativa-canonica/",
      "/casos/modelo-contratos-vincendos-relicitacao/",
      "/casos/modelo-mapa-compradores-publicos/",
      "/casos/modelo-mapeamento-concorrentes-publicos/",
      "/casos/modelo-painel-precos-obras-publicas/",
      "/casos/modelo-relatorio-executivo-consolidado/",
      "/casos/modelo-relatorio-inteligencia-licitacoes/",
    ],
  },
  "test:market-fit-protocol": {
    producers: [
      "tests/commercial/test_market_fit_protocol.mjs",
      "scripts/commercial/market_fit_promotion.mjs",
      "data/commercial/market-fit-protocol.v1.json",
      "entregas/index.html",
      "data/offers/catalog.snapshot.json",
    ],
    artifacts: [],
    surfaces: ["/entregas/"],
  },
  "test:real-proof-registry": {
    producers: [
      "tests/commercial/test_real_proof_registry.mjs",
      "data/commercial/real-proof-registry.v1.json",
      "index.html",
      "entregas/index.html",
      "casos/modelo-apresentacao-executiva-resultados/index.html",
      "casos/modelo-base-quantitativa-canonica/index.html",
      "casos/modelo-contratos-vincendos-relicitacao/index.html",
      "casos/modelo-mapa-compradores-publicos/index.html",
      "casos/modelo-mapeamento-concorrentes-publicos/index.html",
      "casos/modelo-painel-precos-obras-publicas/index.html",
      "casos/modelo-relatorio-executivo-consolidado/index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
    ],
    artifacts: [],
    surfaces: [
      "/",
      "/entregas/",
      "/casos/modelo-apresentacao-executiva-resultados/",
      "/casos/modelo-base-quantitativa-canonica/",
      "/casos/modelo-contratos-vincendos-relicitacao/",
      "/casos/modelo-mapa-compradores-publicos/",
      "/casos/modelo-mapeamento-concorrentes-publicos/",
      "/casos/modelo-painel-precos-obras-publicas/",
      "/casos/modelo-relatorio-executivo-consolidado/",
      "/casos/modelo-relatorio-inteligencia-licitacoes/",
    ],
  },
  "test:page-contract-licitacao": {
    producers: [
      "tests/commercial/test_page_contract_licitacao.mjs",
      "data/commercial/page-contract-licitacao.v1.json",
      "diagnostico-pre-licitacao/index.html",
      "auditoria-orcamento-licitacao/index.html",
      "bid-room-licitacoes-obras/index.html",
    ],
    artifacts: [],
    surfaces: [
      "/diagnostico-pre-licitacao/",
      "/auditoria-orcamento-licitacao/",
      "/bid-room-licitacoes-obras/",
    ],
  },
  "test:page-contract-contratos": {
    producers: [
      "tests/commercial/test_page_contract_contratos.mjs",
      "data/commercial/page-contract-contratos.v1.json",
      "defesa-margem-contratos-publicos/index.html",
      "medicoes-glosas-obras-publicas/index.html",
      "aditivos-obras-publicas/index.html",
      "atrasos-prorrogacao-obras-publicas/index.html",
      "reequilibrio-obras-publicas/index.html",
      "defesa-tecnica-contratos-publicos/index.html",
    ],
    artifacts: [],
    surfaces: [
      "/defesa-margem-contratos-publicos/",
      "/medicoes-glosas-obras-publicas/",
      "/aditivos-obras-publicas/",
      "/atrasos-prorrogacao-obras-publicas/",
      "/reequilibrio-obras-publicas/",
      "/defesa-tecnica-contratos-publicos/",
    ],
  },
  "test:single-commercial-route": {
    producers: [
      "tests/commercial/test_single_commercial_route.mjs",
      "data/organic/single-commercial-route.v1.json",
      "data/commercial/page-contract-contratos.v1.json",
      "data/commercial/offer-naming.v1.json",
      "scripts/site/render_nav_hubs.py",
      "index.html",
      "servicos-obras-publicas/index.html",
      "conteudos/atraso-na-medicao-obra-publica/index.html",
      "medicoes-glosas-obras-publicas/index.html",
    ],
    artifacts: ["data/organic/single-commercial-route.v1.json"],
    surfaces: [
      "/",
      "/servicos-obras-publicas/",
      "/conteudos/atraso-na-medicao-obra-publica/",
      "/medicoes-glosas-obras-publicas/",
    ],
  },
  "test:page-contract-operacao": {
    producers: [
      "tests/commercial/test_page_contract_operacao.mjs",
      "data/commercial/page-contract-operacao.v1.json",
      "diagnostico-b2g-360/index.html",
      "acompanhamento-contratos-obras/index.html",
    ],
    artifacts: [],
    surfaces: ["/diagnostico-b2g-360/", "/acompanhamento-contratos-obras/"],
  },
  "test:task-doors": {
    producers: [
      "tests/commercial/test_task_doors.mjs",
      "data/commercial/task-doors.v1.json",
      "entregas/index.html",
    ],
    artifacts: [],
    surfaces: ["/entregas/"],
  },
  "test:page-contract-complementares": {
    producers: [
      "tests/commercial/test_page_contract_complementares.mjs",
      "data/commercial/page-contract-complementares.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:page-contract-execucao": {
    producers: [
      "tests/commercial/test_page_contract_execucao.mjs",
      "data/commercial/page-contract-execucao.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:page-contract-disputas": {
    producers: [
      "tests/commercial/test_page_contract_disputas.mjs",
      "data/commercial/page-contract-disputas.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:page-contract-ciclo": {
    producers: [
      "tests/commercial/test_page_contract_ciclo.mjs",
      "data/commercial/page-contract-ciclo.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:copy-contract": {
    producers: [
      "tests/commercial/test_copy_contract.mjs",
      "data/commercial/copy-contract.v1.json",
      "data/commercial/deliverables-registry.v1.json",
      "data/commercial/task-doors.v1.json",
      "data/organic/public-family-registry.json",
      "scripts/commercial/copy_contract_audit.mjs",
      "scripts/commercial/render_public_catalog.mjs",
      "entregas/index.html",
      "servicos-obras-publicas/index.html",
      "problemas-que-resolvemos/index.html",
      "diagnostico-b2g-expansao/index.html",
      "casos/modelo-apresentacao-executiva-resultados/index.html",
      "casos/modelo-base-quantitativa-canonica/index.html",
      "casos/modelo-contratos-vincendos-relicitacao/index.html",
      "casos/modelo-mapa-compradores-publicos/index.html",
      "casos/modelo-mapeamento-concorrentes-publicos/index.html",
      "casos/modelo-painel-precos-obras-publicas/index.html",
      "casos/modelo-relatorio-executivo-consolidado/index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
    ],
    artifacts: [],
    surfaces: [
      "/entregas/",
      "/servicos-obras-publicas/",
      "/problemas-que-resolvemos/",
      "/diagnostico-b2g-expansao/",
      "/casos/modelo-apresentacao-executiva-resultados/",
      "/casos/modelo-base-quantitativa-canonica/",
      "/casos/modelo-contratos-vincendos-relicitacao/",
      "/casos/modelo-mapa-compradores-publicos/",
      "/casos/modelo-mapeamento-concorrentes-publicos/",
      "/casos/modelo-painel-precos-obras-publicas/",
      "/casos/modelo-relatorio-executivo-consolidado/",
      "/casos/modelo-relatorio-inteligencia-licitacoes/",
    ],
  },
  "test:page-contract-integridade": {
    producers: [
      "tests/commercial/test_page_contract_integridade.mjs",
      "data/commercial/page-contract-integridade.v1.json",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:commercial-contract-consistency": {
    producers: [
      "tests/commercial/test_commercial_contract_consistency.mjs",
      "data/commercial/",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:bofu-dominance": {
    producers: ["tests/bofu_dominance/", "scripts/bofu_dominance/", "data/bofu-dominance/"],
    artifacts: ["docs/seo/bofu-dominance/"],
    surfaces: [
      "/defesa-margem-contratos-publicos/",
      "/bid-room-licitacoes-obras/",
      "/diretoria-b2g/",
      "/diagnostico-b2g-expansao/",
    ],
  },
  "test:local-entity": {
    producers: [
      "tests/local_entity/",
      "scripts/local_entity/",
      "data/local-entity/",
      "index.html",
      "especialista/tiago-jun-sasaki/index.html",
      "data/site/brand.json",
      "data/site/proof.json",
      "data/organic/search-baseline-2026-08-14.json",
      "scripts/site/brand.py",
      "scripts/site/authority.py",
    ],
    artifacts: ["docs/seo/local-entity/"],
    surfaces: ["/", "/especialista/tiago-jun-sasaki/"],
  },
  "test:sitemap-graph": {
    producers: [
      "scripts/organic/tests/test_sitemap_graph.py",
      "scripts/organic/sitemap_graph.py",
      "sitemap-index.xml",
      "sitemap.txt",
    ],
    artifacts: ["sitemap-index.xml", "sitemap.txt", "data/organic/sitemap-hygiene.json"],
    surfaces: ["/sitemap-index.xml", "/sitemap.txt"],
  },
  "test:attribution-allowlist": {
    producers: ["scripts/site/test_attribution_allowlist.mjs"],
    artifacts: [],
    surfaces: ["/.netlify/functions/lead"],
  },
  "test:secrets-scan": {
    // Mirrors SCAN_DIRS in scripts/site/test_secrets_scan.mjs (the shipped walker).
    producers: [
      "scripts/site/test_secrets_scan.mjs",
      "netlify/",
      "scripts/",
      "seo/scripts/",
      "script.js",
      "index.html",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:deliverable-models": {
    producers: [
      "scripts/site/test_deliverable_models.py",
      "casos/modelo-base-quantitativa-canonica/",
      "casos/modelo-apresentacao-executiva-resultados/",
      "casos/modelo-mapa-compradores-publicos/",
      "casos/modelo-contratos-vincendos-relicitacao/",
      "casos/modelo-mapeamento-concorrentes-publicos/",
      "casos/modelo-painel-precos-obras-publicas/",
      "casos/modelo-relatorio-executivo-consolidado/",
      "casos/index.html",
      "entregas/index.html",
      "assets/report-model.css",
      "assets/report-model-a11y-v293.css",
      "assets/report-capture.css",
      "docs/contracts/intent-action/intent-action-matrix.v1.json",
      "docs/stories/story-deliverable-models-value-ladder.md",
      "sitemap.xml",
      "sitemap.txt",
    ],
  },
  "test:report-model": {
    producers: [
      "scripts/site/test_report_model_599.py",
      "casos/modelo-relatorio-inteligencia-licitacoes/",
      "assets/report-capture.css",
      "assets/report-model-a11y-v293.css",
      "casos/index.html",
      "bid-room-licitacoes-obras/index.html",
      "diretoria-b2g/index.html",
      "sitemap.xml",
      "sitemap.txt",
      "sitemap-index.xml",
      "docs/contracts/intent-action/intent-action-matrix.v1.json",
      "scripts/offers/registry.cjs",
      "data/offers/catalog.snapshot.json",
    ],
    artifacts: ["_site/casos/modelo-relatorio-inteligencia-licitacoes/"],
    surfaces: ["/casos/modelo-relatorio-inteligencia-licitacoes/"],
  },
  "test:deliverables-hub": {
    producers: [
      "scripts/site/test_deliverables_hub.py",
      "entregas/",
      "index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
      "data/site/brand.json",
      "js/modules/nav.js",
      "scripts/pseo/html_shell.py",
      "scripts/pseo/public_artifact.py",
      "scripts/site/public_navigation.py",
      "sitemap.xml",
      "sitemap.txt",
    ],
    artifacts: ["_site/entregas/"],
    surfaces: ["/", "/entregas/", "/casos/modelo-relatorio-inteligencia-licitacoes/"],
  },
  "test:report-model-ui": {
    producers: [
      "scripts/site/test_report_model_ui.mjs",
      "scripts/site/resolve_chrome.mjs",
      "casos/modelo-relatorio-inteligencia-licitacoes/",
      "styles.css",
      "script.js",
    ],
    artifacts: [],
    surfaces: ["/casos/modelo-relatorio-inteligencia-licitacoes/"],
  },
  "test:deliverables-hub-ui": {
    producers: [
      "scripts/site/test_deliverables_hub_ui.mjs",
      "scripts/site/resolve_chrome.mjs",
      "entregas/",
      "index.html",
      "casos/modelo-relatorio-inteligencia-licitacoes/index.html",
      "styles.css",
      "script.js",
      "js/modules/nav.js",
      "scripts/site/public_navigation.py",
    ],
    artifacts: [],
    surfaces: ["/", "/entregas/", "/ferramentas/"],
  },
  "test:cta-whatsapp": {
    producers: [
      "scripts/site/test_cta_whatsapp.mjs",
      "scripts/site/svg_path_grammar.mjs",
      "scripts/site/fixtures/svg_path/",
      "scripts/pseo/html_shell.py",
      "data/data-desk/",
      "assets/data-desk/",
      "data/site/whatsapp-messages.json",
    ],
    artifacts: [],
    surfaces: ["/", "/diretoria-b2g/", "/defesa-margem-contratos-publicos/"],
  },
  "test:pseo-attribution": {
    producers: ["seo/scripts/test_pseo_attribution.mjs", "script.js"],
    artifacts: [],
    surfaces: ["/inteligencia/"],
  },
  "test:brand": {
    producers: [
      "scripts/site/test_brand_contract.py",
      "scripts/site/brand.py",
      "data/site/brand.json",
      "data/site/proof.json",
      "data/site/cases.json",
    ],
    artifacts: [],
    surfaces: ["/", "/casos/"],
  },
  "test:logo-contract": {
    producers: [
      "tests/brand/test_logo_contract.mjs",
      "data/brand/logo-contract.v1.json",
      "assets/logo-confenge.png",
      "assets/logo-confenge-500-f8a83f6d.png",
      "assets/logo-confenge-white.png",
      "assets/logo-confenge-white-500-1677038e.png",
      "styles.css",
      "scripts/pseo/html_shell.py",
      "scripts/pseo/build.py",
    ],
    artifacts: [],
    surfaces: ["/"],
  },
  "test:authority": {
    producers: [
      "scripts/site/test_authority_contract.py",
      "scripts/site/authority.py",
      "scripts/site/permissioned_proof.py",
      "scripts/site/test_permissioned_proof.py",
      "scripts/site/fixtures/permissioned_proof/",
      "scripts/site/render_authority_pages.py",
      "scripts/site/patch_authority_footers.py",
      "docs/contracts/permissioned-proof/",
      "data/site/authority-governance.json",
      "data/site/authority-matrix.json",
      "data/site/authority-signals-baseline-2026-08-15.json",
      "data/site/permissioned-proof-registry.json",
    ],
    artifacts: [],
    surfaces: ["/especialista/", "/metodologia-inteligencia/", "/lei-14133-obras/"],
  },
  "test:design": {
    producers: [
      "scripts/site/test_design_gates.py",
      "scripts/site/test_visitor_redesign.py",
      "styles.css",
      "assets/simple-page-a11y-v293.css",
      "404.html",
      "comercial/privacidade-leads/index.html",
    ],
    artifacts: [],
    surfaces: ["/", "/ferramentas/", "/diretoria-b2g/"],
  },
  "test:copy": {
    producers: [
      "scripts/site/test_copy_gates.py",
      "scripts/site/test_public_internal_marketing_labels.py",
      "scripts/site/scrub_em_dashes.py",
      "scripts/site/lint_editorial_copy.py",
      "scripts/site/test_scrub_em_dashes.py",
    ],
    artifacts: ["docs/editorial/COPY-LINT-REPORT.json"],
    surfaces: ["/", "/conteudos/"],
  },
  "audit:accessibility": {
    producers: ["scripts/site/audit_accessibility.py"],
    artifacts: [],
    surfaces: ["/", "/ferramentas/", "/diretoria-b2g/"],
  },
  "test:skip-link": {
    producers: ["scripts/site/test_skip_link_coverage.py", "scripts/pseo/public_artifact.py"],
    artifacts: [],
    surfaces: ["/", "/obrigado.html", "/404.html", "/privacidade/", "/termos-de-uso/"],
  },
  "test:lighthouse-gates": {
    producers: [
      "scripts/site/test_lighthouse_thresholds.mjs",
      "scripts/site/lighthouse_thresholds.mjs",
      "scripts/site/run_lighthouse.mjs",
      "scripts/site/interface_coverage.mjs",
      "scripts/site/test_interface_coverage.mjs",
      "data/quality/interface-coverage-policy.json",
      "data/organic/public-family-registry.json",
      "data/organic/bofu-intent-matrix.json",
      ".github/workflows/site-ci.yml",
    ],
    artifacts: ["docs/lighthouse-runs/summary.json"],
    surfaces: ["/"],
  },
  "test:ui": {
    producers: [
      "scripts/site/test_ui_geometry.mjs",
      "scripts/site/audit_sitewide_layout.mjs",
      "scripts/site/resolve_chrome.mjs",
      ".github/workflows/site-ci.yml",
    ],
    artifacts: [],
    surfaces: ["/", "/ferramentas/"],
  },
  "test:inbound-gates": {
    producers: [
      "scripts/site/test_inbound_gates.py",
      "scripts/site/inbound_gates.py",
      "scripts/site/inbound_first_remediate.py",
      "docs/seo/",
      "seo/content-disposition-2026-08-02.json",
      "sitemap.txt",
      "sitemap.xml",
      "sitemap-index.xml",
    ],
    artifacts: ["docs/seo/INBOUND-GATES-REPORT.json"],
    surfaces: ["/conteudos/", "/sitemap-index.xml"],
  },
  "test:workflow-gates": {
    producers: ["scripts/site/test_workflow_gates.py", ".github/workflows/"],
    artifacts: [],
    surfaces: [],
  },
  "test:ops-docs": {
    producers: ["scripts/site/test_ops_docs_honesty.py", "docs/ops/"],
    artifacts: [],
    surfaces: [],
  },
  "test:revops": {
    producers: [
      "scripts/revops/test_lead_stages.mjs",
      "scripts/revops/backfill_record_kind.mjs",
      "scripts/revops/test_search_demand.py",
      "scripts/revops/search_demand_observatory.py",
      "netlify/functions/lib/lead-stages.cjs",
      "netlify/functions/lib/record-kind.cjs",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/ops"],
  },
  "test:schedules": {
    producers: [
      "data/revops/inbound-backlog-decision.v1.json",
      "docs/ops/INBOUND-BACKLOG-DECISION-268.md",
      "netlify/functions/lib/inbound-backlog-policy.cjs",
      "scripts/revops/inbound_backlog_policy.mjs",
      "scripts/revops/test_inbound_backlog_policy.mjs",
      "scripts/revops/test_schedules.mjs",
      "scripts/revops/inbound_counters_proof.mjs",
      "scripts/revops/inbound_proof_contract.mjs",
      "data/revops/inbound-proof-runs/",
      "docs/ops/INBOUND-PRODUCTION-PROOF-267.md",
      "scripts/revops/scheduled_daily.mjs",
      "scripts/revops/scheduled_nurture.mjs",
      "scripts/revops/scheduled_weekly.mjs",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:tools": {
    producers: [
      "scripts/site/test_tools_structure.mjs",
      "scripts/site/test_tool_events.mjs",
      "ferramentas/",
    ],
    artifacts: [],
    surfaces: ["/ferramentas/"],
  },
  "test:nurture": {
    producers: [
      "scripts/revops/test_nurture.mjs",
      "netlify/functions/nurture.cjs",
      "netlify/functions/lib/nurture-core.cjs",
      "data/nurture/",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/nurture"],
  },
  "test:nurture-pages": {
    producers: [
      "scripts/site/test_nurture_pages.mjs",
      "nurture/",
      "data/nurture/",
      "netlify/functions/nurture.cjs",
      "netlify/functions/lib/nurture-core.cjs",
    ],
    artifacts: [],
    surfaces: ["/nurture/", "/casos/", "/imprensa/"],
  },
  "test:ferramentas-footer": {
    producers: ["scripts/site/test_ferramentas_brand_footer.py", "ferramentas/"],
    artifacts: [],
    surfaces: ["/ferramentas/"],
  },
  "test:nav": {
    producers: [
      "scripts/site/shell_nav.py",
      "scripts/site/render_nav_hubs.py",
      "scripts/site/test_nav_taskflow.py",
      "scripts/site/public_ia.py",
      "scripts/site/test_public_ia.py",
      "data/site/brand.json",
      "data/site/public-ia-map.json",
      "scripts/pseo/html_shell.py",
      "servicos-obras-publicas/",
      "problemas-que-resolvemos/",
    ],
    artifacts: ["servicos-obras-publicas/index.html", "problemas-que-resolvemos/index.html"],
    surfaces: ["/servicos-obras-publicas/", "/problemas-que-resolvemos/"],
  },
  "test:hub-truth": {
    producers: [
      "scripts/site/test_hub_truth.mjs",
      "conteudos/",
      "seo/content-disposition-2026-08-02.json",
      "scripts/site/inbound_first_remediate.py",
    ],
    artifacts: [],
    surfaces: ["/conteudos/"],
  },
  "test:tool-compute": {
    producers: [
      "scripts/site/test_tool_compute.mjs",
      "assets/js/tool-compute.cjs",
      "assets/js/tool-persist.cjs",
    ],
    artifacts: [],
    surfaces: ["/ferramentas/"],
  },
  "test:wave1-fields": {
    producers: ["scripts/site/test_wave1_review_fields.mjs", "docs/editorial/"],
    artifacts: [],
    surfaces: ["/conteudos/"],
  },
  "test:lead-store-production": {
    producers: ["scripts/site/test_lead_store_production_profile.mjs"],
    artifacts: [],
    surfaces: ["/.netlify/functions/lead"],
  },
  "test:external-runtime": {
    // netlify.toml declares which modules stay unbundled; package.json decides
    // whether they are installed at function runtime at all; the function trees
    // are where the called API surface is derived from.
    producers: [
      "scripts/site/test_external_runtime_modules.mjs",
      "netlify.toml",
      "package.json",
      "netlify/functions/",
      "scripts/offers/",
    ],
    artifacts: [],
    surfaces: ["/.netlify/functions/lead", "/.netlify/functions/ops"],
  },
  "test:ops-auth": {
    producers: ["scripts/site/test_ops_auth_matrix.mjs", "netlify/functions/ops.cjs"],
    artifacts: [],
    surfaces: ["/.netlify/functions/ops"],
  },
  "test:env-example": {
    producers: [
      "scripts/site/test_env_example_honesty.py",
      ".env.example",
      "docs/ops/ENV-VARS.md",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:epic-td": {
    producers: ["scripts/site/test_epic_td_suite.mjs"],
    artifacts: [],
    surfaces: [],
  },
  "test:script-modules": {
    producers: ["scripts/site/build_script_modules.mjs", "js/modules/", "script.js"],
    artifacts: ["script.js"],
    surfaces: ["/"],
  },
  "test:indexnow": {
    producers: [
      "scripts/site/test_indexnow.mjs",
      "scripts/site/indexnow_submit.mjs",
      ".well-known/indexnow-key.txt",
      "docs/ops/INDEXNOW.md",
    ],
    artifacts: [],
    surfaces: ["/.well-known/indexnow-key.txt"],
  },
  "test:diagnose-margin": {
    producers: [
      "scripts/site/test_diagnose_margin.mjs",
      "scripts/site/test_money_asset_lead.mjs",
      "scripts/site/test_money_asset_page_events.mjs",
      "scripts/site/test_money_asset_loop.mjs",
      "scripts/site/test_money_asset_canary_e2e.mjs",
      "scripts/site/test_margin_defense_select_only.py",
      "scripts/site/money_asset_loc.mjs",
      "scripts/site/money_asset_prod_proof.mjs",
      "scripts/money_asset/",
      "assets/js/diagnose-margin.cjs",
      "assets/js/diagnose-margin.js",
      "ferramentas/diagnostico-defesa-margem/",
      "data/organic/money-asset-indexability.json",
      "data/organic/money-asset-producer-block.json",
      "data/extra-cli/",
    ],
    artifacts: ["data/organic/money-asset-indexability.json"],
    surfaces: ["/ferramentas/diagnostico-defesa-margem/"],
  },
  "test:research-pack": {
    producers: ["scripts/research/", "data/research/", "docs/research/"],
    artifacts: ["data/research/"],
    surfaces: ["/radar/pesquisa/"],
  },
  "test:trust-session-protocol": {
    producers: [
      "scripts/user_research_protocol/",
      "docs/research/icp-trust-session-v1/",
      "docs/ops/DSAR-RETENTION-RUNBOOK.md",
    ],
    artifacts: ["docs/research/icp-trust-session-v1/runs/"],
    surfaces: [],
  },
  "test:migration-manifesto": {
    producers: ["scripts/migration/", "data/migration/", "docs/migration/"],
    artifacts: ["data/migration/smartlic-confenge/manifesto.v1.json"],
    surfaces: [],
  },
  "test:knowledge-funnel": {
    producers: [
      "scripts/knowledge_funnel/",
      "tests/knowledge_funnel/",
      "data/knowledge_funnel/",
    ],
    artifacts: [],
    surfaces: ["/inteligencia/valor-tipico-contratos-pavimentacao/"],
  },
  "test:affected-selector": {
    producers: [
      "scripts/site/affected_graph.mjs",
      "scripts/site/test_affected.mjs",
      "scripts/site/test_affected_selector.mjs",
    ],
    artifacts: [],
    surfaces: [],
  },
  "test:visible-parity": {
    producers: [
      "scripts/site/test_visible_parity.py",
      "scripts/site/visible_parity.py",
      "scripts/site/fixtures/visible_parity/",
    ],
    artifacts: ["seo/visible-parity.json", "seo/visible-parity.md"],
    surfaces: [],
  },
  "test:contract-analysis": {
    producers: [
      "scripts/contract_analysis/",
      "data/editorial/contract-analysis/",
      "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json",
      "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.md",
    ],
    artifacts: ["analises-contratos-publicos/", "docs/editorial/CONTRACT_ANALYSIS_CANARY_STATUS.json"],
    surfaces: ["/analises-contratos-publicos/"],
  },
  "test:market-answers": {
    producers: [
      "scripts/market_answers/",
      "tests/market_answers/",
      "data/editorial/market-answers/",
      "data/conversion/fixtures/market-answer-canary.v1.json",
    ],
    artifacts: [
      "inteligencia/valor-tipico-contratos-pavimentacao/",
      "docs/editorial/MARKET_ANSWER_CANARY_STATUS.json",
    ],
    surfaces: ["/inteligencia/valor-tipico-contratos-pavimentacao/"],
  },
  "discovery:test": {
    producers: [
      "scripts/discovery/",
      "tests/discovery/",
      "tests/data_desk/",
      "scripts/data_desk/",
      "data/discovery/",
      "data/data-desk/",
    ],
    artifacts: ["data/discovery/"],
    surfaces: [],
  },
  "test:conversion": {
    producers: ["tests/conversion/", "scripts/conversion/", "data/conversion/", "docs/contracts/intent-action/", "tests/offers/", "scripts/offers/", "data/offers/", "scripts/offers/governance-pin.cjs", "data/offers/governance-authority-pin.json"],
    artifacts: [],
    surfaces: ["/diagnostico-b2g-360/", "/diagnostico-b2g-expansao/", "/diretoria-b2g/"],
  },
  "validate:seo": {
    producers: ["seo/scripts/validate_seo.py", "seo/", "tests/data_desk/test_data_desk.py"],
    artifacts: [],
    surfaces: ["/conteudos/"],
  },
  // Extra (not in npm test merge inventory). Mapped so organic/distribution
  // changes are not unknown → full. Local test:affected may run them.
  "organic:test": {
    producers: ["scripts/organic/", "data/organic/"],
    artifacts: ["data/organic/demand-engine-registry.json"],
    surfaces: [],
  },
  "distribution:test": {
    producers: ["scripts/distribution/", "data/distribution/", "docs/ops/distribution/"],
    artifacts: ["data/distribution/"],
    surfaces: [],
  },
});

/**
 * Changes that always promote the full npm-test inventory.
 * Unknown/unmapped paths are handled separately (also full, never skip).
 */
export const PROMOTE_FULL = Object.freeze([
  {
    id: "shared-contracts",
    reason: "shared-contract change always promotes the full relevant set",
    match: (p) => p === "docs/contracts" || p.startsWith("docs/contracts/"),
  },
  {
    id: "robots",
    reason: "robots.txt or robots assembly input always promotes the full relevant set",
    match: (p) =>
      p === "robots.txt" ||
      p.endsWith("/robots.txt") ||
      p === "scripts/pseo/build.py",
  },
  {
    id: "lead-libs",
    reason: "lead handler or lead-lib module always promotes the full relevant set",
    match: (p) =>
      p === "netlify/functions/lead.cjs" ||
      /^netlify\/functions\/lib\/lead-[^/]+\.cjs$/.test(p) ||
      p === "netlify/functions/lib/inbound-handoff.cjs",
  },
]);

/** Real origin/main commits used as the false-negative corpus (paths from git, not invented). */
export const CORPUS_SHAS = Object.freeze([
  {
    sha: "3ae70c6b0e5b878ccbfc646cffc421a8722ebb98",
    subject: "docs pin confenge inbound env (#82)",
  },
  {
    sha: "2a38e1b0c79c02bae86f80aef4ff347864a7bfb4",
    subject: "docs confenge inbound canonical handoff (#81)",
  },
  {
    sha: "dc44888f58b07ff11e6a31d7da64754809265e42",
    subject: "feat(organic): consume public-read-margin-defense/1.0 and flip Diagnóstico (#80)",
  },
  {
    sha: "3d67c2a23759f39daf135dcaf4a219782d150618",
    subject: "feat(organic): close inbound go-live gaps without relaxing gates (#79)",
  },
  {
    sha: "648b88796a50d331558fab9ac6ebea41c9615e18",
    subject: "feat(migration): accept SmartLic→CONFENGE migration manifesto (#68)",
  },
  {
    sha: "afd19df0f607c6ab2b510f386bff13cb923ac22d",
    subject: "feat(research): EDIÇÃO ZERO 4-UF pack (NEEDS_DATA) (#73)",
  },
  {
    sha: "d5410bdb5055f97ce2684a13b271d8a0101bf9a9",
    subject: "feat(authority): gated Entity Authority contract (#74) (#78)",
  },
  {
    sha: "ac0116525ac6d30e12c9311fc1eabc2fbd828ee5",
    subject: "feat(distribution): manual-first earned-distribution OS for Radar (#66) (#77)",
  },
  {
    sha: "abc883231159b317ce78bc4fb4fdf159314606e1",
    subject: "feat(money-asset): prove page-lead-handoff loop and close ops counters (#76)",
  },
  {
    sha: "f2f7f1e4ab63110ed6c4beb4fc59fa33cf80488c",
    subject: "docs: align inbound roadmap with margin defense (#75)",
  },
  {
    sha: "5ab00b890532576a2a9057d1503cdac7fcfe0747",
    subject: "feat(leads): persist-first Warmbly inbound handoff (#72)",
  },
  {
    sha: "c809315790d063f3c0520d743fedad6993f045af",
    subject: "fix(money-asset): fire required events and keep UNKNOWN honest (#71)",
  },
  {
    sha: "fa7fed7b5b8ba8f6a9e41bec526541c38e7d08f3",
    subject: "feat(money-asset): Diagnóstico de Defesa de Margem from extra-cli facts (#70)",
  },
  {
    sha: "d5bf1fbbe0e34b620ae6e4d5172e06344790afcf",
    subject: "feat(organic): add Day-D demand and discovery controls (#69)",
  },
  {
    sha: "a13d6a6506738595a2b8d9cbbf37b3f0dd23dde5",
    subject: "docs(strategy): reconcile market capture and runtime authority (#67)",
  },
]);

const FILE_IN_COMMAND = /(?:^|[\s'"])((?:scripts|seo\/scripts)\/[A-Za-z0-9_./-]+\.(?:py|mjs|cjs|js))/g;

export function normalizePath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function loadPackageScripts() {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).scripts || {};
}

/** Ordered suite ids from the live `scripts.test` inventory. */
export function inventorySuites(scripts = loadPackageScripts()) {
  const test = scripts.test || "";
  const out = [];
  for (const part of test.split("&&")) {
    const trimmed = part.trim();
    const m = trimmed.match(/^npm run (\S+)$/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function inventoryCommand(suiteId, scripts = loadPackageScripts()) {
  const cmd = scripts[suiteId];
  if (!cmd) throw new Error(`package.json scripts missing ${suiteId}`);
  return cmd;
}

/** Entry files / pytest dirs named in the suite's npm script. */
export function entryProducers(suiteId, scripts = loadPackageScripts()) {
  const cmd = inventoryCommand(suiteId, scripts);
  const found = new Set();
  let m;
  const re = new RegExp(FILE_IN_COMMAND.source, FILE_IN_COMMAND.flags);
  while ((m = re.exec(cmd))) found.add(m[1]);
  const pytest = cmd.match(/pytest\s+(\S+)/);
  if (pytest) {
    const dir = pytest[1].replace(/\/$/, "") + "/";
    found.add(dir);
  }
  return [...found].sort();
}

export function assertGraphCoversInventory(scripts = loadPackageScripts()) {
  const inv = inventorySuites(scripts);
  const missing = inv.filter((id) => !SUITE_GRAPH[id]);
  const extra = Object.keys(SUITE_GRAPH).filter((id) => !inv.includes(id));
  if (missing.length) {
    throw new Error(
      `SUITE_GRAPH missing inventory suites (refuse to select): ${missing.join(", ")}`,
    );
  }
  return { inventory: inv, extra };
}

export function matchesProducer(changedPath, producer) {
  const p = normalizePath(changedPath);
  const prod = normalizePath(producer);
  if (!p || !prod) return false;
  if (prod.endsWith("/")) return p === prod.slice(0, -1) || p.startsWith(prod);
  if (prod.includes("*")) {
    const esc = prod.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    return new RegExp(`^${esc}(?:/|$)`).test(p) || new RegExp(`^${esc}$`).test(p);
  }
  return p === prod || p.startsWith(`${prod}/`);
}

export function isPublicSurfacePath(changedPath) {
  const p = normalizePath(changedPath);
  if (p.endsWith(".html")) return true;
  if (p === "styles.css" || p.startsWith("assets/css/") || p.startsWith("css/")) return true;
  return PUBLIC_SURFACE_PREFIXES.some((pre) => p === pre.replace(/\/$/, "") || p.startsWith(pre));
}

export function promoteHitsForPath(changedPath) {
  const p = normalizePath(changedPath);
  return PROMOTE_FULL.filter((rule) => rule.match(p)).map((rule) => ({
    id: rule.id,
    reason: rule.reason,
    path: p,
  }));
}

function producersForSuite(suiteId, scripts) {
  const listed = SUITE_GRAPH[suiteId]?.producers || [];
  return [...new Set([...listed, ...entryProducers(suiteId, scripts)])];
}

export function consumerSuitesForPath(changedPath, scripts = loadPackageScripts()) {
  const p = normalizePath(changedPath);
  const { inventory, extra } = assertGraphCoversInventory(scripts);
  const hits = [];
  for (const id of [...inventory, ...extra]) {
    const producers = producersForSuite(id, scripts);
    const matched = producers.filter((prod) => matchesProducer(p, prod));
    if (matched.length) {
      hits.push({
        id,
        extra: extra.includes(id),
        producers: matched.sort(),
        why: `producer ${p} → consumer ${id} (via ${matched.sort().join(", ")})`,
      });
    }
  }
  if (isPublicSurfacePath(p)) {
    for (const id of PUBLIC_HTML_SUITES) {
      if (!inventory.includes(id)) continue;
      if (hits.some((h) => h.id === id)) continue;
      hits.push({
        id,
        extra: false,
        producers: ["<public-surface>"],
        why: `producer ${p} → consumer ${id} (public surface / HTML scan)`,
      });
    }
  }
  hits.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hits;
}

function emptySelection(inventory, extra) {
  const selected = [];
  const reasonsBySuite = {};
  return {
    inventory,
    selected,
    selected_ids: [],
    skipped: [...inventory],
    fallback: "none",
    fallback_reason: null,
    promote: [],
    unknown_paths: [],
    reasons_by_suite: reasonsBySuite,
    extra_graph_keys: extra,
    risk: {
      level: "none",
      false_negative_oracle: "mapped-necessity ∪ promote-full",
      notes: [
        "no changed paths",
        "fallback for unknown/promote is full, never skip",
        "merge still requires npm test / full site-ci",
      ],
    },
  };
}

function fullSelection(inventory, extra, fallback, fallbackReason, promote, unknown, reasonsBySuite) {
  const selected = inventory.map((id) => ({
    id,
    why: (reasonsBySuite[id] || [fallbackReason]).join("; "),
    reasons: reasonsBySuite[id] || [fallbackReason],
  }));
  return {
    inventory,
    selected,
    selected_ids: [...inventory],
    skipped: [],
    fallback,
    fallback_reason: fallbackReason,
    promote,
    unknown_paths: unknown,
    reasons_by_suite: reasonsBySuite,
    extra_graph_keys: extra,
    risk: {
      level: "full",
      false_negative_oracle: "mapped-necessity ∪ promote-full",
      notes: [
        fallbackReason,
        "over-select allowed; omit is not",
        "merge still requires npm test / full site-ci",
      ],
    },
  };
}

/**
 * Mapped-necessary set: consumers of changed producers ∪ promote-full ∪ unknown→full.
 * This is the false-negative oracle. Over-select is allowed; omit is not.
 */
export function necessarySuites(paths, scripts = loadPackageScripts()) {
  return selectAffected(paths, scripts);
}

/**
 * Deterministic selector. Same normalized path list → same suite set and reasons.
 */
export function selectAffected(paths, scripts = loadPackageScripts()) {
  const { inventory, extra } = assertGraphCoversInventory(scripts);
  const normalized = [...new Set((paths || []).map(normalizePath).filter(Boolean))].sort();
  if (!normalized.length) return emptySelection(inventory, extra);

  const reasonsBySuite = Object.fromEntries(inventory.map((id) => [id, []]));
  for (const id of extra) reasonsBySuite[id] = [];
  const promote = [];
  const unknown = [];

  for (const p of normalized) {
    const hits = promoteHitsForPath(p);
    if (hits.length) {
      for (const hit of hits) {
        promote.push(hit);
        const why = `promote-full: ${hit.id} (${p}) — ${hit.reason}`;
        for (const id of inventory) {
          if (!reasonsBySuite[id].includes(why)) reasonsBySuite[id].push(why);
        }
      }
      continue;
    }
    const consumers = consumerSuitesForPath(p, scripts);
    if (!consumers.length) {
      unknown.push(p);
      const why = `fallback-full: unknown path ${p}`;
      for (const id of inventory) {
        if (!reasonsBySuite[id].includes(why)) reasonsBySuite[id].push(why);
      }
      continue;
    }
    for (const c of consumers) {
      if (!reasonsBySuite[c.id]) reasonsBySuite[c.id] = [];
      if (!reasonsBySuite[c.id].includes(c.why)) reasonsBySuite[c.id].push(c.why);
    }
  }

  if (promote.length || unknown.length) {
    const fallback = promote.length ? "full" : "full";
    const fallbackReason = promote.length
      ? `promote-full (${[...new Set(promote.map((h) => h.id))].sort().join(", ")})`
      : `unknown path(s): ${unknown.join(", ")}`;
    for (const id of inventory) reasonsBySuite[id].sort();
    return fullSelection(inventory, extra, fallback, fallbackReason, promote, unknown, reasonsBySuite);
  }

  const selectedIds = [
    ...inventory.filter((id) => reasonsBySuite[id].length),
    ...extra.filter((id) => (reasonsBySuite[id] || []).length),
  ];
  for (const id of selectedIds) reasonsBySuite[id].sort();
  const selected = selectedIds.map((id) => ({
    id,
    why: reasonsBySuite[id].join("; "),
    reasons: reasonsBySuite[id],
  }));
  return {
    inventory,
    selected,
    selected_ids: selectedIds,
    skipped: inventory.filter((id) => !selectedIds.includes(id)),
    fallback: "none",
    fallback_reason: null,
    promote,
    unknown_paths: unknown,
    reasons_by_suite: Object.fromEntries(
      selectedIds.map((id) => [id, reasonsBySuite[id]]),
    ),
    extra_graph_keys: extra,
    risk: {
      level: selectedIds.length < inventory.length ? "subset" : "full",
      false_negative_oracle: "mapped-necessity ∪ promote-full",
      notes: [
        "over-select allowed; omit is not",
        "merge still requires npm test / full site-ci",
      ],
    },
  };
}

export function omittedAgainstNecessary(selectedIds, necessaryIds) {
  const selected = new Set(selectedIds);
  return necessaryIds.filter((id) => !selected.has(id)).sort();
}

export function extraAgainstNecessary(selectedIds, necessaryIds) {
  const necessary = new Set(necessaryIds);
  return selectedIds.filter((id) => !necessary.has(id)).sort();
}
