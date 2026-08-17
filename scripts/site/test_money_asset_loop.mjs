/**
 * Joined Money Asset path: shipped page script → shipped lead → shipped
 * inbound-handoff → shipped collect → shipped ops counters.
 * No parallel mock of those units.
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  isConfengeMoneyAssetLoc,
  MONEY_ASSET_CANONICAL,
  MONEY_ASSET_LOC_SPOOFS,
  sitemapHasMoneyAssetLoc,
} from "./money_asset_loc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-money-loop-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
process.env.OPS_TOKEN = "ops-money-loop-token16";
delete process.env.NTFY_URL;
delete process.env.NTFY_TOKEN;
delete process.env.RESEND_API_KEY;
delete process.env.OPS_WEBHOOK_URL;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.LEAD_REQUIRE_TURNSTILE;
delete process.env.CONTEXT;
delete process.env.NETLIFY_CONTEXT;
delete process.env.LEAD_STORE;

const SECRET = "inbound-loop-secret-not-for-prod";
const PII_NEEDLES = [
  "PII_MUST_NOT_LEAK",
  "maria.costa@",
  "Maria Costa",
  "SYNTHETIC-INBOUND",
  "qa-loop@",
  SECRET,
];

function fail(name, detail) {
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
  process.exit(1);
}
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

const pageHtml = fs.readFileSync(path.join(root, "ferramentas/diagnostico-defesa-margem/index.html"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const indexability = JSON.parse(
  fs.readFileSync(path.join(root, "data/organic/money-asset-indexability.json"), "utf8"),
);

// --- page honesty (static shipped HTML) ---
{
  const utilityIdx = pageHtml.indexOf("id=\"identificacao\"");
  const ctaIdx = pageHtml.indexOf("id=\"segunda-leitura\"");
  if (utilityIdx < 0 || ctaIdx < 0 || utilityIdx > ctaIdx) fail("utility_before_cta", { utilityIdx, ctaIdx });
  const indexable = indexability.gate && indexability.gate.indexable === true;
  if (indexable) {
    if (pageHtml.includes("noindex")) fail("noindex_must_drop_when_gate_passes", indexability.gate);
    if (!isConfengeMoneyAssetLoc(MONEY_ASSET_CANONICAL)) fail("canonical_loc_must_parse");
    for (const spoof of MONEY_ASSET_LOC_SPOOFS) {
      if (isConfengeMoneyAssetLoc(spoof)) fail("spoof_loc_accepted", spoof);
      if (sitemapHasMoneyAssetLoc(`<urlset><url><loc>${spoof}</loc></url></urlset>`)) {
        fail("spoof_sitemap_loc_accepted", spoof);
      }
    }
    if (!sitemapHasMoneyAssetLoc(sitemap)) fail("sitemap_must_include_when_indexable");
    if (indexability.html_noindex !== false || indexability.in_sitemap !== true) fail("indexability_inconsistent", indexability);
    if (indexability.inputs.min_score !== 55 || Number(indexability.inputs.data_confidence) < 0.45) fail("gate_floors_changed", indexability.inputs);
  } else {
    if (!pageHtml.includes('content="noindex,follow"')) fail("noindex_missing");
    if (sitemap.includes("diagnostico-defesa-margem")) fail("sitemap_must_omit_while_not_indexable");
    if (indexability.html_noindex !== true || indexability.in_sitemap !== false) fail("indexability_inconsistent", indexability);
  }
  if (!pageHtml.includes("Quero uma segunda leitura deste contrato")) fail("cta_copy");
  if (!pageHtml.includes('rel="canonical"') || !pageHtml.includes("diagnostico-defesa-margem")) {
    fail("canonical");
  }
  if (!pageHtml.includes("application/ld+json")) fail("schema");
  if (!pageHtml.includes("as_of") || !pageHtml.includes("UNKNOWN")) fail("provenance_unknown");
  if (/pode ter direito|\btem direito\b/i.test(pageHtml)) fail("legal_conclusion");
  if (!pageHtml.includes('lang="pt-BR"') || !pageHtml.includes("skip-link") || !pageHtml.includes('id="conteudo"')) {
    fail("a11y_landmarks");
  }
  if (!pageHtml.includes('for="nome"') || !pageHtml.includes('for="email"') || !pageHtml.includes('for="consentimento"')) {
    fail("a11y_labels");
  }
  if (pageHtml.includes("extra-cli") || /smartlic/i.test(pageHtml)) fail("brand_leak");
  pass("page_honesty");
}

const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, "ferramentas/diagnostico-defesa-margem/snapshot.json"), "utf8"),
);
const diagnoseSrc = fs.readFileSync(path.join(root, "assets/js/diagnose-margin.js"), "utf8");
const scriptSrc = fs.readFileSync(path.join(root, "script.js"), "utf8");
const inlineMatch = pageHtml.match(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/);
if (!inlineMatch) fail("inline_script_missing");

function makeEl(init = {}) {
  const listeners = {};
  const attrs = { ...(init.attrs || {}) };
  const children = init.children || [];
  const el = {
    id: init.id || "",
    name: init.name || "",
    type: init.type || "",
    tagName: (init.tagName || "DIV").toUpperCase(),
    value: init.value || "",
    hidden: Boolean(init.hidden),
    disabled: false,
    textContent: init.textContent || "",
    innerHTML: "",
    href: init.href || "",
    elements: init.elements || [],
    children,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    style: {},
    getAttribute(name) {
      if (name === "href") return el.href;
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
      return true;
    },
    querySelector(sel) {
      const all = [el, ...children, ...(el.elements || [])];
      if (sel.startsWith("#")) return all.find((n) => n.id === sel.slice(1)) || null;
      if (sel.startsWith("[name=")) {
        const name = sel.slice(7, -2);
        return all.find((n) => n.name === name) || null;
      }
      if (sel === '[type="submit"]' || sel === "[type=\"submit\"]") {
        return all.find((n) => n.type === "submit") || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      const found = el.querySelector(sel);
      return found ? [found] : [];
    },
    closest(sel) {
      if (sel === "[data-cta-id]" && attrs["data-cta-id"]) return el;
      return null;
    },
    focus() {},
    click() {
      el.dispatchEvent({ type: "click" });
    },
    checkValidity() { return true; },
    reportValidity() { return true; },
    setCustomValidity() {},
    appendChild(child) {
      children.push(child);
      return child;
    },
    dataset: {},
    _listeners: listeners,
  };
  return el;
}

function independentVerify(secret, header, rawBody, now = Date.now()) {
  let tUnix = 0;
  let sig = "";
  for (const part of String(header || "").split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) tUnix = Number(p.slice(2));
    if (p.startsWith("v1=")) sig = p.slice(3);
  }
  if (!tUnix || !sig) return { ok: false, reason: "malformed" };
  if (Math.abs(now - tUnix * 1000) > 5 * 60 * 1000) return { ok: false, reason: "skew" };
  const mac = crypto.createHmac("sha256", secret).update(`${tUnix}.${rawBody}`).digest("hex");
  return { ok: mac === sig };
}

function startMock({ mode = "ok", secret = SECRET } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url, `http://${req.headers.host}`);
      let body = {};
      try { body = JSON.parse(raw); } catch { /* ignore */ }
      seen.push({ method: req.method, pathname: url.pathname, search: url.search, raw, body });
      order.push(`dest:${body.lead_id || "?"}`);
      if (req.method !== "POST" || url.pathname !== "/api/v1/webhooks/confenge/inbound") {
        res.writeHead(404); res.end("{}"); return;
      }
      if (mode === "5xx") { res.writeHead(503); res.end("{}"); return; }
      if (mode === "401") { res.writeHead(401); res.end("{}"); return; }
      if (mode === "timeout") return;
      const verified = independentVerify(secret, req.headers["x-warmbly-signature"], raw);
      if (!verified.ok) { res.writeHead(401); res.end("{}"); return; }
      const duplicate = seen.filter((s) => s.body && s.body.lead_id === body.lead_id).length > 1;
      res.writeHead(duplicate ? 200 : 201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        data: {
          lead: { id: `wb-${body.lead_id}` },
          action: { id: `act-${body.lead_id}` },
          duplicate,
          next_action: "INBOUND_NOW",
          dispatch_attempted: false,
        },
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        seen,
        url: `http://127.0.0.1:${port}/api/v1/webhooks/confenge/inbound`,
        setMode(next) { mode = next; },
        close() { return new Promise((r) => server.close(r)); },
      });
    });
  });
}

const order = [];
const leadPath = path.join(root, "netlify/functions/lead.cjs");
const collectPath = path.join(root, "netlify/functions/collect.cjs");
const opsPath = path.join(root, "netlify/functions/ops.cjs");
const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");

function loadLead() {
  for (const rel of [
    "netlify/functions/lead.cjs",
    "netlify/functions/lib/lead-core.cjs",
    "netlify/functions/lib/lead-store.cjs",
    "netlify/functions/lib/lead-delivery.cjs",
    "netlify/functions/lib/lead-rate-limit.cjs",
    "netlify/functions/lib/inbound-handoff.cjs",
  ]) {
    const p = path.join(root, rel);
    if (require.cache[require.resolve(p)]) delete require.cache[require.resolve(p)];
  }
  return require(leadPath);
}

const { handler: leadHandler } = loadLead();
const { FileStore } = require(storePath);
const origPut = FileStore.prototype.put;
FileStore.prototype.put = async function putHook(record, opts) {
  if (record && record.lead_id) {
    const existed = fs.existsSync(this._path(record.lead_id));
    if (!existed) order.push(`persist:${record.lead_id}`);
  }
  return origPut.call(this, record, opts);
};
const collect = require(collectPath);
const { _reset } = require(path.join(root, "netlify/functions/lib/lead-rate-limit.cjs"));
_reset();

const mock = await startMock({ mode: "ok" });
process.env.CONFENGE_INBOUND_WEBHOOK_URL = mock.url;
process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = SECRET;
process.env.CONFENGE_INBOUND_TIMEOUT_MS = "400";

function leadEvent(body, extraHeaders = {}) {
  return {
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": extraHeaders["user-agent"] || "confenge-money-loop/1.0",
      "x-forwarded-for": extraHeaders.ip || "203.0.113.91",
      "Idempotency-Key": body.idempotency_key || "",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function moneyPayload(extra = {}) {
  return {
    nome: extra.nome || "Maria Costa",
    email: extra.email || "maria.costa@construtora-norte.com.br",
    estagio: "problema urgente em contrato",
    jornada: "contrato",
    consentimento: "on",
    origem: "/ferramentas/diagnostico-defesa-margem/",
    landing_page: "/ferramentas/diagnostico-defesa-margem/",
    asset_id: "diagnostico-defesa-margem",
    route_family: "defesa-margem-diagnostico",
    public_contract_id: "83102277000152-2-000626/2026",
    public_id_slug: "md-8569b618",
    cta_id: "segunda-leitura-contrato",
    mensagem: extra.mensagem || "PII_MUST_NOT_LEAK",
    ...extra,
  };
}

async function postLead(payload, extraHeaders = {}) {
  return leadHandler(leadEvent(payload, extraHeaders));
}

const byId = {};
const hidden = [
  makeEl({ name: "form-name", value: "segunda-leitura-contrato" }),
  makeEl({ name: "origem", value: "/ferramentas/diagnostico-defesa-margem/" }),
  makeEl({ name: "estagio", value: "problema urgente em contrato" }),
  makeEl({ name: "asset_id", value: "diagnostico-defesa-margem" }),
  makeEl({ name: "route_family", value: "defesa-margem-diagnostico" }),
  makeEl({ name: "cta_id", value: "segunda-leitura-contrato" }),
  makeEl({ name: "landing_page", value: "/ferramentas/diagnostico-defesa-margem/" }),
];
const fields = {
  "lookup-status": makeEl({ id: "lookup-status" }),
  lookup: makeEl({ id: "lookup", tagName: "FORM" }),
  qid: makeEl({ id: "qid", name: "q", value: "83102277000152-2-000626/2026" }),
  "public-contract-id": makeEl({
    id: "public-contract-id",
    name: "public_contract_id",
    value: "83102277000152-2-000626/2026",
  }),
  "public-id-slug": makeEl({
    id: "public-id-slug",
    name: "public_id_slug",
    value: "md-8569b618",
  }),
  "out-identificacao": makeEl({ id: "out-identificacao" }),
  "out-resumo": makeEl({ id: "out-resumo" }),
  "out-timeline": makeEl({ id: "out-timeline" }),
  "out-eventos": makeEl({ id: "out-eventos" }),
  "out-fontes": makeEl({ id: "out-fontes" }),
  "out-conferencia": makeEl({ id: "out-conferencia" }),
  "out-unknown": makeEl({ id: "out-unknown" }),
  "segunda-leitura": makeEl({ id: "segunda-leitura", attrs: { "data-cta-id": "segunda-leitura-contrato" } }),
  nome: makeEl({ id: "nome", name: "nome", value: "Maria Costa" }),
  telefone: makeEl({ id: "telefone", name: "telefone", value: "" }),
  email: makeEl({ id: "email", name: "email", value: "maria.costa@construtora-norte.com.br" }),
  consentimento: makeEl({ id: "consentimento", name: "consentimento", value: "on" }),
  mensagem: makeEl({ id: "mensagem", name: "mensagem", value: "PII_MUST_NOT_LEAK" }),
  "jornada-hidden": makeEl({ id: "jornada-hidden", name: "jornada", value: "contrato" }),
};
Object.assign(byId, fields);
hidden.push(
  byId["public-contract-id"],
  byId["public-id-slug"],
  byId["jornada-hidden"],
  byId.nome,
  byId.email,
  byId.telefone,
  byId.consentimento,
  byId.mensagem,
);
const submitBtn = makeEl({
  type: "submit",
  tagName: "BUTTON",
  textContent: "Quero uma segunda leitura deste contrato",
  attrs: {
    "data-event-name": "cta_click",
    "data-asset-id": "diagnostico-defesa-margem",
    "data-route-family": "defesa-margem-diagnostico",
    "data-cta-id": "segunda-leitura-contrato",
  },
});
const form = makeEl({
  id: "lead-form",
  tagName: "FORM",
  attrs: { name: "diagnostico-b2g", "data-ajax": "true" },
});
form.name = "diagnostico-b2g";
form.elements = [...hidden, submitBtn];
form.children = form.elements;
byId["lead-form"] = form;
byId.lookup.elements = [byId.qid];

const docListeners = {};
const windowListeners = {};
const observers = [];
class IntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    observers.push(this);
  }
  observe(target) { this.target = target; }
  unobserve() {}
  disconnect() { this.disconnected = true; }
}

const dataLayer = [];
const assigns = [];
const document = {
  readyState: "loading",
  visibilityState: "visible",
  body: {
    classList: { add() {}, remove() {} },
    getAttribute(name) {
      const map = {
        "data-route-family": "defesa-margem-diagnostico",
        "data-asset-id": "diagnostico-defesa-margem",
        "data-journey": "contrato",
      };
      return map[name] || null;
    },
  },
  documentElement: { scrollHeight: 2000, classList: { replace() {} } },
  getElementById(id) { return byId[id] || null; },
  querySelector(sel) {
    if (sel === 'form[name="diagnostico-b2g"], form[name="diagnostico-confenge"]') return form;
    if (sel === 'form[name="diagnostico-b2g"]') return form;
    if (sel === "#segunda-leitura") return byId["segunda-leitura"];
    if (sel.startsWith("#")) return byId[sel.slice(1)] || null;
    return null;
  },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener(type, fn) {
    (docListeners[type] = docListeners[type] || []).push(fn);
  },
};

const windowObj = {
  dataLayer,
  document,
  location: {
    pathname: "/ferramentas/diagnostico-defesa-margem/",
    search: "",
    hash: "",
    assign(url) { assigns.push(String(url)); },
  },
  matchMedia: () => ({ matches: false }),
  addEventListener(type, fn) {
    (windowListeners[type] = windowListeners[type] || []).push(fn);
  },
  innerHeight: 800,
  scrollY: 0,
  sessionStorage: { getItem: () => null, setItem() {} },
  IntersectionObserver,
  CONFENGE_DEBUG_ANALYTICS: false,
  navigator: {},
};
windowObj.window = windowObj;

class FormDataPoly {
  constructor(target) {
    this.map = new Map();
    for (const node of target.elements || []) {
      if (node.name) this.map.set(node.name, node.value);
    }
  }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  set(key, value) { this.map.set(key, value); }
  forEach(fn) { this.map.forEach((value, key) => fn(value, key)); }
}

let lastLeadHttp = null;
async function shippedFetch(url, opts = {}) {
  const href = String(url);
  if (href.includes("snapshot.json")) {
    return { ok: true, json: async () => snapshot };
  }
  if (href.includes("/.netlify/functions/lead")) {
    const body = JSON.parse(opts.body || "{}");
    const res = await leadHandler(leadEvent(body, {
      "Idempotency-Key": (opts.headers && (opts.headers["Idempotency-Key"] || opts.headers["idempotency-key"])) || body.idempotency_key,
      ip: "203.0.113.91",
    }));
    lastLeadHttp = res;
    return {
      ok: res.statusCode === 201 || res.statusCode === 200,
      status: res.statusCode,
      json: async () => JSON.parse(res.body),
    };
  }
  if (href.includes("/.netlify/functions/collect")) {
    const res = await collect.handler({
      httpMethod: "POST",
      headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
      body: opts.body,
    });
    return {
      ok: res.statusCode === 202,
      status: res.statusCode,
      json: async () => JSON.parse(res.body),
    };
  }
  throw new Error(`unexpected fetch ${href}`);
}
windowObj.fetch = shippedFetch;

const sandbox = {
  window: windowObj,
  document,
  console,
  URLSearchParams,
  FormData: FormDataPoly,
  IntersectionObserver,
  fetch: shippedFetch,
  AbortController,
  setTimeout,
  clearTimeout,
  sessionStorage: windowObj.sessionStorage,
  navigator: windowObj.navigator,
};
vm.createContext(sandbox);
vm.runInContext(diagnoseSrc, sandbox);
vm.runInContext(inlineMatch[1], sandbox);
vm.runInContext(scriptSrc, sandbox);
document.readyState = "complete";
for (const fn of docListeners.DOMContentLoaded || []) fn();

for (let i = 0; i < 30 && !sandbox.window.ConfengeDiagnoseMargin; i += 1) {
  await new Promise((r) => setTimeout(r, 10));
}
for (let i = 0; i < 40; i += 1) {
  if (byId["out-resumo"].innerHTML.includes("UNKNOWN") || dataLayer.some((e) => e.event === "contract_analyzed")) break;
  await new Promise((r) => setTimeout(r, 15));
}
byId.lookup.dispatchEvent({ type: "submit", preventDefault() {} });
for (let i = 0; i < 30 && !dataLayer.some((e) => e.event === "contract_analyzed"); i += 1) {
  await new Promise((r) => setTimeout(r, 15));
}
for (const obs of observers) {
  if (obs.target && obs.target.id === "segunda-leitura") {
    obs.cb([{ isIntersecting: true, target: obs.target }]);
  }
}
form.dispatchEvent({ type: "submit", preventDefault() {} });
for (let i = 0; i < 40 && !dataLayer.some((e) => e.event === "lead_persisted"); i += 1) {
  await new Promise((r) => setTimeout(r, 20));
}
for (const fn of windowListeners.pagehide || []) fn();
await new Promise((r) => setTimeout(r, 30));

const names = dataLayer.map((e) => e.event);
for (const ev of ["asset_view", "organic_landing", "contract_selected", "contract_analyzed", "cta_view", "cta_click", "lead_persisted"]) {
  if (!names.includes(ev)) fail("page_event_missing", { ev, names });
}
if (!lastLeadHttp || lastLeadHttp.statusCode !== 201) {
  fail("page_submit_not_201", lastLeadHttp && lastLeadHttp.body);
}
const created = JSON.parse(lastLeadHttp.body);
if (!created.ok || !created.lead_id) fail("page_submit_body", created);
const createdStr = JSON.stringify(created);
if (PII_NEEDLES.some((n) => createdStr.includes(n))) fail("response_pii", created);
if (JSON.stringify(dataLayer).includes("maria.costa@") || JSON.stringify(dataLayer).includes("Maria Costa")) {
  fail("analytics_pii", dataLayer);
}

const pageLead = JSON.parse(fs.readFileSync(path.join(storeDir, `${created.lead_id}.json`), "utf8"));
if (pageLead.source !== "CONFENGE_WEB") fail("source", pageLead.source);
if (pageLead.handoff.status !== "DELIVERED") fail("page_handoff_delivered", pageLead.handoff);
const persistIdx = order.indexOf(`persist:${created.lead_id}`);
const destIdx = order.indexOf(`dest:${created.lead_id}`);
if (persistIdx < 0 || destIdx < 0 || persistIdx > destIdx) fail("persist_before_dest", { order, persistIdx, destIdx });
const destHit = mock.seen.find((s) => s.body && s.body.lead_id === created.lead_id);
if (!destHit || destHit.search) fail("dest_query", destHit);
if (destHit.body.source !== "CONFENGE_WEB") fail("dest_source", destHit.body);
pass("page_to_persist_first", { lead_id: created.lead_id });

const replay = await postLead(moneyPayload({
  idempotency_key: pageLead.idempotency_key,
}), { "Idempotency-Key": pageLead.idempotency_key, ip: "203.0.113.91" });
const replayBody = JSON.parse(replay.body);
if (replay.statusCode !== 200 || replayBody.idempotent !== true || replayBody.lead_id !== created.lead_id) {
  fail("replay", { status: replay.statusCode, body: replayBody });
}
if (mock.seen.filter((s) => s.body && s.body.lead_id === created.lead_id).length !== 1) {
  fail("replay_reposted", mock.seen.length);
}
pass("replay_same_lead_id", { lead_id: created.lead_id });

const beforeSynth = mock.seen.length;
const synth = await postLead(moneyPayload({
  nome: "SYNTHETIC-INBOUND",
  email: "qa-loop@example.com",
  mensagem: "[QA] synthetic — do not contact",
  utm_source: "synthetic",
  record_kind: "synthetic",
  test_mode: true,
  idempotency_key: "loop-synth-001",
}), { ip: "203.0.113.92", "Idempotency-Key": "loop-synth-001" });
const synthBody = JSON.parse(synth.body);
if (synth.statusCode !== 201 || !synthBody.lead_id) fail("synth_capture", synthBody);
const synthRec = JSON.parse(fs.readFileSync(path.join(storeDir, `${synthBody.lead_id}.json`), "utf8"));
if (synthRec.record_kind === "real") fail("synth_kind", synthRec.record_kind);
if (!synthRec.handoff || synthRec.handoff.status !== "SKIPPED") fail("synth_skip", synthRec.handoff);
if (mock.seen.length !== beforeSynth) fail("synth_posted", mock.seen.length - beforeSynth);
pass("synthetic_skip", { lead_id: synthBody.lead_id });

mock.setMode("401");
const blocked = await postLead(moneyPayload({
  email: "maria.401@construtora-norte.com.br",
  idempotency_key: "loop-401-001",
}), { ip: "203.0.113.93", "Idempotency-Key": "loop-401-001" });
const blockedBody = JSON.parse(blocked.body);
if (blocked.statusCode !== 201 || !blockedBody.lead_id) fail("blocked_capture", blockedBody);
const blockedRec = JSON.parse(fs.readFileSync(path.join(storeDir, `${blockedBody.lead_id}.json`), "utf8"));
if (blockedRec.handoff.status !== "BLOCKED") fail("blocked_status", blockedRec.handoff);
pass("dest_401_keeps_capture", { lead_id: blockedBody.lead_id });

mock.setMode("5xx");
const retryable = await postLead(moneyPayload({
  email: "maria.5xx@construtora-norte.com.br",
  idempotency_key: "loop-5xx-001",
}), { ip: "203.0.113.94", "Idempotency-Key": "loop-5xx-001" });
const retryableBody = JSON.parse(retryable.body);
if (retryable.statusCode !== 201 || !retryableBody.lead_id) fail("retryable_capture", retryableBody);
const retryableRec = JSON.parse(fs.readFileSync(path.join(storeDir, `${retryableBody.lead_id}.json`), "utf8"));
if (retryableRec.handoff.status !== "RETRYABLE") fail("retryable_status", retryableRec.handoff);
pass("dest_down_keeps_capture", { lead_id: retryableBody.lead_id });
mock.setMode("ok");

const savedUrl = process.env.CONFENGE_INBOUND_WEBHOOK_URL;
const savedSecret = process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
const beforeUnset = mock.seen.length;
const skipped = await postLead(moneyPayload({
  email: "maria.unset@construtora-norte.com.br",
  idempotency_key: "loop-unset-001",
}), { ip: "203.0.113.95", "Idempotency-Key": "loop-unset-001" });
const skippedBody = JSON.parse(skipped.body);
if (skipped.statusCode !== 201 || !skippedBody.lead_id) fail("unset_capture", skippedBody);
const skippedRec = JSON.parse(fs.readFileSync(path.join(storeDir, `${skippedBody.lead_id}.json`), "utf8"));
if (!skippedRec.handoff || skippedRec.handoff.status !== "SKIPPED") fail("unset_skip", skippedRec.handoff);
if (mock.seen.length !== beforeUnset) fail("unset_posted", mock.seen.length - beforeUnset);
pass("unset_inbound_skips_keeps_capture", { lead_id: skippedBody.lead_id });
process.env.CONFENGE_INBOUND_WEBHOOK_URL = savedUrl;
process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = savedSecret;

const collectBatch = await collect.handler({
  httpMethod: "POST",
  headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
  body: JSON.stringify({
    events: [
      { event: "asset_view", props: { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico", nome: "Maria Costa", email: "maria.costa@construtora-norte.com.br" }, path: "/ferramentas/diagnostico-defesa-margem/" },
      { event: "contract_analyzed", props: { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico", public_id_slug: "md-8569b618" }, path: "/ferramentas/diagnostico-defesa-margem/" },
      { event: "cta_view", props: { asset_id: "diagnostico-defesa-margem", cta_id: "segunda-leitura-contrato" }, path: "/ferramentas/diagnostico-defesa-margem/" },
      { event: "cta_click", props: { asset_id: "diagnostico-defesa-margem", cta_id: "segunda-leitura-contrato" }, path: "/ferramentas/diagnostico-defesa-margem/" },
      { event: "lead_created", props: { asset_id: "diagnostico-defesa-margem", route_family: "defesa-margem-diagnostico", public_id_slug: "md-8569b618" }, path: "/ferramentas/diagnostico-defesa-margem/" },
    ],
  }),
});
if (collectBatch.statusCode !== 202) fail("collect_batch", collectBatch.body);

delete require.cache[require.resolve(opsPath)];
const ops = require(opsPath);
async function opsGet(action) {
  return ops.handler({
    httpMethod: "GET",
    headers: {
      origin: "https://confenge.com.br",
      authorization: "Bearer ops-money-loop-token16",
    },
    queryStringParameters: { action },
    rawUrl: `https://confenge.com.br/.netlify/functions/ops?action=${action}`,
  });
}
const opsHandoff = await opsGet("inbound_handoff");
const opsSummary = await opsGet("analytics_summary");
if (opsHandoff.statusCode !== 200) fail("ops_handoff_http", opsHandoff.body);
if (opsSummary.statusCode !== 200) fail("ops_summary_http", opsSummary.body);
const handoffJson = JSON.parse(opsHandoff.body);
const summaryJson = JSON.parse(opsSummary.body);
const chain = handoffJson.money_asset || summaryJson.money_asset;
if (!chain || !chain.events || !chain.handoff) fail("ops_money_asset_missing", { handoffJson, summaryJson });
for (const key of ["asset_view", "contract_analyzed", "cta_view", "cta_click", "lead_created"]) {
  if (typeof chain.events[key] !== "number" || chain.events[key] < 1) {
    fail("ops_event_counter", { key, value: chain.events[key], chain });
  }
}
if (typeof chain.handoff.delivered !== "number" || chain.handoff.delivered < 1) {
  fail("ops_handoff_delivered", chain.handoff);
}
if (typeof chain.handoff.blocked !== "number" || chain.handoff.blocked < 1) {
  fail("ops_handoff_blocked", chain.handoff);
}
if (typeof chain.handoff.skipped !== "number" || chain.handoff.skipped < 1) {
  fail("ops_handoff_skipped", chain.handoff);
}
if (typeof chain.handoff.retryable !== "number" || chain.handoff.retryable < 1) {
  fail("ops_handoff_retryable", chain.handoff);
}
const opsBlob = JSON.stringify(handoffJson) + JSON.stringify(summaryJson);
if (PII_NEEDLES.some((n) => n !== SECRET && opsBlob.includes(n))) fail("ops_pii", opsBlob.slice(0, 800));
if (opsBlob.includes("maria.costa@") || opsBlob.includes("48988") || /"nome"\s*:\s*"Maria/.test(opsBlob)) {
  fail("ops_pii_fields", opsBlob.slice(0, 800));
}
pass("ops_counters", chain);
if (process.env.MONEY_ASSET_OPS_OUT) {
  fs.mkdirSync(path.dirname(process.env.MONEY_ASSET_OPS_OUT), { recursive: true });
  fs.writeFileSync(
    process.env.MONEY_ASSET_OPS_OUT,
    `${JSON.stringify({ inbound_handoff: handoffJson, analytics_summary: summaryJson }, null, 2)}\n`,
    "utf8",
  );
}

await mock.close();
FileStore.prototype.put = origPut;
try { fs.rmSync(storeDir, { recursive: true, force: true }); } catch { /* ignore */ }

console.log("MONEY_ASSET_LOOP_OK", {
  lead_id: created.lead_id,
  replay: replayBody.lead_id,
  events: chain.events,
  handoff: chain.handoff,
});
