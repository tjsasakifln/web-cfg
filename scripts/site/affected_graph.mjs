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
  "test:ui",
  "test:inbound-gates",
  "test:cta-whatsapp",
  "test:tools",
  "test:nurture-pages",
  "test:ferramentas-footer",
  "test:hub-truth",
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
    producers: ["scripts/editorial/", "data/editorial/", "docs/editorial/"],
    artifacts: ["docs/editorial/"],
    surfaces: ["/conteudos/", "/politica-editorial/"],
  },
  "test:analytics": {
    producers: [
      "seo/scripts/test_analytics_pii.mjs",
      "seo/scripts/test_editorial_analytics.mjs",
      "seo/scripts/test_event_dictionary.mjs",
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
    producers: ["tests/local_entity/", "scripts/local_entity/", "data/local-entity/"],
    artifacts: ["docs/seo/local-entity/"],
    surfaces: ["/especialista/tiago-jun-sasaki/"],
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
  "test:cta-whatsapp": {
    producers: ["scripts/site/test_cta_whatsapp.mjs", "data/site/whatsapp-messages.json"],
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
  "test:authority": {
    producers: [
      "scripts/site/test_authority_contract.py",
      "scripts/site/authority.py",
      "scripts/site/render_authority_pages.py",
      "scripts/site/patch_authority_footers.py",
      "data/site/authority-governance.json",
      "data/site/authority-matrix.json",
      "data/site/authority-signals-baseline-2026-08-15.json",
    ],
    artifacts: [],
    surfaces: ["/especialista/", "/metodologia-inteligencia/", "/lei-14133-obras/"],
  },
  "test:design": {
    producers: [
      "scripts/site/test_design_gates.py",
      "scripts/site/test_visitor_redesign.py",
      "styles.css",
    ],
    artifacts: [],
    surfaces: ["/", "/ferramentas/", "/diretoria-b2g/"],
  },
  "test:copy": {
    producers: [
      "scripts/site/test_copy_gates.py",
      "scripts/site/scrub_em_dashes.py",
      "scripts/site/lint_editorial_copy.py",
      "scripts/site/test_scrub_em_dashes.py",
    ],
    artifacts: ["docs/editorial/COPY-LINT-REPORT.json"],
    surfaces: ["/", "/conteudos/"],
  },
  "test:ui": {
    producers: [
      "scripts/site/test_ui_geometry.mjs",
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
      "scripts/revops/test_schedules.mjs",
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
    producers: ["tests/conversion/", "scripts/conversion/", "data/conversion/", "tests/offers/", "scripts/offers/", "data/offers/", "scripts/offers/governance-pin.cjs", "data/offers/governance-authority-pin.json"],
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
