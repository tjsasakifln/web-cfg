#!/usr/bin/env node
/* Browser smoke for the direct-convergence visitor surfaces. Loopback mocks only.
 * Covers issue #616 (A1..A17, B2/B4/B5) on BOTH intake routes: /triagem-tecnica/
 * and /quantitativos-orcamento-obras/. Every interception is synthetic and bound
 * to 127.0.0.1; no real network, no outbound, no SMTP, no Turnstile relaxation. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const root = resolve(new URL("../..", import.meta.url).pathname);
const site = resolve(process.env.SITE_ROOT || join(root, "_site"));
const reportDir = resolve(process.env.CONVERGENCE_REPORT_DIR || join(root, "build/reports/convergence"));
const chrome = process.env.CHROME_PATH || process.env.CHROME || "";
const report = { site, chrome: chrome || null, browser_matrix_ran: false, evidence: {}, checks: [], screenshots: [] };
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
/* Read lazily: the pure-node source preflight must still run when neither the
 * built site root nor the browser toolchain exists. */
let axeSource = null;
function axeBundle() {
  if (axeSource === null) axeSource = readFileSync(resolve(root, "node_modules/axe-core/axe.min.js"), "utf8");
  return axeSource;
}
let cachedHeaders = null;
function servedHeaders() {
  if (cachedHeaders) return cachedHeaders;
  cachedHeaders = Object.fromEntries(readFileSync(join(site, "_headers"), "utf8").split(/\r?\n\s*\r?\n/, 1)[0].split(/\r?\n/).slice(1).map(line => line.match(/^\s{2}([^:]+):\s*(.*)$/)).filter(Boolean).filter(([, key]) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)).map(([, key, value]) => [key.toLowerCase(), value]));
  if (cachedHeaders["content-security-policy"]) cachedHeaders["content-security-policy"] = cachedHeaders["content-security-policy"].replace(/;?\s*upgrade-insecure-requests\b/, "");
  return cachedHeaders;
}

/* Contract constants mirrored from assets/js/adaptive-intake.js. */
const CONFIG_PATHNAME = "/.netlify/functions/adaptive-intake-config";
const LEAD_PATHNAME = "/.netlify/functions/lead";
const COLLECTOR_PATHNAMES = new Set(["/collect", "/.netlify/functions/collect", "/api/web/collect"]);
/* Analytics leaves the page through navigator.sendBeacon(url, Blob). Chrome
 * reports a blob-backed body with no readable bytes, so request.postData() is
 * empty at the interceptor: the payload is read from the loopback server, and
 * this header attributes each beacon to the page state that produced it. */
const COLLECTOR_SINK_HEADER = "x-canary-collector-sink";
const CONFIG_TIMEOUT_MS = 5000;
const SUBMIT_TIMEOUT_MS = 15000;
const SINGLE_ATTEMPT_WINDOW_MS = 30000;
const RETRY_STORAGE_KEY = "confenge_triagem_retry_v3";
const CHANNEL_EVENTS = new Set(["whatsapp_click", "email_click", "outbound_click"]);
const SERVED_STATUS_RE = /Verificando a disponibilidade/i;
const LOADING_OPTION_RE = /Carregando op[çc][õo]es/i;
const NOT_SENT_RE = /n[ãa]o foi enviado/i;
const NOT_REGISTERED_RE = /n[ãa]o registrad/i;
const UNCONFIRMED_RE = /n[ãa]o foi poss[íi]vel confirmar/i;
const BLAMES_VISITOR_RE = /conex|sua rede/i;

/* Mock option set shared by both routes. Labels deliberately carry neither
 * route's context signature, so A11 measures the route's own wording only. */
const MOCK_OPTIONS = [
  { value: "licitacao_obra_ou_contrato_publico", label: "Licitação, obra ou contrato público", location_required: false },
  { value: "obra_edificacao_ou_documentacao", label: "Obra, edificação ou documentação", location_required: false },
];
const READY_CONFIG = { ok: true, intake_version: "CONFENGE_WEB_INTAKE/2.1.0-mv03.20260905", intake_pin_hash: "a".repeat(64), options: MOCK_OPTIONS };

const ROUTES = [
  {
    key: "triage",
    path: "/triagem-tecnica/",
    file: "triagem-tecnica/index.html",
    /* /triagem-tecnica/ sends no query: the 422 intake_context_unknown path
     * does not exist here, and A9 records that instead of running it. */
    expectedConfigSearch: "",
    contextUnknownApplies: false,
    needValue: "licitacao_obra_ou_contrato_publico",
    /* No data-default-need and no hash: the placeholder stays selected in READY,
     * so updateFallbackChannels() must restore the static hrefs byte for byte. */
    readyRewritesChannels: false,
    ownSignature: /demanda t[ée]cnica/i,
    foreignSignature: /quantitativos/i,
    anchors: ["projetos", "obra-imovel", "pericia-avaliacao", "sst", "planejamento-publico"],
  },
  {
    key: "quantities",
    path: "/quantitativos-orcamento-obras/",
    file: "quantitativos-orcamento-obras/index.html",
    expectedConfigSearch: "?intake_context=quantities_budget",
    contextUnknownApplies: true,
    needValue: "obra_edificacao_ou_documentacao",
    /* data-default-need pre-selects an option in READY, so the channel hrefs are
     * rewritten — but only with THIS route's data-channel-intent/subject. */
    readyRewritesChannels: true,
    ownSignature: /quantitativos ou or[çc]amento/i,
    foreignSignature: /triagem t[ée]cnica/i,
    anchors: ["triagem-quantitativos"],
  },
];

function check(name, pass, detail = "") { report.checks.push({ name, pass, detail }); assert.ok(pass, `${name}: ${detail}`); }
/* Non-throwing sibling: the source preflight must print every row even when
 * several fail, and the A9 not-applicable row is evidence, not an assertion. */
function record(name, pass, detail = "") { report.checks.push({ name, pass, detail }); return pass; }
function wait(ms) { return new Promise(done => setTimeout(done, ms)); }
function writeReport() {
  mkdirSync(reportDir, { recursive: true });
  report.ok = report.checks.every(item => item.pass) && report.browser_matrix_ran === true;
  writeFileSync(join(reportDir, "report.json"), JSON.stringify(report, null, 2));
}
function chromeAvailable() { return Boolean(chrome && existsSync(chrome)); }
function chromePath() {
  if (chromeAvailable()) return chrome;
  throw new Error("Chrome unavailable: set CHROME_PATH to the downloaded browser binary");
}
/* Registry of live page states, keyed by the sink id carried on each beacon.
 * Untagged collector posts (pages opened without interception) are answered but
 * never recorded, so one page's telemetry can never be read as another's. */
const collectorSinks = new Map();
let collectorSinkSeq = 0;
function serve() {
  return createServer((req, res) => {
    const target = new URL(req.url, "http://loopback").pathname;
    if (COLLECTOR_PATHNAMES.has(target)) {
      const sink = collectorSinks.get(String(req.headers[COLLECTOR_SINK_HEADER] || ""));
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        if (sink) sink.collectorBodies.push(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(204); res.end();
      });
      return;
    }
    const relative = target === "/" ? "index.html" : target.replace(/^\/+/, "");
    let file = normalize(join(site, relative));
    if (file.startsWith(site) && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(site) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { ...servedHeaders(), "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
}

/* ---------------------------------------------------------------------------
 * Source-of-truth helpers. The served copy under SITE_ROOT wins when it exists;
 * otherwise the repository file is read, so the preflight still runs before any
 * build step and without a browser.
 * ------------------------------------------------------------------------- */
function sourceHtmlFor(route) {
  for (const file of [join(site, route.file), join(root, route.file)]) {
    if (existsSync(file) && statSync(file).isFile()) return { file, html: readFileSync(file, "utf8") };
  }
  return { file: join(root, route.file), html: "" };
}
function formBlockSpan(html) {
  const marker = html.indexOf("data-intake-form-block");
  if (marker === -1) return null;
  const open = html.lastIndexOf("<", marker);
  const tagEnd = html.indexOf(">", marker);
  const closing = html.indexOf("</form>", marker);
  return { open, tag: html.slice(open, tagEnd + 1), end: closing === -1 ? html.length : closing + "</form>".length };
}
function sourceChannelHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*\bdata-fallback-channel\b[^>]*>/gi)]
    .map(match => (match[0].match(/\shref="([^"]*)"/i) || ["", ""])[1]);
}
function sourceNeedOptionTexts(html) {
  const select = html.match(/<select[^>]*\bname="need_code"[^>]*>([\s\S]*?)<\/select>/i);
  if (!select) return [];
  /* Replace with a space, never with "": an empty replacement can reconstitute
   * the sequence it removes (`<scr<x>ipt` -> `<script`). Both routes' options are
   * plain text, so this is a no-op on the real markup. */
  return [...select[1].matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi)].map(item => item[1].replace(/<[^>]*>/g, " ").trim());
}
function sourceConfigEndpoint(html) {
  return (html.match(/data-config-endpoint="([^"]*)"/i) || ["", ""])[1];
}

/* ---------------------------------------------------------------------------
 * Pure-node preflight (no browser). These are the structural invariants #616
 * delivers in the served HTML; they must still be reported when Chrome is
 * missing, because the served HTML is what a visitor gets with a blocked bundle.
 * ------------------------------------------------------------------------- */
function runSourcePreflight() {
  for (const route of ROUTES) {
    const { file, html } = sourceHtmlFor(route);
    route.source = { file, html };
    const key = route.key;
    if (!record(`source_${key}_html_readable`, html.length > 0, file)) continue;
    const block = formBlockSpan(html);
    const alternative = html.indexOf("data-intake-alternative");
    const status = html.indexOf("data-intake-status");
    const limit = html.indexOf("data-intake-limit");
    record(`source_${key}_form_block_present`, Boolean(block), file);
    if (!block) continue;
    record(`source_${key}_alternative_before_form_block`, alternative > -1 && alternative < block.open, JSON.stringify({ alternative, formBlock: block.open }));
    record(`source_${key}_status_outside_form_block`, status > -1 && (status < block.open || status > block.end), JSON.stringify({ status, block: [block.open, block.end] }));
    record(`source_${key}_limit_outside_form_block`, limit > -1 && (limit < block.open || limit > block.end), JSON.stringify({ limit, block: [block.open, block.end] }));
    record(`source_${key}_limit_after_action`, limit > -1 && alternative > -1 && limit > alternative, JSON.stringify({ alternative, limit }));
    record(`source_${key}_form_block_hidden_and_inert`, /\shidden\b/i.test(block.tag) && /\sinert\b/i.test(block.tag), block.tag.slice(0, 220));
    const strayAnchors = route.anchors.filter(id => {
      const at = html.indexOf(`id="${id}"`);
      return at === -1 || (at > block.open && at < block.end);
    });
    record(`source_${key}_anchors_outside_form_block`, strayAnchors.length === 0, JSON.stringify({ anchors: route.anchors, stray: strayAnchors }));
    record(`source_${key}_no_loading_placeholder`, !LOADING_OPTION_RE.test(html), JSON.stringify(sourceNeedOptionTexts(html)));
    const endpoint = sourceConfigEndpoint(html);
    record(`source_${key}_config_endpoint_contract`, endpoint === `${CONFIG_PATHNAME}${route.expectedConfigSearch}`, JSON.stringify({ endpoint, expected: `${CONFIG_PATHNAME}${route.expectedConfigSearch}` }));
    record(`source_${key}_three_static_channels`, sourceChannelHrefs(html).filter(Boolean).length === 3, JSON.stringify(sourceChannelHrefs(html)));
  }
}

/* ---------------------------------------------------------------------------
 * Synthetic configuration and lead responders. One named mode per acceptance
 * row, so a generic catch-all cannot make distinct causes look identical.
 * ------------------------------------------------------------------------- */
const CONFIG_MODES = {
  down: () => ({ status: 503, contentType: "application/json", body: '{"ok":false,"error":"intake_unavailable"}' }),
  ready: () => ({ status: 200, contentType: "application/json", body: JSON.stringify(READY_CONFIG) }),
  empty_body: () => ({ status: 200, contentType: "application/json", body: "" }),
  invalid_json: () => ({ status: 200, contentType: "application/json", body: '{"ok":true,' }),
  ok_false: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ...READY_CONFIG, ok: false }) }),
  missing_version: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ...READY_CONFIG, intake_version: undefined }) }),
  missing_pin: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ...READY_CONFIG, intake_pin_hash: undefined }) }),
  empty_options: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ...READY_CONFIG, options: [] }) }),
  bad_options: () => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ...READY_CONFIG, options: [{ label: "Sem valor", location_required: false }] }) }),
  context_unknown: () => ({ status: 422, contentType: "application/json", body: '{"ok":false,"error":"intake_context_unknown"}' }),
  method_not_allowed: () => ({ status: 405, contentType: "application/json", body: '{"ok":false,"error":"method_not_allowed"}' }),
};
/* A8/A9/A10 rows: each distinct cause must reach a distinct internal error_code.
 * Expectations traced from configErrorCode()/configure() in adaptive-intake.js. */
const INVALID_CONFIG_CASES = [
  { mode: "empty_body", code: "invalid_body" },
  { mode: "invalid_json", code: "invalid_body" },
  { mode: "ok_false", code: "invalid_config" },
  { mode: "missing_version", code: "invalid_config" },
  { mode: "missing_pin", code: "invalid_config" },
  { mode: "empty_options", code: "empty_options" },
  { mode: "bad_options", code: "invalid_options" },
];

function leadResponse(state) {
  const attempt = state.leadBodies.length;
  if (state.leadMode === "receipt") return { status: 201, contentType: "application/json", body: '{"ok":true,"lead_id":"lead-canary-receipt"}' };
  if (state.leadMode === "unavailable") return { status: 503, contentType: "application/json", body: '{"ok":false,"error":"intake_unavailable"}' };
  if (state.leadMode === "retry") return attempt === 1
    ? { status: 503, contentType: "application/json", body: '{"ok":false}' }
    : { status: 201, contentType: "application/json", body: '{"ok":true,"lead_id":"lead-canary-receipt"}' };
  /* lost_then_receipt: the simulator persisted the lead and the reply was lost
   * on the way back (gateway failure, unreadable body). The retry returns the
   * SAME lead id, so one logical receipt exists and no duplicate is created. */
  if (state.leadMode === "lost_then_receipt") return attempt === 1
    ? { status: 502, contentType: "text/html", body: "<html><body>bad gateway</body></html>" }
    : { status: 201, contentType: "application/json", body: '{"ok":true,"lead_id":"lead-canary-idempotent"}' };
  return { status: 201, contentType: "application/json", body: '{"ok":true,"lead_id":"lead-canary-receipt"}' };
}

function newState(configMode = "down", leadMode = "receipt") {
  const state = { configMode, leadMode, sinkId: `sink-${++collectorSinkSeq}`, configRequests: [], configFailures: [], heldConfig: [], heldLead: [], leadBodies: [], leadKeys: [], collectorBodies: [], blockBundle: false };
  collectorSinks.set(state.sinkId, state);
  return state;
}
function attachIntercept(page, state) {
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") return request.continue().catch(() => {});
    if (state.blockBundle && (url.pathname === "/script.js" || url.pathname === "/assets/js/adaptive-intake.js")) {
      return request.abort("failed").catch(() => {});
    }
    if (url.pathname === CONFIG_PATHNAME) {
      state.configRequests.push(url.search);
      if (state.configMode === "hang") { state.heldConfig.push(request); return; }
      return request.respond((CONFIG_MODES[state.configMode] || CONFIG_MODES.down)()).catch(() => {});
    }
    if (url.pathname === LEAD_PATHNAME) {
      state.leadBodies.push(request.postData() || "");
      state.leadKeys.push(request.headers()["idempotency-key"] || "");
      if (state.leadMode === "hang") { state.heldLead.push(request); return; }
      return request.respond(leadResponse(state)).catch(() => {});
    }
    if (COLLECTOR_PATHNAMES.has(url.pathname)) {
      /* Do not read the body here: a sendBeacon Blob has no postData() bytes and
       * would be recorded as an empty string. Tag it and let the loopback server
       * read the real payload off the wire; it answers 204 like this branch did. */
      return request.continue({ headers: { ...request.headers(), [COLLECTOR_SINK_HEADER]: state.sinkId } }).catch(() => {});
    }
    return request.continue().catch(() => {});
  });
  page.on("requestfailed", request => {
    if (!request.url().includes(CONFIG_PATHNAME)) return;
    state.configFailures.push({ url: request.url(), errorText: (request.failure() || {}).errorText || "" });
  });
}

/* ---------------------------------------------------------------------------
 * In-page readers. Declared at module scope so they can be handed to
 * page.evaluate() without closing over node-side state.
 * ------------------------------------------------------------------------- */
function readPresentation() {
  const block = document.querySelector("[data-intake-form-block]");
  const alternative = document.querySelector("[data-intake-alternative]");
  const status = document.querySelector("[data-intake-status]");
  const limit = document.querySelector("[data-intake-limit]");
  const submit = document.querySelector('[type="submit"]');
  const need = document.querySelector('[name="need_code"]');
  const channels = [...document.querySelectorAll("[data-fallback-channel]")];
  const visible = el => Boolean(el && !el.hidden && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  /* Read the live focus BEFORE probing, because the probe moves it. */
  const activeInsideBlock = Boolean(block && document.activeElement && block.contains(document.activeElement));
  const focusables = block ? [...block.querySelectorAll('select, input, button, textarea, [tabindex]:not([tabindex="-1"])')] : [];
  const reachable = [];
  focusables.forEach(el => {
    try { el.focus(); if (document.activeElement === el) reachable.push(el.name || el.id || el.tagName.toLowerCase()); } catch (_) { /* not focusable */ }
  });
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const events = (window.dataLayer || []).filter(Boolean);
  return {
    hasBlock: Boolean(block),
    blockHidden: Boolean(block && block.hasAttribute("hidden")),
    blockInert: Boolean(block && block.hasAttribute("inert")),
    blockAriaHidden: Boolean(block && block.getAttribute("aria-hidden") === "true"),
    blockDisplayNone: Boolean(block && getComputedStyle(block).display === "none"),
    alternativePrecedesBlock: Boolean(block && alternative && (alternative.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
    limitAfterAlternative: Boolean(limit && alternative && (alternative.compareDocumentPosition(limit) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
    statusOutsideBlock: Boolean(status && block && !block.contains(status)),
    limitOutsideBlock: Boolean(limit && block && !block.contains(limit)),
    statusVisible: visible(status),
    statusText: status ? status.textContent.trim() : "",
    limitVisible: visible(limit),
    limitText: limit ? limit.textContent.trim() : "",
    focusableCount: focusables.length,
    reachableFocus: reachable,
    activeInsideBlock,
    submitDisabled: submit ? submit.disabled : null,
    needValue: need ? need.value : null,
    nameValue: (document.querySelector("#nome") || {}).value || "",
    optionTexts: need ? [...need.options].map(option => option.textContent.trim()) : [],
    anyLoadingOption: [...document.querySelectorAll("option")].some(option => /Carregando op[çc][õo]es/i.test(option.textContent)),
    channelHrefs: channels.map(link => link.getAttribute("href") || ""),
    channelKinds: channels.map(link => link.getAttribute("data-fallback-channel") || ""),
    channelsVisible: channels.length > 0 && channels.every(visible),
    eventNames: events.map(event => event.event).filter(Boolean),
    backendErrorCodes: events.filter(event => event.event === "lead_form_backend_error").map(event => event.error_code || ""),
    receiptVisible: Boolean(document.querySelector("[data-intake-receipt]") && !document.querySelector("[data-intake-receipt]").hidden),
    protocol: (document.querySelector("[data-intake-protocol]") || {}).textContent || "",
    retryKey: (() => { try { return sessionStorage.getItem("confenge_triagem_retry_v3"); } catch (_) { return null; } })(),
  };
}
function readAnchors(ids) {
  const block = document.querySelector("[data-intake-form-block]");
  return ids.map(id => {
    const target = document.getElementById(id);
    if (!target) return { id, exists: false };
    let node = target;
    let box = null;
    while (node && node.nodeType === 1) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) { box = node; break; }
      node = node.parentElement;
    }
    return {
      id,
      exists: true,
      insideFormBlock: Boolean(block && block.contains(target)),
      visibleContainer: Boolean(box),
      containerText: box ? (box.innerText || "").trim().slice(0, 80) : "",
    };
  });
}
function flattenAx(node, out = []) {
  if (!node) return out;
  out.push({ role: node.role || "", name: node.name || "", disabled: node.disabled === true });
  (node.children || []).forEach(child => flattenAx(child, out));
  return out;
}
/* Fail closed: a body that cannot be read or decoded yields a marker that is not
 * in CHANNEL_EVENTS, so an unclassifiable payload fails the assertion. */
function collectorEventNames(bodies) {
  return bodies.flatMap(body => {
    if (!body) return ["<empty-body>"];
    try { return (JSON.parse(body).events || []).map(item => item && item.event).filter(Boolean); } catch (_) { return ["<unparseable>"]; }
  });
}

async function axeClean(page, name) {
  await page.evaluate(axeBundle());
  const violations = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }).then(r => r.violations.map(v => ({ id: v.id, nodes: v.nodes.length }))));
  check(`axe_${name}`, violations.length === 0, JSON.stringify(violations));
}
async function shot(page, name) { const file = join(reportDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); }
async function chooseRequired(page, needValue = "licitacao_obra_ou_contrato_publico") {
  await page.select('[name="need_code"]', needValue);
  await page.click("[data-intake-next]");
  await page.$eval("#nome", e => { e.value = "Canario Sintetico"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.select('[name="preferred_channel"]', "email");
  await page.$eval("#email", e => { e.value = "canario@example.invalid"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$$eval('input[type="checkbox"][required]', els => els.forEach(e => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); }));
}

/* ---------------------------------------------------------------------------
 * A15/A17 — live smoke. The old single line accepted unavailability as success
 * on one route; this asserts the state the served configuration actually
 * indicates, per route, and records the A17 evidence shape before asserting.
 * ------------------------------------------------------------------------- */
async function runLive() {
  const live = process.env.LIVE_BASE_URL.replace(/\/$/, "");
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
  report.browser_matrix_ran = true;
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${live}/ferramentas/prontidao-tecnica-obra-privada/`, { waitUntil: "networkidle0" });
    await page.click("button.tool-run"); await page.waitForSelector("#resultado-corpo .pptr-domain");
    check("live_tool_value", await page.$$eval("#resultado-corpo .pptr-domain", rows => rows.length === 7), "seven domains not rendered");
    await page.goto(`${live}/confianca/`, { waitUntil: "networkidle0" });
    check("live_trust_schema_parity", await page.evaluate(() => {
      const graph = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { const parsed = JSON.parse(s.textContent); return parsed["@graph"] || [parsed]; } catch { return []; } });
      const org = graph.find(item => item["@type"] === "Organization"); const person = graph.find(item => item["@type"] === "Person");
      return Boolean(org && person && [org.legalName, org.taxID, org.address?.streetAddress, person.jobTitle].every(value => document.body.innerText.includes(value)));
    }), "Organization/Person visible-schema parity missing");

    for (const route of ROUTES) {
      const routePage = await browser.newPage();
      await routePage.setViewport({ width: 390, height: 844 });
      const documentResponse = await routePage.goto(`${live}${route.path}`, { waitUntil: "networkidle0" });
      await wait(CONFIG_TIMEOUT_MS + 800);
      /* Build identity and configuration read in the same moment as the page. */
      const configUrl = `${live}${CONFIG_PATHNAME}${route.expectedConfigSearch}`;
      const configResponse = await fetch(configUrl, { headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
      const configBody = (await configResponse.text()).slice(0, 600);
      let buildInfo = "";
      try {
        const buildResponse = await fetch(`${live}/.well-known/build-info.json`, { headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
        buildInfo = `${buildResponse.status} ${(await buildResponse.text()).slice(0, 400)}`;
      } catch (error) { buildInfo = `unreadable: ${error.message}`; }
      let configOk = false;
      try { configOk = configResponse.ok && JSON.parse(configBody).ok === true; } catch (_) { configOk = false; }
      /* A17 evidence is persisted BEFORE the assertion that consumes it. */
      report.evidence[route.key] = {
        route: route.path, read_at: new Date().toISOString(), build_info: buildInfo,
        document_status: documentResponse ? documentResponse.status() : null,
        document_etag: documentResponse ? (documentResponse.headers().etag || null) : null,
        config_url: configUrl, config_status: configResponse.status, config_body: configBody, config_ok: configOk,
      };
      check(`live_${route.key}_evidence_recorded`, Boolean(buildInfo) && Number.isFinite(configResponse.status), JSON.stringify(report.evidence[route.key]).slice(0, 400));
      const state = await routePage.evaluate(readPresentation);
      report.evidence[route.key].presentation = state;
      if (configOk) {
        check(`live_${route.key}_config_state`, state.submitDisabled === false && state.anyLoadingOption === false,
          `READY: submitDisabled=${state.submitDisabled} anyLoadingOption=${state.anyLoadingOption}`);
      } else {
        check(`live_${route.key}_config_state`, state.blockHidden && state.reachableFocus.length === 0 && state.alternativePrecedesBlock,
          `WITHHELD (config=${configResponse.status}): ${JSON.stringify({ blockHidden: state.blockHidden, reachableFocus: state.reachableFocus, alternativePrecedesBlock: state.alternativePrecedesBlock })}`);
      }
      await routePage.close();
    }
  } finally { await browser.close(); }
}

/* =========================================================================
 * 1. Source preflight — always runs, browser or not.
 * ======================================================================= */
runSourcePreflight();
for (const item of report.checks) console.log(item.pass ? "PASS" : "FAIL", item.name, item.detail);
if (!report.checks.every(item => item.pass)) {
  writeReport();
  console.error("CONVERGENCE_BROWSER_SOURCE_PREFLIGHT_FAILED: served HTML invariants broken; browser matrix did not run.");
  process.exit(1);
}
if (!chromeAvailable()) {
  writeReport();
  console.error(`CONVERGENCE_BROWSER_NO_BROWSER: source preflight passed (${report.checks.length} checks), but the browser matrix did NOT run. Set CHROME_PATH to a Chrome binary to execute A1..A17/B2/B4/B5.`);
  process.exit(1);
}

/* =========================================================================
 * 2. Live smoke (A15/A17) when LIVE_BASE_URL is set.
 * ======================================================================= */
if (process.env.LIVE_BASE_URL) {
  try { await runLive(); } finally { writeReport(); }
  console.log("CONVERGENCE_BROWSER_OK", JSON.stringify(report)); process.exit(0);
}

/* =========================================================================
 * 3. Local matrix over loopback, both routes.
 * ======================================================================= */
if (!existsSync(site)) throw new Error(`site root missing: ${site}`);
mkdirSync(reportDir, { recursive: true });
const server = serve();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
report.browser_matrix_ran = true;

async function openRoute(route, state, options = {}) {
  const { waitUntil = "networkidle0", settle = 500, javaScript = true } = options;
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  if (!javaScript) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  attachIntercept(page, state);
  await page.goto(`${base}${route.path}`, { waitUntil });
  if (settle) await wait(settle);
  return page;
}

try {
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mobile.goto(`${base}/ferramentas/prontidao-tecnica-obra-privada/`, { waitUntil: "networkidle0" });
  await mobile.click("button.tool-run");
  await mobile.waitForSelector("#resultado-corpo .pptr-domain");
  const tool = await mobile.evaluate(() => ({ domains: document.querySelectorAll("#resultado-corpo .pptr-domain").length, cta: !document.querySelector("#cta-comercial").hidden, text: document.querySelector("#resultado-corpo").textContent, events: window.dataLayer || [] }));
  check("tool_full_result_before_contact", tool.domains === 7 && tool.cta, JSON.stringify({ domains: tool.domains, cta: tool.cta }));
  check("tool_unknown_neutral", /Desconhecido/.test(tool.text) && !/Lacuna/.test(tool.text), tool.text.slice(0, 200));
  check("tool_complete_real_bus", tool.events.some(event => event.event === "tool_complete"), "tool_complete absent from dataLayer");
  check("tool_analytics_no_answers", !/UNKNOWN|work_stage|gap_count|present_count|unknown_count|nucleus_id/i.test(JSON.stringify(tool.events)), "response field present in dataLayer");
  await axeClean(mobile, "private_tool_mobile"); await shot(mobile, "private-tool-390");
  await mobile.setViewport({ width: 1366, height: 900 }); await shot(mobile, "private-tool-1366");

  const trust = await browser.newPage();
  await trust.setViewport({ width: 1366, height: 900 });
  await trust.goto(`${base}/confianca/`, { waitUntil: "networkidle0" });
  const parity = await trust.evaluate(() => {
    const graph = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { const parsed = JSON.parse(s.textContent); return parsed["@graph"] || [parsed]; } catch { return []; } });
    const organization = graph.find(item => item["@type"] === "Organization");
    const person = graph.find(item => item["@type"] === "Person");
    const text = document.body.innerText;
    return { valid: Boolean(organization && person && [organization.legalName, organization.taxID, organization.address?.streetAddress, person.jobTitle].every(value => text.includes(value))) };
  });
  check("trust_visible_schema_parity", parity.valid, JSON.stringify(parity));
  await axeClean(trust, "trust_desktop"); await shot(trust, "trust-1366");
  await trust.setViewport({ width: 390, height: 844 }); await axeClean(trust, "trust_mobile"); await shot(trust, "trust-390");

  const wedge = await browser.newPage();
  await wedge.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await wedge.goto(`${base}/quantitativos-orcamento-obras/`, { waitUntil: "networkidle0" });
  const wedgeMobile = await wedge.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent || "",
    channels: document.querySelectorAll("[data-fallback-channel]").length,
    submitDisabled: document.querySelector('[type="submit"]')?.disabled,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("private_wedge_mobile_contract", /quantidades e premissas/i.test(wedgeMobile.h1)
    && wedgeMobile.channels === 3 && wedgeMobile.submitDisabled === true && wedgeMobile.overflow === false,
  JSON.stringify(wedgeMobile));
  await axeClean(wedge, "private_wedge_mobile"); await shot(wedge, "private-wedge-390");
  await wedge.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  await axeClean(wedge, "private_wedge_desktop"); await shot(wedge, "private-wedge-1366");

  /* ---- Phase A: unavailable presentation (A1, A2, A11-503, A13, A14) ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("down", "receipt");
    const page = await openRoute(route, state);
    const staticHrefs = sourceChannelHrefs(route.source.html);

    check(`${key}_config_query_contract`, state.configRequests.length >= 1 && state.configRequests[0] === route.expectedConfigSearch,
      JSON.stringify({ observed: state.configRequests, expected: route.expectedConfigSearch }));
    check(`${key}_config_503_blocks`, await page.$eval('[type="submit"]', e => e.disabled), "submit enabled on config failure");
    check(`${key}_config_503_keeps_channels`, await page.evaluate(() => Boolean(
      document.querySelector('a[href^="https://wa.me/"]')
      && document.querySelector('a[href^="mailto:"]')
      && document.querySelector('a[href^="tel:"]')
    )), "fallback channels missing");

    const down = await page.evaluate(readPresentation);
    check(`${key}_no_start_before_interaction`,
      down.eventNames.filter(name => name === "lead_form_start" || name === "lead_form_step").length === 0,
      JSON.stringify(down.eventNames));

    /* A1(a): nothing dead is announced. */
    const ax = flattenAx(await page.accessibility.snapshot());
    const stepText = ax.filter(node => /Etapa\s.*\sde\s2/i.test(node.name));
    const disabledNodes = ax.filter(node => node.disabled);
    const needCombobox = ax.filter(node => node.role === "combobox" && /^Situa[çc][ãa]o$/i.test(node.name));
    check(`${key}_a1_no_dead_control_announced`,
      stepText.length === 0 && disabledNodes.length === 0 && needCombobox.length === 0,
      JSON.stringify({ stepText, disabledNodes, needCombobox }));
    /* A1(b): nothing dead is reachable in sequential focus order. The probe
     * focuses each candidate and asks the document who actually took focus, so
     * an implementation that only set aria-hidden (or opacity/pointer-events)
     * is caught: those hide announcement, not tabbing. */
    check(`${key}_a1_no_focusable_in_form_block`,
      down.focusableCount > 0 && down.reachableFocus.length === 0,
      JSON.stringify({ candidates: down.focusableCount, reachable: down.reachableFocus }));
    check(`${key}_a1_form_block_hidden_and_inert`,
      down.blockHidden && down.blockInert && down.blockDisplayNone,
      JSON.stringify({ hidden: down.blockHidden, inert: down.blockInert, ariaHidden: down.blockAriaHidden, display_none: down.blockDisplayNone }));
    check(`${key}_a1_status_and_limit_outside_block`,
      down.statusOutsideBlock && down.limitOutsideBlock && down.statusVisible && down.statusText.length > 0 && down.limitVisible,
      JSON.stringify({ statusOutside: down.statusOutsideBlock, limitOutside: down.limitOutsideBlock, statusVisible: down.statusVisible, statusText: down.statusText.slice(0, 120), limitVisible: down.limitVisible }));

    /* A2: the contact alternative is the dominant action and the limit notice
     * sits below it, never above. */
    check(`${key}_a2_alternative_precedes_form_block`, down.alternativePrecedesBlock, JSON.stringify({ alternativePrecedesBlock: down.alternativePrecedesBlock }));
    check(`${key}_a2_limit_after_action`, down.limitAfterAlternative, JSON.stringify({ limitAfterAlternative: down.limitAfterAlternative }));
    const anchors = await page.evaluate(readAnchors, route.anchors);
    check(`${key}_a2_anchors_resolve`,
      anchors.length === route.anchors.length && anchors.every(item => item.exists && !item.insideFormBlock && item.visibleContainer && item.containerText.length > 0),
      JSON.stringify(anchors));

    /* A11 (unavailable state): the script must not have touched the hrefs. */
    check(`${key}_a11_channel_context_unavailable`,
      down.channelHrefs.length === 3 && JSON.stringify(down.channelHrefs) === JSON.stringify(staticHrefs),
      JSON.stringify({ rendered: down.channelHrefs, source: staticHrefs }));
    check(`${key}_a11_no_foreign_route_wording_unavailable`,
      down.channelHrefs.every(href => !route.foreignSignature.test(decodeURIComponent(href))),
      JSON.stringify(down.channelHrefs));

    /* A13: a channel click is intent, never a receipt. Checked on BOTH the
     * dataLayer and the intercepted collector bodies. The collector batches on
     * a 30 s timer, so each measurement flushes the queue with `pagehide`
     * before the click and again after it, and only the delta is read. */
    await page.evaluate(() => { document.addEventListener("click", event => event.preventDefault(), true); });
    for (let index = 0; index < down.channelHrefs.length; index += 1) {
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await wait(200);
      state.collectorBodies.length = 0;
      await page.evaluate(() => { (window.dataLayer || []).length = 0; });
      await page.evaluate(position => document.querySelectorAll("[data-fallback-channel]")[position].click(), index);
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await wait(300);
      const bus = await page.evaluate(() => (window.dataLayer || []).map(event => event && event.event).filter(Boolean));
      const collected = collectorEventNames(state.collectorBodies);
      const bodies = state.collectorBodies.map(body => String(body).slice(0, 160));
      const busOk = bus.length === 1 && CHANNEL_EVENTS.has(bus[0]);
      const collectorOk = collected.length === 1 && CHANNEL_EVENTS.has(collected[0]);
      check(`${key}_a13_channel_click_is_not_receipt_${down.channelKinds[index] || index}`,
        busOk && collectorOk,
        JSON.stringify({ dataLayer: bus, collector: collected, allowed: [...CHANNEL_EVENTS], bodies }));
    }
    await shot(page, `${key}-unavailable-390`);
    await axeClean(page, `${key}_unavailable_mobile`);
    await page.close();
  }

  /* ---- Phase B: READY presentation (A7, A11-200, config 200 enables) ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("ready", "receipt");
    const page = await openRoute(route, state);
    const staticHrefs = sourceChannelHrefs(route.source.html);
    const ready = await page.evaluate(readPresentation);
    check(`${key}_config_200_enables`, ready.submitDisabled === false, "submit remains disabled on config success");
    /* A7: the index-0 option is included — the old loop started at 1 and left
     * "Carregando opções…" alive in the READY state. */
    check(`${key}_a7_ready_placeholder_is_honest`,
      ready.anyLoadingOption === false && ready.optionTexts.length > 0 && !LOADING_OPTION_RE.test(ready.optionTexts[0] || ""),
      JSON.stringify(ready.optionTexts));
    if (route.readyRewritesChannels) {
      /* This route pre-selects data-default-need, so the hrefs are rewritten —
       * but only from this route's own data-channel-intent/subject. */
      const decoded = ready.channelHrefs.map(href => decodeURIComponent(href));
      check(`${key}_a11_channel_context_ready`,
        decoded.some(href => route.ownSignature.test(href)) && decoded.every(href => !route.foreignSignature.test(href)),
        JSON.stringify(decoded));
      check(`${key}_a11_phone_channel_untouched`,
        ready.channelHrefs[ready.channelKinds.indexOf("phone")] === staticHrefs[ready.channelKinds.indexOf("phone")],
        JSON.stringify({ rendered: ready.channelHrefs, source: staticHrefs }));
    } else {
      /* No default need and no hash: nothing was selected, so the static hrefs
       * must survive byte for byte. */
      check(`${key}_a11_channel_context_ready`,
        JSON.stringify(ready.channelHrefs) === JSON.stringify(staticHrefs),
        JSON.stringify({ rendered: ready.channelHrefs, source: staticHrefs }));
      check(`${key}_a11_no_foreign_route_wording_ready`,
        ready.channelHrefs.every(href => !route.foreignSignature.test(decodeURIComponent(href))),
        JSON.stringify(ready.channelHrefs));
    }
    await page.close();
  }

  /* ---- Phase C (A5): configuration deadline and discarded late response ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("hang", "receipt");
    const staticHrefs = sourceChannelHrefs(route.source.html);
    const servedOptions = sourceNeedOptionTexts(route.source.html);
    /* networkidle0 would never fire with a held request. */
    const page = await openRoute(route, state, { waitUntil: "domcontentloaded", settle: CONFIG_TIMEOUT_MS + 1500 });
    check(`${key}_a5_config_request_aborted`,
      state.configFailures.some(failure => /abort/i.test(failure.errorText)),
      JSON.stringify(state.configFailures));
    /* Release the late 200 the deadline already discarded. */
    let lateRelease = "not_attempted";
    for (const held of state.heldConfig) {
      try { await held.respond(CONFIG_MODES.ready()); lateRelease = "accepted"; } catch (error) { lateRelease = `rejected: ${error.message}`; }
    }
    await wait(1500);
    const late = await page.evaluate(readPresentation);
    check(`${key}_a5_late_response_discarded`,
      late.submitDisabled === true
      && JSON.stringify(late.optionTexts) === JSON.stringify(servedOptions)
      && late.activeInsideBlock === false
      && JSON.stringify(late.channelHrefs) === JSON.stringify(staticHrefs),
      JSON.stringify({ lateRelease, submitDisabled: late.submitDisabled, optionTexts: late.optionTexts, servedOptions, activeInsideBlock: late.activeInsideBlock, channelHrefs: late.channelHrefs, staticHrefs }));
    check(`${key}_a5_alternative_stays_dominant`,
      late.alternativePrecedesBlock && late.blockHidden && late.reachableFocus.length === 0,
      JSON.stringify({ alternativePrecedesBlock: late.alternativePrecedesBlock, blockHidden: late.blockHidden, reachableFocus: late.reachableFocus }));
    await page.close();
  }

  /* ---- Phase D (A6): single attempt, no automatic retry, both routes in one
   * shared observation window. ---- */
  {
    const watched = [];
    for (const route of ROUTES) {
      const state = newState("down", "receipt");
      watched.push({ route, state, page: await openRoute(route, state, { settle: 300 }) });
    }
    await wait(SINGLE_ATTEMPT_WINDOW_MS);
    for (const item of watched) {
      check(`${item.route.key}_a6_single_config_attempt`,
        item.state.configRequests.length === 1,
        JSON.stringify({ window_ms: SINGLE_ATTEMPT_WINDOW_MS, requests: item.state.configRequests }));
      await item.page.close();
    }
  }

  /* ---- Phase E (A12): progressive enhancement. JavaScript is disabled for the
   * navigation AND the bundle requests are aborted, so no script can run.
   * Script execution is re-enabled afterwards only so the DOM can be read; the
   * deferred bundles were never fetched, so nothing executes retroactively. ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("down", "receipt");
    state.blockBundle = true;
    const page = await openRoute(route, state, { waitUntil: "domcontentloaded", settle: 400, javaScript: false });
    await page.setJavaScriptEnabled(true);
    const nojs = await page.evaluate(readPresentation);
    const staticHrefs = sourceChannelHrefs(route.source.html);
    check(`${key}_a12_channels_render_without_js`,
      nojs.channelHrefs.length === 3 && JSON.stringify(nojs.channelHrefs) === JSON.stringify(staticHrefs),
      JSON.stringify({ rendered: nojs.channelHrefs, source: staticHrefs }));
    check(`${key}_a12_no_dead_form_without_js`,
      nojs.blockHidden && nojs.blockInert && nojs.alternativePrecedesBlock && nojs.reachableFocus.length === 0,
      JSON.stringify({ blockHidden: nojs.blockHidden, blockInert: nojs.blockInert, alternativePrecedesBlock: nojs.alternativePrecedesBlock, reachableFocus: nojs.reachableFocus }));
    check(`${key}_a12_no_config_request_without_js`, state.configRequests.length === 0, JSON.stringify(state.configRequests));
    await page.close();
  }

  /* ---- Phase F (B4): double click produces one request ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("ready", "receipt");
    const page = await openRoute(route, state);
    await chooseRequired(page, route.needValue);
    await page.evaluate(() => { const button = document.querySelector('[type="submit"]'); button.click(); button.click(); });
    await page.waitForSelector("[data-intake-receipt]:not([hidden])");
    check(`${key}_b4_double_click_single_request`, state.leadBodies.length === 1, JSON.stringify({ requests: state.leadBodies.length }));
    await page.close();
  }

  /* ---- Phase G (B2): the POST left and never answered. Uncertain send is its
   * own state: it is NOT "não enviado", it does not retry by itself, and it
   * does not lose the retry identity. The browser's own network error code for
   * the aborted request is irrelevant here — the contract is what the visitor
   * reads and what survives in sessionStorage. ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("ready", "hang");
    const page = await openRoute(route, state);
    await chooseRequired(page, route.needValue);
    await page.click('[type="submit"]');
    await wait(SUBMIT_TIMEOUT_MS + 3000);
    const uncertain = await page.evaluate(readPresentation);
    check(`${key}_b2_uncertain_send_is_not_not_sent`,
      UNCONFIRMED_RE.test(uncertain.statusText) && !NOT_SENT_RE.test(uncertain.statusText) && !NOT_REGISTERED_RE.test(uncertain.statusText),
      JSON.stringify({ statusText: uncertain.statusText }));
    check(`${key}_b2_no_automatic_second_post`, state.leadBodies.length === 1, JSON.stringify({ requests: state.leadBodies.length }));
    check(`${key}_b2_retry_identity_survives`, typeof uncertain.retryKey === "string" && uncertain.retryKey.length > 0, JSON.stringify({ retryKey: uncertain.retryKey }));
    check(`${key}_b2_backend_error_is_receipt_unconfirmed`,
      uncertain.backendErrorCodes.length === 1 && uncertain.backendErrorCodes[0] === "receipt_unconfirmed",
      JSON.stringify(uncertain.backendErrorCodes));
    await page.close();
  }

  /* ---- Phase H (B5, as RECTIFIED by the campaign): configuration was valid at
   * load and the POST answers 503. The issue body's C6/B5 wording says the
   * request is treated as "não registrado"; that is wrong and this rectifies it.
   * Once the POST has left, the lead may already be persisted, so the only
   * honest statement is RECEIPT NOT CONFIRMED. The direct channels stay offered
   * and what the visitor already typed is preserved in the session. ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("ready", "unavailable");
    const page = await openRoute(route, state);
    await chooseRequired(page, route.needValue);
    await page.click('[type="submit"]');
    await page.waitForFunction(() => /n[ãa]o foi poss[íi]vel confirmar/i.test(document.querySelector("[data-intake-status]").textContent));
    const changed = await page.evaluate(readPresentation);
    check(`${key}_b5_availability_change_is_receipt_unconfirmed`,
      UNCONFIRMED_RE.test(changed.statusText) && !NOT_SENT_RE.test(changed.statusText) && !NOT_REGISTERED_RE.test(changed.statusText),
      JSON.stringify({ statusText: changed.statusText }));
    check(`${key}_b5_direct_channels_offered`, changed.channelsVisible && changed.channelHrefs.length === 3, JSON.stringify({ visible: changed.channelsVisible, hrefs: changed.channelHrefs.length }));
    check(`${key}_b5_visitor_input_preserved`,
      changed.needValue === route.needValue && changed.nameValue === "Canario Sintetico",
      JSON.stringify({ needValue: changed.needValue, nameValue: changed.nameValue }));
    check(`${key}_b5_no_automatic_second_post`, state.leadBodies.length === 1, JSON.stringify({ requests: state.leadBodies.length }));
    await page.close();
  }

  /* ---- Phase I: persistence followed by a lost response. The simulator wrote
   * the lead, the reply was lost on the way back, and the retry returns the
   * SAME lead id. One logical receipt, no duplicate, and no false certainty of
   * non-delivery in between. ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const state = newState("ready", "lost_then_receipt");
    const page = await openRoute(route, state);
    await chooseRequired(page, route.needValue);
    await page.click('[type="submit"]');
    await page.waitForFunction(() => /n[ãa]o foi poss[íi]vel confirmar/i.test(document.querySelector("[data-intake-status]").textContent));
    const lost = await page.evaluate(readPresentation);
    check(`${key}_lost_response_never_claims_non_delivery`,
      !NOT_SENT_RE.test(lost.statusText) && !NOT_REGISTERED_RE.test(lost.statusText),
      JSON.stringify({ statusText: lost.statusText }));
    await page.click('[type="submit"]');
    await page.waitForSelector("[data-intake-receipt]:not([hidden])");
    const settled = await page.evaluate(readPresentation);
    check(`${key}_lost_response_retry_same_payload_and_key`,
      state.leadBodies.length === 2 && state.leadBodies[0] === state.leadBodies[1]
      && state.leadKeys[0].length > 0 && state.leadKeys[0] === state.leadKeys[1],
      JSON.stringify({ attempts: state.leadBodies.length, sameBody: state.leadBodies[0] === state.leadBodies[1], keys: state.leadKeys }));
    check(`${key}_lost_response_single_logical_receipt`,
      settled.receiptVisible && settled.protocol === "lead-canary-idempotent"
      && settled.eventNames.filter(name => name === "lead_persisted").length === 1,
      JSON.stringify({ protocol: settled.protocol, persisted: settled.eventNames.filter(name => name === "lead_persisted").length }));
    await page.close();
  }

  /* ---- Phase J (A8/A9/A10): invalid configuration. Runs last because a single
   * generic catch here must not hide the rest of the matrix. Every case has to
   * reach the contact alternative AND leave a distinct internal error_code:
   * "authority withheld" and "broken deploy" must stay distinguishable. ---- */
  for (const route of ROUTES) {
    const key = route.key;
    const observedCodes = [];
    const cases = INVALID_CONFIG_CASES.slice();
    cases.push({ mode: "method_not_allowed", code: "config_method_not_allowed", row: "a10" });
    if (route.contextUnknownApplies) cases.push({ mode: "context_unknown", code: "config_context_unknown", row: "a9" });
    else record(`${key}_a9_context_unknown_not_applicable`, true,
      "this route sends no intake_context query, so 422 intake_context_unknown cannot occur here; the case runs on /quantitativos-orcamento-obras/ only");

    for (const item of cases) {
      const state = newState(item.mode, "receipt");
      const page = await openRoute(route, state);
      const invalid = await page.evaluate(readPresentation);
      observedCodes.push(invalid.backendErrorCodes[0] || "");
      const row = item.row || "a8";
      check(`${key}_${row}_${item.mode}_falls_back`,
        invalid.submitDisabled === true && invalid.blockHidden && invalid.blockInert && invalid.reachableFocus.length === 0
        && invalid.alternativePrecedesBlock && invalid.statusVisible
        /* unavailable() must actually have run: the served HTML already starts
         * on the alternative, so structure alone proves nothing. */
        && !SERVED_STATUS_RE.test(invalid.statusText) && invalid.statusText.length > 0,
        JSON.stringify({ submitDisabled: invalid.submitDisabled, blockHidden: invalid.blockHidden, blockInert: invalid.blockInert, reachableFocus: invalid.reachableFocus, statusText: invalid.statusText.slice(0, 160) }));
      check(`${key}_${row}_${item.mode}_error_code`,
        invalid.backendErrorCodes.length === 1 && invalid.backendErrorCodes[0] === item.code,
        JSON.stringify({ observed: invalid.backendErrorCodes, expected: item.code }));
      if (item.row === "a10") {
        check(`${key}_a10_message_does_not_blame_visitor`,
          !BLAMES_VISITOR_RE.test(invalid.statusText),
          JSON.stringify({ statusText: invalid.statusText }));
      }
      await page.close();
    }
    const distinct = [...new Set(observedCodes.filter(Boolean))];
    check(`${key}_a8_distinct_error_codes`,
      distinct.length >= 4 && !distinct.includes("config_unknown"),
      JSON.stringify({ observed: observedCodes, distinct }));
  }

  /* ---- Phase K: the full triage journey. Regression guards for attribution,
   * idempotent retry, receipt and the analytics allowlist, unchanged. ---- */
  {
    const route = ROUTES[0];
    const state = newState("down", "retry");
    const triage = await openRoute(route, state);
    await triage.evaluate(() => sessionStorage.setItem("confenge_pseo_attribution", JSON.stringify({
      utm_source: "google",
      utm_campaign: "mv03_launch",
      utm_content: "12.345.678/0001-90",
      asset_id: "private_project_technical_readiness_v1",
      route_family: "prontidao-tecnica-obra-privada",
    })));
    state.configMode = "ready";
    await triage.goto(`${base}${route.path}`, { waitUntil: "networkidle0" });
    await wait(400);
    await chooseRequired(triage, route.needValue);
    await triage.click('[type="submit"]');
    await triage.waitForFunction(() => /n[ãa]o foi poss[íi]vel confirmar/i.test(document.querySelector("[data-intake-status]").textContent));
    await triage.click('[type="submit"]'); await triage.waitForSelector("[data-intake-receipt]:not([hidden])");
    check("triage_retry_same_payload", state.leadBodies.length === 2 && state.leadBodies[0] === state.leadBodies[1], JSON.stringify({ attempts: state.leadBodies.length, same: state.leadBodies[0] === state.leadBodies[1] }));
    check("triage_retry_same_idempotency_key", state.leadKeys[0].length > 0 && state.leadKeys[0] === state.leadKeys[1], JSON.stringify(state.leadKeys));
    const submitted = JSON.parse(state.leadBodies[0]);
    check("triage_utm_allowlist", submitted.utm_source === "google" && submitted.utm_campaign === "mv03_launch", JSON.stringify({ utm_source: submitted.utm_source, utm_campaign: submitted.utm_campaign }));
    check("triage_utm_pii_scrubbed", submitted.utm_content === undefined, JSON.stringify({ utm_content: submitted.utm_content }));
    check("triage_source_asset_preserved", submitted.asset_id === "technical_triage_v1" && submitted.source_origin_asset_id === "private_project_technical_readiness_v1" && submitted.source_origin_route_family === "prontidao-tecnica-obra-privada", JSON.stringify({ asset_id: submitted.asset_id, source_origin_asset_id: submitted.source_origin_asset_id, source_origin_route_family: submitted.source_origin_route_family }));
    const triageResult = await triage.evaluate(() => ({ receipt: document.querySelector("[data-intake-protocol]").textContent, events: window.dataLayer || [] }));
    check("triage_receipt_visible", triageResult.receipt === "lead-canary-receipt", JSON.stringify({ receipt: triageResult.receipt }));
    check("triage_real_bus_events", triageResult.events.some(event => event.event === "lead_form_submit") && triageResult.events.some(event => event.event === "lead_persisted"), "required events absent from dataLayer");
    check("triage_analytics_allowlist", !/canario@example|Canario Sintetico/i.test(JSON.stringify(triageResult.events)) && !/canario@example|Canario Sintetico/i.test(state.collectorBodies.join("")), "PII present in analytics");
    await axeClean(triage, "triage_mobile"); await shot(triage, "triage-390");
    await triage.close();
  }
} finally {
  await browser.close(); server.close();
  writeReport();
}
console.log("CONVERGENCE_BROWSER_OK", JSON.stringify(report));
