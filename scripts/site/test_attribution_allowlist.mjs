/**
 * Drives shipped attribution allowlist + lead-core pickAttribution.
 * Injects a non-allowlisted query and a PII-looking value; both must be dropped.
 */
import { createRequire } from "module";
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));

function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exit(1);
}
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

if (!Array.isArray(core.ATTR_ALLOWLIST) || !core.ATTR_ALLOWLIST.includes("route_family")) {
  fail("allowlist_exported", core.ATTR_ALLOWLIST);
}
pass("allowlist_has_route_family");

const picked = core.pickAttribution({
  utm_source: "gsc",
  route_family: "reequilibrio",
  cta_id: "pillar_hero",
  asset_id: "reequilibrio-obras-publicas",
  correlation_id: "corr-test-001",
  landing_url: "/reequilibrio-obras-publicas/",
  referrer: "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico",
  email: "alice@example.com",
  nome: "Alice",
  arbitrary_debug: "drop-me",
  fbclid: "abc.123",
  gclid: "xyz",
  phone: "+5548999999999",
  utm_source_extra: "nope",
});

if (picked.arbitrary_debug || picked.fbclid || picked.gclid || picked.email || picked.nome || picked.phone) {
  fail("dropped_unlisted_or_pii", picked);
}
if (picked.utm_source !== "gsc" || picked.route_family !== "reequilibrio") {
  fail("kept_allowlisted", picked);
}
if (picked.correlation_id !== "corr-test-001") fail("correlation", picked);
pass("pickAttribution_drops_unlisted_and_pii");

const piiBlocked = core.sanitizeAttributionValue("ceo@empresa.com.br");
if (piiBlocked) fail("sanitize_email", piiBlocked);
const phoneBlocked = core.sanitizeAttributionValue("+5548988344559");
if (phoneBlocked) fail("sanitize_phone", phoneBlocked);
pass("sanitize_blocks_pii");

const validated = core.validateAndNormalize({
  nome: "QA Attr",
  telefone: "48988344559",
  estagio: "problema urgente em contrato",
  jornada: "contrato",
  consentimento: "on",
  route_family: "margin-defense",
  cta_id: "offer_hero",
  asset_id: "defesa-margem-contratos-publicos",
  correlation_id: "corr-lead-1",
  landing_url: "/defesa-margem-contratos-publicos/",
  email_extra: "should-not-copy@x.com",
});
if (!validated.ok || validated.lead.route_family !== "margin-defense") {
  fail("validate_route_family", validated);
}
if (validated.lead.email_extra) fail("validate_leaked_unlisted", validated.lead);
if (validated.lead.landing_page !== "/defesa-margem-contratos-publicos/") {
  fail("landing_url_alias", validated.lead);
}
pass("validateAndNormalize_persists_allowlisted_attr");

const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
if (!script.includes("route_family") || !script.includes("correlation_id")) {
  fail("script_js_missing_attr_keys", "rebuild script.js from modules");
}
if (!script.includes("confengeAttribution")) {
  fail("script_js_missing_export", "window.confengeAttribution");
}

const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: {
    classList: { remove() {}, add() {} },
    dataset: {
      routeFamily: "reequilibrio",
      assetId: "reequilibrio-obras-publicas",
      ctaId: "pillar_hero",
    },
  },
  referrer: "https://smartlic.tech/glossario/reajuste",
};
const store = {};
const sessionStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
const windowObj = {
  dataLayer: [],
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/reequilibrio-obras-publicas/",
    search: "?utm_source=gsc&fbclid=DROP&email=leak@x.com&route_family=reequilibrio&correlation_id=from-url",
    hash: "",
  },
  document,
  addEventListener: () => {},
  innerHeight: 800,
  scrollY: 0,
  sessionStorage,
  crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000099" },
};
windowObj.window = windowObj;
const sandbox = { window: windowObj, document, console, URLSearchParams, sessionStorage };
vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const api = sandbox.window.confengeAttribution;
if (!api || typeof api.pickFromSearch !== "function") {
  fail("confengeAttribution_missing", api);
}
const fromSearch = api.pickFromSearch(windowObj.location.search);
if (fromSearch.fbclid || fromSearch.email) fail("browser_kept_unlisted", fromSearch);
if (fromSearch.utm_source !== "gsc") fail("browser_utm", fromSearch);
if (fromSearch.email) fail("browser_email_from_query", fromSearch);
pass("browser_pickFromSearch_allowlist");

const persisted = JSON.parse(store.confenge_pseo_attribution || "{}");
if (persisted.fbclid || persisted.email) fail("session_leaked_unlisted", persisted);
if (!persisted.correlation_id) fail("session_missing_correlation", persisted);
if (persisted.route_family !== "reequilibrio") fail("session_route_family", persisted);
pass("session_persists_allowlisted_only");

console.log("OK attribution-allowlist");
