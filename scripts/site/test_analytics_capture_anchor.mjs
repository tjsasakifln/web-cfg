/**
 * JOR-02 (2026-09-19): a link from an article or case to ANOTHER route whose
 * fragment is a capture anchor (/{pilar}/#captura-pilar, #pedido-*, #triagem-*,
 * #contato-*) is a contact click: cta_click destination_type=form, the same
 * intent stage the old '/?tema=...#contato' link produced. The same href
 * without the fragment stays content_to_service (engagement).
 *
 * Drives the shipped script.js in a vm sandbox (same harness shape as
 * seo/scripts/test_analytics_pii.mjs) and the server-side classifier in
 * netlify/functions/lib/source-to-service.cjs, so the proof does not depend on
 * a rebuilt _site or a browser.
 *
 *   node scripts/site/test_analytics_capture_anchor.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const sourceToService = require(path.join(root, "netlify/functions/lib/source-to-service.cjs"));
const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const scriptCode = fs.readFileSync(path.join(root, "script.js"), "utf8");

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail).slice(0, 700)}`}`);
}

function parseOpenTag(tag) {
  const attrs = {};
  for (const m of String(tag).matchAll(/([a-zA-Z0-9_:-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

/** First <a …> whose parsed attributes satisfy `pred`, from real HTML on disk. */
function findAnchor(rel, pred) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    const attrs = parseOpenTag(m[0]);
    if (pred(attrs)) return attrs;
  }
  return null;
}

function bodyAttrs(rel) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  const m = html.match(/<body\b[^>]*>/);
  return m ? parseOpenTag(m[0]) : {};
}

function makeEl(attrMap, text) {
  const clickFns = [];
  const attrs = { ...attrMap };
  return {
    attrs,
    textContent: text || "CTA",
    classList: { contains: () => false },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    closest() { return null; },
    matches() { return false; },
    addEventListener(type, fn) { if (type === "click") clickFns.push(fn); },
    click() {
      const evt = { preventDefault() {} };
      for (const fn of clickFns) fn(evt);
    },
  };
}

function driveScript({ pathname, body, hrefEls }) {
  const dataLayer = [];
  const bodyEl = {
    classList: { add() {}, remove() {} },
    getAttribute(name) { return (body && body[name]) || null; },
    dataset: {},
  };
  const document = {
    readyState: "complete",
    body: bodyEl,
    documentElement: { scrollHeight: 2000, classList: { replace() {} } },
    head: { appendChild() {} },
    referrer: "",
    querySelector: () => null,
    querySelectorAll(sel) {
      return String(sel || "") === "a[href]" ? hrefEls || [] : [];
    },
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => ({ setAttribute() {}, querySelector: () => null }),
  };
  const storage = new Map();
  const windowObj = {
    dataLayer,
    matchMedia: () => ({ matches: false }),
    location: { pathname, search: "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    innerWidth: 1200,
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    CONFENGE_DEBUG_ANALYTICS: false,
    fetch: async () => ({ ok: true, status: 202 }),
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
  };
  windowObj.window = windowObj;
  const sandbox = {
    window: windowObj, document, console, URLSearchParams, URL,
    setTimeout: windowObj.setTimeout, clearTimeout: windowObj.clearTimeout,
    fetch: windowObj.fetch, navigator: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  if (typeof sandbox.window.confengeTrack !== "function") throw new Error("confengeTrack_missing");
  return dataLayer;
}

const ARTICLE_HTML = "conteudos/glosa-de-medicao-obra-publica/index.html";
const ARTICLE_PATH = "/conteudos/glosa-de-medicao-obra-publica/";
const CASE_HTML = "casos/medicao-glosa-demonstrativo/index.html";
const CASE_PATH = "/casos/medicao-glosa-demonstrativo/";
const PILLAR = "/medicoes-glosas-obras-publicas/";
const eventsOf = (layer) => layer.map((e) => e.event);

// (1) Real article CTA "Continuar pelo formulário" -> exactly one cta_click destination_type=form,
//     destination_path = the pillar route, alias service_cta_click; no content_to_service.
{
  const attrs = findAnchor(ARTICLE_HTML, (a) => a.href === `${PILLAR}#captura-pilar`);
  check("article_fixture_present", !!attrs && attrs["data-tema"] && !("data-event-name" in (attrs || {})), attrs);
  const el = makeEl(attrs || { href: `${PILLAR}#captura-pilar` }, "Continuar pelo formulário");
  const layer = driveScript({ pathname: ARTICLE_PATH, body: bodyAttrs(ARTICLE_HTML), hrefEls: [el] });
  el.click();
  const clicks = layer.filter((e) => e.event === "cta_click");
  const transitions = layer.filter((e) => e.event === "content_to_service");
  check("article_capture_anchor_is_cta_click_form", clicks.length === 1 && transitions.length === 0
    && clicks[0].destination_type === "form" && clicks[0].destination_path === PILLAR
    && clicks[0].alias_from === "service_cta_click" && clicks[0].page_path === ARTICLE_PATH
    && layer.length === 1, { events: eventsOf(layer), click: clicks[0] });
  // The click keeps the source-asset attribution content_to_service used to carry, so the
  // stage-cta count can still be segmented by article.
  check("article_capture_anchor_keeps_source_attribution", clicks.length === 1
    && clicks[0].source_path === ARTICLE_PATH
    && clicks[0].source_asset_id === "glosa-de-medicao-obra-publica"
    && clicks[0].source_asset_family === "editorial"
    && clicks[0].asset_id === "glosa-de-medicao-obra-publica"
    && clicks[0].destination_service_id === "medicoes-glosas-obras-publicas", clicks[0]);
  const blob = JSON.stringify(layer);
  check("article_capture_anchor_no_pii", !blob.includes("@") && !/\d{8,}/.test(blob), blob.slice(0, 300));
}

// (2) Contraproof: the same pillar href WITHOUT the fragment stays content_to_service
//     with the known destination_service_id.
{
  const el = makeEl({ href: PILLAR }, "Ver o serviço");
  const layer = driveScript({ pathname: ARTICLE_PATH, body: bodyAttrs(ARTICLE_HTML), hrefEls: [el] });
  el.click();
  const transitions = layer.filter((e) => e.event === "content_to_service");
  const clicks = layer.filter((e) => e.event === "cta_click");
  check("article_plain_pillar_link_is_content_to_service", transitions.length === 1 && clicks.length === 0
    && transitions[0].destination_service_id === "medicoes-glosas-obras-publicas"
    && transitions[0].destination_path === PILLAR && transitions[0].destination_type === "service",
    { events: eventsOf(layer), transition: transitions[0] });
}

// (3) Case CTA /casos/medicao-glosa-demonstrativo/ -> same contact semantics.
{
  const attrs = findAnchor(CASE_HTML, (a) => a.href === `${PILLAR}#captura-pilar`);
  check("case_fixture_present", !!attrs, attrs);
  const el = makeEl(attrs || { href: `${PILLAR}#captura-pilar` }, "Enviar minha medição glosada");
  const layer = driveScript({ pathname: CASE_PATH, body: bodyAttrs(CASE_HTML), hrefEls: [el] });
  el.click();
  const clicks = layer.filter((e) => e.event === "cta_click");
  check("case_capture_anchor_is_cta_click_form", clicks.length === 1 && layer.length === 1
    && clicks[0].destination_type === "form" && clicks[0].destination_path === PILLAR
    && clicks[0].source_asset_family === "case" && clicks[0].source_asset_id === "medicao-glosa-demonstrativo"
    && clicks[0].destination_service_id === "medicoes-glosas-obras-publicas",
    { events: eventsOf(layer), click: clicks[0] });
}

// (4) The other capture-anchor spellings behave the same; a prose fragment does not.
{
  const cases = [
    ["/quantitativos-orcamento-obras/#triagem-quantitativos", "cta_click"],
    ["/compatibilizacao-projetos-engenharia/#pedido-compatibilizacao", "cta_click"],
    ["/revisao-tecnica-projetos-engenharia/#contato-revisao", "cta_click"],
    ["/aditivos-obras-publicas/#metodo", "content_to_service"],
  ];
  for (const [href, expected] of cases) {
    const el = makeEl({ href }, "CTA");
    const layer = driveScript({ pathname: ARTICLE_PATH, body: bodyAttrs(ARTICLE_HTML), hrefEls: [el] });
    el.click();
    const ok = layer.length === 1 && layer[0].event === expected
      && (expected !== "cta_click" || layer[0].destination_type === "form");
    check(`capture_pattern ${href} -> ${expected}`, ok, { events: eventsOf(layer), first: layer[0] });
  }
}

// (5) Server-side classifier agrees (source-to-service.cjs).
{
  const contact = sourceToService.classifyTransition({ href: `${PILLAR}#captura-pilar`, origin_path: ARTICLE_PATH });
  check("server_capture_anchor_is_contact", contact.kind === "contact" && contact.event === "cta_click"
    && contact.destination_path === PILLAR, contact);
  const plain = sourceToService.classifyTransition({ href: PILLAR, origin_path: ARTICLE_PATH });
  check("server_plain_pillar_is_transition", plain.kind === "transition" && plain.event === "content_to_service"
    && plain.destination_service_id === "medicoes-glosas-obras-publicas", plain);
  const prose = sourceToService.classifyTransition({ href: `${PILLAR}#metodo`, origin_path: ARTICLE_PATH });
  check("server_prose_fragment_stays_transition", prose.kind === "transition", prose);
  const legacy = sourceToService.classifyTransition({ href: "/?tema=glosa#contato", origin_path: ARTICLE_PATH });
  check("server_legacy_home_contact_still_contact", legacy.kind === "contact", legacy);
  const external = sourceToService.classifyTransition({ href: "https://example.com/#captura-pilar", origin_path: ARTICLE_PATH });
  check("server_external_capture_hash_is_external", external.kind === "external", external);
  check("server_isCaptureHref_exported", sourceToService.isCaptureHref("/x/#pedido-compatibilizacao")
    && !sourceToService.isCaptureHref("/x/#metodo") && !sourceToService.isCaptureHref("/x/"), null);
  // The cta_click with destination_path is admitted by the event contract with the path canonical.
  const admitted = contract.admitEvent({
    event: "cta_click",
    props: { destination_type: "form", destination_path: `${PILLAR}#captura-pilar`, cta_position: "form", event_id: "e-jor02-1" },
    path: ARTICLE_PATH,
    sid: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  check("server_admits_cta_click_form_with_destination_path", admitted.ok
    && admitted.event.props.destination_path === PILLAR && admitted.event.props.destination_type === "form", admitted);
}

console.log(`CAPTURE_ANCHOR_SEMANTICS ${JSON.stringify({ ok: failed === 0, failed })}`);
if (failed) process.exit(1);
