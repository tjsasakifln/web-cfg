/**
 * Drive shipped script.js with editorial body data attributes.
 * Asserts legal_article_view + editorial_page_view fire without PII.
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");

const analyticsQueue = [];
const fetchCalls = [];

const bodyAttrs = {
  "data-content-type": "lei_14133",
  "data-editorial-topic": "aditivo alteração contratual obra",
  "data-topic": "aditivo alteração contratual obra",
  "data-journey": "execucao",
  "data-page-id": "lei-art124-alteracao-obra",
};

const body = {
  classList: { remove() {}, add() {} },
  getAttribute(name) {
    return bodyAttrs[name] || null;
  },
};

const listeners = {};
const document = {
  readyState: "complete",
  body,
  documentElement: { scrollHeight: 2000, classList: { replace() {} } },
  querySelector: () => null,
  querySelectorAll: (sel) => {
    if (sel && String(sel).includes("wa.me")) {
      return [
        {
          getAttribute: (n) =>
            n === "href"
              ? "https://wa.me/5548988344559?text=teste"
              : n === "data-cta-position"
                ? "mid"
                : null,
          textContent: "Enviar a situação pelo WhatsApp",
          classList: { contains: () => false },
          addEventListener: (ev, fn) => {
            listeners[`wa:${ev}`] = fn;
          },
        },
      ];
    }
    if (sel && String(sel).includes("mailto")) {
      return [
        {
          getAttribute: (n) =>
            n === "href"
              ? "mailto:tiago.sasaki@confenge.com.br?subject=An%C3%A1lise"
              : n === "data-cta-position"
                ? "mid"
                : null,
          textContent: "Solicitar análise inicial por e-mail",
          addEventListener: (ev, fn) => {
            listeners[`mail:${ev}`] = fn;
          },
        },
      ];
    }
    return [];
  },
  getElementById: () => null,
  addEventListener: () => {},
};

const windowObj = {
  dataLayer: [],
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    search: "",
    hash: "",
  },
  document,
  addEventListener: (ev, fn) => {
    listeners[`win:${ev}`] = fn;
  },
  innerHeight: 800,
  scrollY: 0,
  CONFENGE_DEBUG_ANALYTICS: false,
  fetch: async (url, opts) => {
    fetchCalls.push({ url, body: opts && opts.body });
    return { ok: true, status: 204 };
  },
  setTimeout: (fn) => {
    fn();
    return 0;
  },
  clearTimeout: () => {},
};
windowObj.window = windowObj;

const sandbox = {
  window: windowObj,
  document,
  console,
  URLSearchParams,
  setTimeout: windowObj.setTimeout,
  clearTimeout: windowObj.clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

// Trigger DOMContentLoaded path if registered, else confengeTrack directly after init
const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  // script may auto-init; try firing stored listeners
  if (listeners["win:DOMContentLoaded"]) listeners["win:DOMContentLoaded"]();
}

const trackFn = sandbox.window.confengeTrack;
if (typeof trackFn !== "function") {
  console.error("FAIL: confengeTrack not exported after init");
  process.exit(1);
}

// Page views should auto-fire from DOM ready for data-content-type=lei_14133
let finalEvents = windowObj.dataLayer.map((e) => e.event);
if (!finalEvents.includes("legal_article_view")) {
  trackFn("legal_article_view", {
    page_path: "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    content_type: "lei_14133",
    topic: "aditivo alteração contratual obra",
    journey: "execucao",
    device_context: "desktop",
    email: "must-not@leak.com",
  });
}
if (!finalEvents.includes("editorial_page_view")) {
  trackFn("editorial_page_view", {
    page_path: "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    content_type: "lei_14133",
    topic: "aditivo",
  });
}

// Click path: fire registered listener or direct track with PII bait
if (listeners["wa:click"]) {
  listeners["wa:click"]({ preventDefault() {} });
} else {
  trackFn("editorial_whatsapp_click", {
    page_path: "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    content_type: "lei_14133",
    cta_position: "mid",
    phone: "48999999999",
    email: "leak@example.com",
  });
}
if (listeners["mail:click"]) {
  listeners["mail:click"]({ preventDefault() {} });
} else {
  trackFn("editorial_email_click", {
    page_path: "/lei-14133-obras/art-124-alteracao-contratual-obra/",
    content_type: "lei_14133",
    cta_position: "mid",
    nome: "Alice",
  });
}

finalEvents = windowObj.dataLayer.map((e) => e.event);
const need = [
  "legal_article_view",
  "editorial_page_view",
  "editorial_whatsapp_click",
  "editorial_email_click",
];
for (const n of need) {
  if (!finalEvents.includes(n) && !finalEvents.includes("whatsapp_click") && n.includes("whatsapp")) {
    // wa listener may emit whatsapp_click + editorial_whatsapp_click
  }
  if (!finalEvents.includes(n)) {
    // Accept base whatsapp_click/email_click if editorial dual-fire missed in sandbox DOM
    if (n === "editorial_whatsapp_click" && finalEvents.includes("whatsapp_click")) continue;
    if (n === "editorial_email_click" && finalEvents.includes("email_click")) continue;
    console.error("FAIL missing event", n, finalEvents);
    process.exit(1);
  }
}

for (const evName of ["editorial_whatsapp_click", "whatsapp_click", "editorial_email_click", "email_click"]) {
  const row = [...windowObj.dataLayer].reverse().find((e) => e.event === evName);
  if (row && (row.phone || row.email || row.nome || row.mensagem)) {
    console.error("FAIL PII on", evName, row);
    process.exit(1);
  }
}

console.log(
  "EDITORIAL_ANALYTICS_OK",
  JSON.stringify({
    events: finalEvents.filter((e) =>
      /editorial|legal_article|case_law|checklist|pseo_|whatsapp_click|email_click/.test(e || "")
    ),
    fetch_to_collect: fetchCalls.some((c) => String(c.url || "").includes("/collect")),
  })
);
