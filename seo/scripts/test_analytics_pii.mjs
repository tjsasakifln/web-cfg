/**
 * Unit test: shipped script.js track() must not push PII-like params.
 * Runs the real script in a minimal browser sandbox (vm).
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");
const analyticsSource = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");

if (!analyticsSource.includes("'/api/web/collect'") || analyticsSource.includes("'/.netlify/functions/collect'")) {
  console.error("FAIL: browser analytics must use the canonical Netcup collector route");
  process.exit(1);
}

const dataLayer = [];
const sessionValues = new Map();
const sessionStorage = {
  getItem: (key) => sessionValues.get(key) || null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
};
const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: { classList: { remove() {}, add() {} } },
};
const windowObj = {
  dataLayer,
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    search: "",
    hash: "",
  },
  document,
  addEventListener: () => {},
  innerHeight: 800,
  scrollY: 0,
  sessionStorage,
  crypto: { randomUUID: () => "8e0bdd75-a332-45d8-8ec9-5d98843f0000" },
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;

const sandbox = { window: windowObj, document, console, URLSearchParams, sessionStorage };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  console.error("FAIL: confengeTrack not exported");
  process.exit(1);
}
const sessionId = sandbox.window.confengeSessionId;
if (typeof sessionId !== "function") {
  console.error("FAIL: confengeSessionId not exported");
  process.exit(1);
}
const firstSessionId = sessionId();
if (!/^sess-[0-9a-f]{27}$/.test(firstSessionId) || sessionId() !== firstSessionId) {
  console.error("FAIL: stable non-PII session id", firstSessionId, sessionId());
  process.exit(1);
}

const runWithBlockedSessionStorage = (uuid) => {
  const blockedStorage = {
    getItem: () => { throw new Error("storage blocked"); },
    setItem: () => { throw new Error("storage blocked"); },
  };
  const isolatedWindow = {
    ...windowObj,
    dataLayer: [],
    sessionStorage: blockedStorage,
    crypto: { randomUUID: () => uuid },
  };
  isolatedWindow.window = isolatedWindow;
  const isolatedSandbox = {
    window: isolatedWindow,
    document,
    console,
    URLSearchParams,
    sessionStorage: blockedStorage,
  };
  vm.createContext(isolatedSandbox);
  vm.runInContext(code, isolatedSandbox);
  return [isolatedWindow.confengeSessionId(), isolatedWindow.confengeSessionId()];
};
const blockedSessionA = runWithBlockedSessionStorage("8e0bdd75-a332-45d8-8ec9-5d98843f0001");
const blockedSessionB = runWithBlockedSessionStorage("8e0bdd75-a332-45d8-8ec9-5d98843f0002");
if (
  blockedSessionA[0] !== blockedSessionA[1]
  || blockedSessionB[0] !== blockedSessionB[1]
  || blockedSessionA[0] === blockedSessionB[0]
) {
  console.error("FAIL: storage-blocked sessions must stay page-stable without becoming global constants", {
    blockedSessionA,
    blockedSessionB,
  });
  process.exit(1);
}

const waProtocol = sandbox.window.__CONFENGE_EVENT_CONTRACT?.appendWhatsappProtocol;
if (typeof waProtocol !== "function") {
  console.error("FAIL: WhatsApp protocol helper not exported");
  process.exit(1);
}
const waAttrs = { href: "https://wa.me/5548988344559?text=Mensagem%20existente" };
const waLink = {
  getAttribute: (key) => waAttrs[key] || "",
  setAttribute: (key, value) => { waAttrs[key] = value; },
};
const protocol = waProtocol(waLink, "e-session-abcdef12");
if (protocol !== "CFG-WA-ABCDEF12" || !decodeURIComponent(waAttrs.href.replace(/\+/g, "%20")).includes("Mensagem existente\nProtocolo CONFENGE: CFG-WA-ABCDEF12")) {
  console.error("FAIL: WhatsApp protocol not appended", { protocol, waAttrs });
  process.exit(1);
}
waProtocol(waLink, "e-session-12345678");
const decodedWa = decodeURIComponent(waAttrs.href.replace(/\+/g, "%20"));
if (!decodedWa.includes("CFG-WA-12345678") || decodedWa.includes("CFG-WA-ABCDEF12")) {
  console.error("FAIL: WhatsApp protocol not replaced idempotently", decodedWa);
  process.exit(1);
}

track("whatsapp_click", {
  page_path: "/x",
  cta_label: "ok",
  email: "should@not.pass",
  phone: "+5548999999999",
  long: "x".repeat(200),
});

const last = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (!last || last.event !== "whatsapp_click") {
  console.error("FAIL: event not pushed", last);
  process.exit(1);
}
if (last.email || last.phone || last.long) {
  console.error("FAIL: PII leaked", last);
  process.exit(1);
}
if (last.cta_label !== "ok" || last.page_path !== "/x") {
  console.error("FAIL: safe params missing", last);
  process.exit(1);
}
if (last.session_id !== firstSessionId) {
  console.error("FAIL: analytics event missing stable session id", last);
  process.exit(1);
}

track("whatsapp_click", {
  page_path: "/contato?email=should-not-pass%40example.com#mensagem",
  nested: { email: "should-not-pass@example.com" },
  list: ["should-not-pass@example.com"],
  count: 2,
  accepted: true,
});
const pathOnly = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (pathOnly.page_path !== "/contato" || pathOnly.nested || pathOnly.list) {
  console.error("FAIL: page path/query or non-primitive params leaked", pathOnly);
  process.exit(1);
}
if (pathOnly.count !== 2 || pathOnly.accepted !== true) {
  console.error("FAIL: safe primitive analytics params were lost", pathOnly);
  process.exit(1);
}
for (const unsafePath of ["/contato/ana%40example.test/", "/contato/ana%2540example.test/", "//tracker.example/collect", "/\\tracker", "/contato%0Aemail@example.test"]) {
  track("whatsapp_click", { page_path: unsafePath });
  const rejectedPath = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
  if (rejectedPath.page_path !== windowObj.location.pathname || JSON.stringify(rejectedPath).includes("ana%40example") || JSON.stringify(rejectedPath).includes("email@example")) {
    console.error("FAIL: unsafe or decoded-PII page path leaked", { unsafePath, rejectedPath });
    process.exit(1);
  }
}
track("whatsapp_click", { page_path: "/", topic: "ana%2540example.test" });
const encodedParam = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (encodedParam.topic) {
  console.error("FAIL: double-encoded PII parameter leaked", encodedParam);
  process.exit(1);
}
if (/gtag|plausible/.test(analyticsSource)) {
  console.error("FAIL: DEFER analytics source must not forward to third parties");
  process.exit(1);
}

track("lead_form_submit", {
  page_path: "/",
  journey: "contrato",
  stage_category: "problema urgente em contrato",
  nome: "Alice",
  email: "alice@example.com",
  telefone: "48988887777",
  mensagem: "conteudo sensivel do edital",
  empresa: "Construtora X",
});
const sub = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (sub.nome || sub.email || sub.telefone || sub.mensagem || sub.empresa) {
  console.error("FAIL: PII field names not stripped", sub);
  process.exit(1);
}
if (sub.journey !== "contrato" || sub.stage_category !== "problema urgente em contrato") {
  console.error("FAIL: safe enums missing", sub);
  process.exit(1);
}

track("lead_persisted", {
  page_path: "/",
  lead_id: "48999990000",
});
const taintedId = sandbox.window.dataLayer[sandbox.window.dataLayer.length - 1];
if (taintedId.lead_id) {
  console.error("FAIL: PII-like value leaked through an identifier field", taintedId);
  process.exit(1);
}

const beforeMalformed = sandbox.window.dataLayer.length;
track("lead_persisted", {
  page_path: "/",
  lead_id: "Joao Silva",
  free_text: "detalhes confidenciais",
});
if (sandbox.window.dataLayer.length !== beforeMalformed) {
  console.error("FAIL: malformed entity id event must fail closed", sandbox.window.dataLayer.at(-1));
  process.exit(1);
}

// A transport failure must retry the exact same client event IDs. The collector
// deduplicates those IDs if it persisted before a lost response, so retrying a
// 503 does not create a second measurement.
const runRetryProbe = async ({ status, optOut = false, extraEvents = 0 } = {}) => {
  const timers = [];
  const calls = [];
  const retryDocument = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    documentElement: { scrollHeight: 2000 },
    body: { classList: { remove() {}, add() {} }, getAttribute: () => null },
  };
  const retryWindow = {
    dataLayer: [],
    location: { pathname: "/", search: "", hash: "" },
    document: retryDocument,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    crypto: { randomUUID: () => "9e0bdd75-a332-45d8-8ec9-5d98843f0000" },
  };
  retryWindow.window = retryWindow;
  const retryFetch = (url, init) => {
    calls.push({ url, init });
    const responseStatus = Array.isArray(status)
      ? status[Math.min(calls.length - 1, status.length - 1)]
      : status;
    return Promise.resolve({ status: responseStatus });
  };
  const retrySandbox = {
    window: retryWindow,
    document: retryDocument,
    console,
    URLSearchParams,
    sessionStorage: retryWindow.sessionStorage,
    fetch: retryFetch,
    navigator: {},
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
  };
  retryWindow.fetch = retryFetch;
  vm.createContext(retrySandbox);
  vm.runInContext(code, retrySandbox);
  for (let i = 0; i < extraEvents; i += 1) {
    retryWindow.confengeTrack("whatsapp_click", { page_path: "/", cta_position: `probe_${i}` });
  }
  if (optOut) retryWindow.CONFENGE_ANALYTICS_OPT_OUT = true;
  const runTimer = async () => {
    const timer = timers.shift();
    if (timer) timer();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  for (let i = 0; i < 12 && timers.length; i += 1) await runTimer();
  return { calls, timers };
};
const retried = await runRetryProbe({ status: [503, 202] });
if (retried.calls.length !== 2) {
  console.error("FAIL: 503 analytics batch was not retried once", retried.calls);
  process.exit(1);
}
const retryIds = retried.calls.map((call) => JSON.parse(call.init.body).events.map((event) => event.props.event_id));
if (!retryIds[0].length || JSON.stringify(retryIds[0]) !== JSON.stringify(retryIds[1]) || !retryIds[0].every((id) => /^evt-/.test(id))) {
  console.error("FAIL: analytics retry did not preserve generated event IDs", retryIds);
  process.exit(1);
}
const clientFailure = await runRetryProbe({ status: 400 });
if (clientFailure.calls.length !== 1) {
  console.error("FAIL: permanent 4xx analytics response must not retry", clientFailure.calls);
  process.exit(1);
}
const optedOut = await runRetryProbe({ status: 503, optOut: true });
if (optedOut.calls.length !== 0) {
  console.error("FAIL: analytics opt-out must discard queued events", optedOut.calls);
  process.exit(1);
}
const drained = await runRetryProbe({ status: [503, 202], extraEvents: 30 });
const drainedEvents = drained.calls.flatMap((call) => JSON.parse(call.init.body).events);
const drainedIds = new Set(drainedEvents.map((event) => event.props.event_id));
if (drained.calls.length < 3 || drainedIds.size !== 32) {
  console.error("FAIL: retried analytics queue above one batch did not drain", { calls: drained.calls.length, ids: drainedIds.size });
  process.exit(1);
}

console.log("ANALYTICS_UNIT_OK", JSON.stringify({ last, pathOnly, submit: sub, whatsapp_protocol: protocol, retried: retryIds[0].length, drained: drained.calls.length }));
