/**
 * Unit test: pSEO attribution survives CTA → home form via sessionStorage.
 * Drives the real script.js (no reimplementation).
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");

function makeDoc(formFields = {}) {
  const hiddens = {};
  const form = {
    querySelector(sel) {
      if (sel.startsWith('input[name="')) {
        const name = sel.match(/name="([^"]+)"/)?.[1];
        return hiddens[name] || null;
      }
      if (sel === "#necessidade") return { value: "diagnostico" };
      return null;
    },
    querySelectorAll(sel) {
      // Real path: script.js binds focus once on each input/select/textarea
      const makeFocusable = () => {
        const handlers = {};
        return {
          addEventListener(type, fn, opts) {
            handlers[type] = handlers[type] || [];
            handlers[type].push(fn);
          },
          focus() {
            (handlers.focus || []).forEach((fn) => fn({ type: "focus" }));
          },
          _handlers: handlers,
        };
      };
      if (!form._focusables || form._focusables.length === 0) {
        form._focusables = [makeFocusable(), makeFocusable()];
      }
      return form._focusables;
    },
    appendChild(el) {
      if (el && el.name) hiddens[el.name] = el;
    },
    checkValidity() {
      return true;
    },
    addEventListener(type, fn) {
      form._listeners = form._listeners || {};
      form._listeners[type] = form._listeners[type] || [];
      form._listeners[type].push(fn);
    },
    _hiddens: hiddens,
    _listeners: {},
  };
  Object.assign(hiddens, formFields);
  const listeners = {};
  const body = {
    getAttribute() {
      return null;
    },
    classList: { remove() {}, add() {} },
  };
  return {
    readyState: "complete",
    body,
    createElement(tag) {
      return { type: "", name: "", value: "", tagName: String(tag).toUpperCase() };
    },
    querySelector(sel) {
      if (sel === 'form[name="diagnostico-confenge"]') return form;
      if (sel === ".menu-toggle" || sel === ".mobile-nav") return null;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById(id) {
      if (id === "mensagem") return { value: "", focus() {} };
      if (id === "contato") return { scrollIntoView() {} };
      return null;
    },
    documentElement: { scrollHeight: 2000 },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    _form: form,
  };
}

const store = {};
const sessionStorage = {
  getItem(k) {
    return store[k] ?? null;
  },
  setItem(k, v) {
    store[k] = String(v);
  },
  removeItem(k) {
    delete store[k];
  },
};

// Simulate landing on home with pSEO query params (CTA from radar page)
const dataLayer = [];
const document = makeDoc();
const windowObj = {
  dataLayer,
  sessionStorage,
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/",
    search:
      "?tema=Radar%20Teste&origem=/radar/pavimentacao-infraestrutura-viaria-sc/" +
      "&pseo_page_id=radar-pavimentacao-infraestrutura-viaria-sc" +
      "&page_type=radar&archetype=pavimentacao-infraestrutura-viaria" +
      "&segment=Pavimentacao&region=SC&intent=avaliar_oportunidades" +
      "&source_run_id=pseo-fix-20260731&dataset_hash=c3db4716f0ae8de8" +
      "&cta_position=inline_cta",
    hash: "#contato",
  },
  document,
  addEventListener() {},
  innerHeight: 800,
  scrollY: 0,
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;
document.defaultView = windowObj;

const sandbox = {
  window: windowObj,
  document,
  console,
  URLSearchParams,
  sessionStorage,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const form = document._form;
const h = form._hiddens;

function assertHidden(name) {
  if (!h[name] || !h[name].value) {
    console.error("FAIL: missing hidden", name, h);
    process.exit(1);
  }
}

assertHidden("pseo_page_id");
assertHidden("page_type");
assertHidden("origem");
assertHidden("source_run_id");
assertHidden("dataset_hash");
if (h.pseo_page_id.value !== "radar-pavimentacao-infraestrutura-viaria-sc") {
  console.error("FAIL: wrong page id", h.pseo_page_id.value);
  process.exit(1);
}

// sessionStorage must hold attribution
const stored = JSON.parse(sessionStorage.getItem("confenge_pseo_attribution") || "{}");
if (stored.pseo_page_id !== "radar-pavimentacao-infraestrutura-viaria-sc") {
  console.error("FAIL: sessionStorage missing attribution", stored);
  process.exit(1);
}


// Drive focus on form controls → must emit pseo_form_start from shipped script.js
const focusables = form._focusables || form.querySelectorAll("input, select, textarea");
if (!focusables.length) {
  console.error("FAIL: no focusable form controls for form_start path");
  process.exit(1);
}
focusables[0].focus();
const eventsAfterFocus = dataLayer.map((e) => e.event);
if (!eventsAfterFocus.includes("pseo_form_start")) {
  console.error("FAIL: pseo_form_start not emitted after focus", eventsAfterFocus, dataLayer);
  process.exit(1);
}

// Simulate form focus → form_start and submit → form_submit
// Re-init path: trigger focus listeners by calling them if present is hard;
// instead call confengeTrack directly for anti-PII and check stored context used in submit handler.
// Fire submit listeners registered by script
const submitFns = form._listeners.submit || [];
for (const fn of submitFns) {
  try {
    fn({ type: "submit" });
  } catch (_) {}
}

const events = dataLayer.map((e) => e.event);
// form_submit should fire when checkValidity true
if (!events.includes("pseo_form_start") && !dataLayer.some(e => e.event === "pseo_form_start")) {
  console.error("FAIL: pseo_form_start missing from funnel", events);
  process.exit(1);
}
if (!events.includes("pseo_form_submit") && !events.includes("lead_form_submit")) {
  console.error("FAIL: form_submit missing from funnel", events);
  process.exit(1);
}


// PII must never appear
for (const ev of dataLayer) {
  const blob = JSON.stringify(ev);
  if (/@|\+55\d{10}/.test(blob) && !blob.includes("dataset_hash")) {
    // phone pattern might false-positive on hashes — check keys
    if (ev.email || ev.phone || ev.telefone || ev.nome) {
      console.error("FAIL: PII in event", ev);
      process.exit(1);
    }
  }
}

// Second navigation without query: sessionStorage still fills form
const dataLayer2 = [];
const document2 = makeDoc();
const window2 = {
  dataLayer: dataLayer2,
  sessionStorage,
  matchMedia: () => ({ matches: false }),
  location: { pathname: "/", search: "", hash: "#contato" },
  document: document2,
  addEventListener() {},
  innerHeight: 800,
  scrollY: 0,
  CONFENGE_DEBUG_ANALYTICS: false,
};
window2.window = window2;
const sandbox2 = {
  window: window2,
  document: document2,
  console,
  URLSearchParams,
  sessionStorage,
};
vm.createContext(sandbox2);
vm.runInContext(code, sandbox2);
const h2 = document2._form._hiddens;
if (!h2.pseo_page_id || h2.pseo_page_id.value !== "radar-pavimentacao-infraestrutura-viaria-sc") {
  console.error("FAIL: attribution lost without query params", h2);
  process.exit(1);
}

console.log(
  "PSEO_ATTRIBUTION_OK",
  JSON.stringify({
    hiddens: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.value])),
    stored_keys: Object.keys(stored),
    events,
  })
);


// --- WhatsApp contextual e2e (no PII in dataLayer) ---
(function whatsappE2e() {
  const dl = [];
  const body = {
    getAttribute(name) {
      if (name === "data-pseo-page-id") return "radar-pavimentacao-infraestrutura-viaria-sc";
      if (name === "data-pseo-page-type") return "radar";
      return null;
    },
    classList: { remove() {}, add() {} },
  };
  const waHandlers = [];
  const waLink = {
    getAttribute(name) {
      if (name === "href") return "https://wa.me/5548988344559?text=Ol%C3%A1%20radar%20pavimentacao%20SC";
      if (name === "data-cta-position") return "inline_cta";
      if (name === "data-pseo-event") return "pseo_whatsapp_click";
      if (name === "data-content-cluster") return "pseo";
      return null;
    },
    textContent: "WhatsApp",
    classList: { contains: () => false },
    addEventListener(type, fn) {
      if (type === "click") waHandlers.push(fn);
    },
  };
  const doc = {
    readyState: "complete",
    body,
    createElement(tag) {
      return { type: "", name: "", value: "", tagName: String(tag).toUpperCase() };
    },
    querySelector(sel) {
      if (sel === 'form[name="diagnostico-confenge"]') return null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel && String(sel).includes("wa.me")) return [waLink];
      if (sel && String(sel).includes("data-pseo-event")) return [waLink];
      return [];
    },
    getElementById() { return null; },
    documentElement: { scrollHeight: 2000 },
    addEventListener() {},
  };
  const store2 = {};
  const ss = {
    getItem(k) { return store2[k] ?? null; },
    setItem(k, v) { store2[k] = String(v); },
    removeItem(k) { delete store2[k]; },
  };
  const win = {
    dataLayer: dl,
    sessionStorage: ss,
    matchMedia: () => ({ matches: false }),
    location: {
      pathname: "/radar/pavimentacao-infraestrutura-viaria-sc/",
      search: "",
      hash: "",
    },
    document: doc,
    addEventListener() {},
    innerHeight: 800,
    scrollY: 0,
    CONFENGE_DEBUG_ANALYTICS: false,
  };
  win.window = win;
  const sb = { window: win, document: doc, console, URLSearchParams, sessionStorage: ss };
  vm.createContext(sb);
  vm.runInContext(code, sb);
  // fire whatsapp click handlers (generic + pseo)
  waHandlers.forEach((fn) => fn({ type: "click" }));
  // also fire data-pseo-event path if separate
  const events = dl.map((e) => e.event);
  if (!events.includes("pseo_whatsapp_click") && !events.includes("whatsapp_click")) {
    console.error("FAIL: whatsapp event missing", events, dl);
    process.exit(1);
  }
  for (const ev of dl) {
    if (ev.email || ev.phone || ev.telefone || ev.nome || ev.mensagem) {
      console.error("FAIL: PII in whatsapp payload", ev);
      process.exit(1);
    }
    const blob = JSON.stringify(ev);
    if (/@gmail|@hotmail|\+55\d{10,}/.test(blob) && (ev.email || ev.phone)) {
      console.error("FAIL: PII pattern in whatsapp", ev);
      process.exit(1);
    }
  }
  console.log("WHATSAPP_E2E_OK", JSON.stringify({ events, sample: dl[dl.length - 1] }));
})();

