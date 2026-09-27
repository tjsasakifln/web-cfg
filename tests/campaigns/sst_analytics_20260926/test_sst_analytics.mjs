import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
const nav = fs.readFileSync(path.join(root, "js/modules/nav.js"), "utf8");
const analytics = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
const shippedScript = fs.readFileSync(path.join(root, "script.js"), "utf8");

// Couple the behavioral proof below to the current modular source. A mutation
// in nav.js must not be hidden by an older but still functional script.js.
const moduleSources = ["analytics", "nav", "offer-fit", "form"].map((name) =>
  fs.readFileSync(path.join(root, "js/modules", `${name}.js`), "utf8")
    .replace(/^\/\* MODULE[\s\S]*?\*\/\n/, ""));
const assemblyHeader = `/* CONFENGE public site JS — modular assembly (SYS-03).
 * Source modules: js/modules/analytics.js, nav.js, offer-fit.js, form.js
 * Rebuild: node scripts/site/build_script_modules.mjs --write
 */
`;
const assembled = await minify(assemblyHeader + moduleSources.join("\n"), {
  compress: { passes: 5, drop_console: true, unsafe: true },
  mangle: { toplevel: true, reserved: ["PII_PARAM_PATTERN", "firstInvalid", "applyJourneyToForm", "confengeRouteOfferFit"] },
  format: { comments: /CONFENGE public site JS|EVENT_CONTRACT_CLIENT_/ },
});
assert.equal(shippedScript, `${assembled.code}\n`, "script.js must be the deterministic assembly of the tested modules");

const events = [
  "sst_page_view",
  "sst_cta_click",
  "sst_whatsapp_click",
  "sst_form_start",
  "sst_form_submit",
  "pgr_cta",
  "pgr_review_cta",
  "sst_obra_cta",
  "sst_outsourcing_cta",
];

for (const event of events) {
  assert.ok(contract.admittedNames().includes(event), `${event} must be admitted`);
  assert.match(analytics, new RegExp(`${event}: 1`), `${event} must be client-admitted`);
}

for (const [family, event] of Object.entries({
  "elaboracao-pgr": "pgr_cta",
  "revisao-atualizacao-pgr": "pgr_review_cta",
  "pgr-documentacao-sst-obras": "sst_obra_cta",
  "terceirizacao-documentacao-sst": "sst_outsourcing_cta",
  hub: "",
})) {
  const key = family === "hub" ? "hub" : `'${family}'`;
  assert.match(nav, new RegExp(`${key}: '${event}'`), `SST family mapping ${family}`);
}

// The campaign may only use declared metadata. It must not inspect a field,
// free message, document, name, phone or email for analytics dimensions.
const sstBlock = nav.slice(nav.indexOf("const SST_ROUTE_FAMILIES"), nav.indexOf("// Service / offer page view"));
assert.doesNotMatch(sstBlock, /formData|\.value|\b(?:message|mensagem|arquivo|email|phone|telefone|nome)\b/i);
assert.match(nav, /data-journey/);
assert.match(nav, /data-tema/);
assert.match(nav, /data-cta-id/);
assert.match(nav, /data-route-family/);

const minimized = contract.minimizeProps({
  route_family: "elaboracao-pgr",
  cta_id: "pgr-hero",
  tema: "pgr",
  nome: "Ana",
  email: "ana@example.com",
  telefone: "+55 48 98888-0000",
  mensagem: "texto livre",
  documento: "aso.pdf",
});
assert.deepEqual(minimized.props, {
  route_family: "elaboracao-pgr",
  cta_id: "pgr-hero",
  tema: "pgr",
});

// A physical DOM event is guarded before supplemental and generic emissions,
// preserving the existing event while rejecting duplicate listeners.
assert.match(nav, /if \(domEvent && domEvent\.__confengeTracked\) return;/);
assert.match(nav, /domEvent\.__confengeTracked = true;/);
assert.match(nav, /track\('sst_cta_click', props\)/);
assert.match(nav, /track\('cta_click'/);

// Home forms are generic until their finite journey changes. Both a URL/session
// preselection (hidden jornada) and a later stage selection activate exactly
// the SST lifecycle; another journey cannot do so.
const resolvesSst = ({ jornada = "", stageJourney = "" } = {}) => jornada === "sst" || stageJourney === "sst";
assert.equal(resolvesSst({ jornada: "sst" }), true, "home preselected as SST");
assert.equal(resolvesSst({ stageJourney: "sst" }), true, "home selection changed to SST");
assert.equal(resolvesSst({ jornada: "contrato", stageJourney: "contrato" }), false, "non-SST journey stays excluded");
assert.match(nav, /journey && journey\.value === 'sst'/);
assert.match(nav, /selected\.dataset\.journey === 'sst'/);
assert.match(nav, /form\.addEventListener\('focusin', trackSstFormStart\)/);
assert.match(nav, /stage\.addEventListener\('change'/);
assert.match(nav, /form\.addEventListener\('confenge:journeychange', syncSstNeed\)/);
assert.match(nav, /form\.querySelectorAll\('\[data-sst-need\]'\)/);
assert.match(nav, /need\.hidden = !active/);
assert.match(nav, /need\.setAttribute\('inert', ''\)/);
assert.doesNotMatch(nav, /(?:getAttribute|querySelector)\([^)]*sst_necessidade/);

for (const [choice, routeFamily] of Object.entries({
  elaborar_pgr: "elaboracao-pgr",
  revisar_pgr: "revisao-atualizacao-pgr",
  obra: "pgr-documentacao-sst-obras",
  terceirizar_documentacao: "terceirizacao-documentacao-sst",
})) {
  assert.match(nav, new RegExp(`${choice}: \\{ tema: '${routeFamily}', route_family: '${routeFamily}' \\}`));
}
assert.match(nav, /if \(active\) projectSstNeed\(\);/);
assert.match(nav, /else clearSstNeedProjection\(\);/);
assert.match(nav, /input\.value === input\.dataset\.sstNeedProjection/);
assert.match(nav, /sstNeed\.addEventListener\('change'/);
assert.match(nav, /'seguranca-trabalho-apoio-tecnico': 'hub'/);
assert.match(nav, /const pathFamily = sstRouteFamilyFromPath\(pagePath\);/);
assert.match(nav, /if \(pathFamily && pathFamily !== 'hub'\) return pathFamily;/);

function parseOpenTag(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([:\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function pageFixture(route, ctaId) {
  const html = fs.readFileSync(path.join(root, route, "index.html"), "utf8");
  const bodyTag = html.match(/<body\b[^>]*>/i)?.[0] || "";
  const ctaTag = [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => parseOpenTag(tag)["data-cta-id"] === ctaId);
  assert.ok(ctaTag, `${route} exposes real CTA ${ctaId}`);
  return { body: parseOpenTag(bodyTag), cta: parseOpenTag(ctaTag) };
}

function makeClickable(attrs) {
  const listeners = [];
  return {
    textContent: "CTA SST",
    classList: { contains: () => false },
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = String(value); },
    hasAttribute(name) { return Object.hasOwn(attrs, name); },
    closest() { return null; },
    matches() { return false; },
    addEventListener(type, fn) { if (type === "click") listeners.push(fn); },
    click() {
      const event = { preventDefault() {} };
      for (const listener of listeners) listener(event);
    },
  };
}

// Execute the shipped browser bundle. This is deliberately a DOM harness, not
// a second implementation of the route resolver or event mapping.
function driveShippedBundle({ pathname, bodyAttrs, ctaAttrs }) {
  const dataLayer = [];
  const cta = makeClickable({ ...ctaAttrs });
  const body = {
    dataset: {},
    classList: { add() {}, remove() {} },
    getAttribute(name) { return Object.hasOwn(bodyAttrs, name) ? bodyAttrs[name] : null; },
  };
  const document = {
    readyState: "complete",
    body,
    documentElement: { scrollHeight: 2000, classList: { replace() {} } },
    head: { appendChild() {} },
    referrer: "",
    querySelector: () => null,
    querySelectorAll(selector) {
      const value = String(selector || "");
      if (value.includes("wa.me")) return [cta];
      if (value === "a[href]") return [cta];
      if (value === "[data-event-name]" && cta.hasAttribute("data-event-name")) return [cta];
      return [];
    },
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => ({ setAttribute() {}, querySelector: () => null }),
  };
  const storage = new Map();
  const sessionStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const windowObj = {
    dataLayer,
    document,
    location: { pathname, search: "", hash: "" },
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    innerHeight: 800,
    innerWidth: 1200,
    scrollY: 0,
    sessionStorage,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000099" },
    fetch: async () => ({ ok: true, status: 202 }),
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
  };
  windowObj.window = windowObj;
  const sandbox = {
    window: windowObj,
    document,
    console,
    URL,
    URLSearchParams,
    sessionStorage,
    navigator: {},
    fetch: windowObj.fetch,
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(shippedScript, sandbox);
  assert.equal(typeof sandbox.window.confengeTrack, "function", "shipped analytics bus is available");
  cta.click();
  return dataLayer;
}

// Each BOFU page deliberately keeps the legacy body family. Only the real
// pathname resolver in script.js can make these four distinct events pass.
for (const [route, ctaId, familyEvent] of [
  ["elaboracao-pgr", "pgr-hero-whatsapp", "pgr_cta"],
  ["revisao-atualizacao-pgr", "pgr-review-hero-whatsapp", "pgr_review_cta"],
  ["pgr-documentacao-sst-obras", "sst-obra-hero-whatsapp", "sst_obra_cta"],
  ["terceirizacao-documentacao-sst", "sst-outsourcing-hero-whatsapp", "sst_outsourcing_cta"],
]) {
  const fixture = pageFixture(route, ctaId);
  assert.equal(fixture.body["data-route-family"], "seguranca-trabalho-apoio-tecnico", `${route} keeps legacy body family`);
  const layer = driveShippedBundle({ pathname: `/${route}/`, bodyAttrs: fixture.body, ctaAttrs: fixture.cta });
  const familyHit = layer.find((entry) => entry.event === familyEvent && entry.cta_id === ctaId);
  assert.ok(familyHit, `shipped script emits ${familyEvent} for ${route}`);
  assert.equal(familyHit.route_family, route, `${familyEvent} uses the resolved pathname family`);
  assert.equal(familyHit.journey, "sst", `${familyEvent} keeps the finite SST journey`);
  assert.ok(layer.some((entry) => entry.event === "sst_cta_click" && entry.cta_id === ctaId), `${route} emits additive sst_cta_click`);
  assert.ok(layer.some((entry) => entry.event === "sst_whatsapp_click" && entry.cta_id === ctaId), `${route} emits additive sst_whatsapp_click`);
}

const hubFixture = pageFixture("seguranca-trabalho-apoio-tecnico", "sst-hub-whatsapp");
assert.equal(hubFixture.cta["data-journey"], "sst", "hub hero WhatsApp declares SST journey");
assert.equal(hubFixture.cta["data-tema"], "Execução documental remota de SST", "hub hero WhatsApp declares its topic");
assert.equal(hubFixture.cta["data-route-family"], "seguranca-trabalho-apoio-tecnico", "hub hero WhatsApp declares its route family");
const hubLayer = driveShippedBundle({
  pathname: "/seguranca-trabalho-apoio-tecnico/",
  bodyAttrs: hubFixture.body,
  ctaAttrs: hubFixture.cta,
});
const hubClick = hubLayer.find((entry) => entry.event === "sst_cta_click" && entry.cta_id === "sst-hub-whatsapp");
assert.ok(hubClick, "shipped script emits sst_cta_click for the hub hero WhatsApp");
assert.equal(hubClick.route_family, "hub");
assert.equal(hubClick.journey, "sst");
assert.equal(hubClick.tema, "Execução documental remota de SST");

const directSst = leadCore.validateAndNormalize({
  nome: "QA SST",
  email: "qa-sst@example.test",
  consentimento: "on",
  jornada: "sst",
  estagio: "segurança do trabalho",
  tema: "elaboracao-pgr",
  route_family: "elaboracao-pgr",
});
assert.equal(directSst.ok, true, "explicit SST lead is accepted");
assert.equal(directSst.lead.jornada, "sst", "explicit SST journey is preserved");
assert.equal(leadCore.normalizeJourney("", "segurança do trabalho"), "sst", "finite SST stage recovers journey");
assert.equal(leadCore.normalizeJourney("", "ainda não sei qual serviço"), "outro", "generic unknown remains outro");

console.log("sst_analytics_20260926: OK");
