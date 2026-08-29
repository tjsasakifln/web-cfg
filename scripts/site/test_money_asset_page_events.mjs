/**
 * Drives the shipped Money Asset page script + script.js.
 * Asserts asset_view / organic_landing fire only after confengeTrack exists,
 * cta_view on visibility, and cta_click + lead_persisted on the real submit path.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pageHtml = fs.readFileSync(
  path.join(root, "ferramentas/diagnostico-defesa-margem/index.html"),
  "utf8",
);
const inlineMatch = pageHtml.match(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/);
if (!inlineMatch) {
  console.error("FAIL: shipped page has no Money Asset inline script");
  process.exit(1);
}
if (!inlineMatch[1].includes("whenTrackReady")) {
  console.error("FAIL: shipped page does not wait for confengeTrack");
  process.exit(1);
}
if (/if \(typeof window\.confengeTrack === "function"\) \{\s*window\.confengeTrack\("asset_view"/.test(inlineMatch[1])) {
  console.error("FAIL: asset_view still fires synchronously before script.js");
  process.exit(1);
}

const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, "ferramentas/diagnostico-defesa-margem/snapshot.json"), "utf8"),
);
const diagnoseSrc = fs.readFileSync(path.join(root, "assets/js/diagnose-margin.js"), "utf8");
const scriptSrc = fs.readFileSync(path.join(root, "script.js"), "utf8");

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
    hidden: false,
    disabled: false,
    textContent: init.textContent || "",
    innerHTML: "",
    href: init.href || "",
    elements: init.elements || [],
    children,
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    style: {},
    getAttribute(name) {
      if (name === "href") return el.href;
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete attrs[name];
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
      if (sel.startsWith(".")) return all.find((n) => (n.className || "").includes(sel.slice(1))) || null;
      if (sel.startsWith("[name=")) {
        const name = sel.slice(7, -2);
        return all.find((n) => n.name === name) || null;
      }
      if (sel === "[type=\"submit\"]" || sel === '[type="submit"]') {
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
    checkValidity() {
      return true;
    },
    reportValidity() {
      return true;
    },
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

const byId = {};
const fields = {
  "lookup-status": makeEl({ id: "lookup-status" }),
  lookup: makeEl({ id: "lookup", tagName: "FORM" }),
  qid: makeEl({ id: "qid", name: "q" }),
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
  "segunda-leitura": makeEl({
    id: "segunda-leitura",
    attrs: { "data-cta-id": "segunda-leitura-contrato" },
  }),
  nome: makeEl({ id: "nome", name: "nome", value: "QA Page" }),
  telefone: makeEl({ id: "telefone", name: "telefone", value: "" }),
  email: makeEl({ id: "email", name: "email", value: "qa-page@example.com" }),
  consentimento: makeEl({ id: "consentimento", name: "consentimento", value: "on" }),
  mensagem: makeEl({ id: "mensagem", name: "mensagem", value: "ok" }),
  "jornada-hidden": makeEl({ id: "jornada-hidden", name: "jornada", value: "contrato" }),
};
Object.assign(byId, fields);

const hidden = [
  makeEl({ name: "form-name", value: "segunda-leitura-contrato" }),
  makeEl({ name: "origem", value: "/ferramentas/diagnostico-defesa-margem/" }),
  makeEl({ name: "estagio", value: "problema urgente em contrato" }),
  makeEl({ name: "asset_id", value: "diagnostico-defesa-margem" }),
  makeEl({ name: "route_family", value: "defesa-margem-diagnostico" }),
  makeEl({ name: "cta_id", value: "segunda-leitura-contrato" }),
  makeEl({ name: "landing_page", value: "/ferramentas/diagnostico-defesa-margem/" }),
  byId["public-contract-id"],
  byId["public-id-slug"],
  byId["jornada-hidden"],
  byId.nome,
  byId.email,
  byId.telefone,
  byId.consentimento,
  byId.mensagem,
];
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

const docListeners = {};
const observers = [];
class IntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    observers.push(this);
  }
  observe(target) {
    this.target = target;
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

const dataLayer = [];
const document = {
  readyState: "loading",
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
  getElementById(id) {
    return byId[id] || null;
  },
  querySelector(sel) {
    if (sel === 'form[name="diagnostico-b2g"], form[name="diagnostico-confenge"]') return form;
    if (sel === 'form[name="diagnostico-b2g"]') return form;
    if (sel === "#segunda-leitura") return byId["segunda-leitura"];
    if (sel.startsWith("#")) return byId[sel.slice(1)] || null;
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return makeEl();
  },
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
    assign() {},
  },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  innerHeight: 800,
  scrollY: 0,
  sessionStorage: { getItem: () => null, setItem() {} },
  IntersectionObserver,
  fetch: async (url) => {
    if (String(url).includes("snapshot.json")) {
      return { json: async () => snapshot };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ ok: true, lead_id: "lead-page-test-001" }),
    };
  },
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;

class FormDataPoly {
  constructor(target) {
    this.map = new Map();
    for (const node of target.elements || []) {
      if (node.name) this.map.set(node.name, node.value);
    }
  }
  get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  set(key, value) {
    this.map.set(key, value);
  }
  forEach(fn) {
    this.map.forEach((value, key) => fn(value, key));
  }
}

const sandbox = {
  window: windowObj,
  document,
  console,
  URLSearchParams,
  FormData: FormDataPoly,
  IntersectionObserver,
  fetch: windowObj.fetch,
  AbortController,
  setTimeout,
  clearTimeout,
  sessionStorage: windowObj.sessionStorage,
};
vm.createContext(sandbox);

vm.runInContext(diagnoseSrc, sandbox);
if (typeof sandbox.window.ConfengeDiagnoseMargin?.diagnoseMargin !== "function") {
  console.error("FAIL: diagnose-margin.js did not export");
  process.exit(1);
}

// Honest order: inline page script runs before deferred script.js.
vm.runInContext(inlineMatch[1], sandbox);
const before = dataLayer.map((e) => e.event);
if (before.includes("asset_view") || before.includes("organic_landing")) {
  console.error("FAIL: page events fired before script.js", before);
  process.exit(1);
}

vm.runInContext(scriptSrc, sandbox);
if (typeof sandbox.window.confengeTrack !== "function") {
  console.error("FAIL: script.js did not export confengeTrack");
  process.exit(1);
}
if (dataLayer.some((e) => e.event === "asset_view")) {
  console.error("FAIL: asset_view fired before DOMContentLoaded");
  process.exit(1);
}

document.readyState = "complete";
for (const fn of docListeners.DOMContentLoaded || []) fn();

const names = dataLayer.map((e) => e.event);
if (!names.includes("asset_view") || !names.includes("organic_landing")) {
  console.error("FAIL: missing load events", names);
  process.exit(1);
}
const view = dataLayer.find((e) => e.event === "asset_view");
if (view.asset_id !== "diagnostico-defesa-margem" || view.route_family !== "defesa-margem-diagnostico") {
  console.error("FAIL: asset_view missing attribution", view);
  process.exit(1);
}

for (const obs of observers) {
  if (!obs.target || obs.target.id !== "segunda-leitura") continue;
  obs.cb([{ isIntersecting: true, target: obs.target }]);
}
if (!dataLayer.some((e) => e.event === "cta_view" && e.cta_id === "segunda-leitura-contrato")) {
  console.error("FAIL: cta_view missing", dataLayer);
  process.exit(1);
}

const submitEvent = { type: "submit", preventDefault() {} };
form.dispatchEvent(submitEvent);
for (let i = 0; i < 15 && !dataLayer.some((e) => e.event === "lead_persisted"); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

const afterSubmit = dataLayer.map((e) => e.event);
if (!afterSubmit.includes("cta_click")) {
  console.error("FAIL: cta_click missing on real submit", afterSubmit);
  process.exit(1);
}
const click = dataLayer.find((e) => e.event === "cta_click");
if (
  click.asset_id !== "diagnostico-defesa-margem" ||
  click.route_family !== "defesa-margem-diagnostico" ||
  click.cta_id !== "segunda-leitura-contrato"
) {
  console.error("FAIL: cta_click attribution", click);
  process.exit(1);
}
if (!afterSubmit.includes("lead_persisted")) {
  console.error("FAIL: lead_persisted missing from real success path", afterSubmit);
  process.exit(1);
}
const created = dataLayer.find((e) => e.event === "lead_persisted");
if (
  created.asset_id !== "diagnostico-defesa-margem" ||
  created.route_family !== "defesa-margem-diagnostico" ||
  created.public_id_slug !== "md-8569b618" ||
  created.source !== "CONFENGE_WEB"
) {
  console.error("FAIL: lead_persisted attribution", created);
  process.exit(1);
}
if (JSON.stringify(dataLayer).includes("qa-page@") || JSON.stringify(dataLayer).includes("QA Page")) {
  console.error("FAIL: PII in analytics", dataLayer);
  process.exit(1);
}

console.log("MONEY_ASSET_PAGE_EVENTS_OK", {
  load: ["asset_view", "organic_landing"].every((n) => names.includes(n)),
  cta_view: true,
  cta_click: true,
  lead_persisted: true,
});
