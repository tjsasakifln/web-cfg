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

const dataLayer = [];
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
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;

const sandbox = { window: windowObj, document, console, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  console.error("FAIL: confengeTrack not exported");
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

console.log("ANALYTICS_UNIT_OK", JSON.stringify({ last, submit: sub, whatsapp_protocol: protocol }));
