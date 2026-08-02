/**
 * Drives shipped script.js multi-step form + asserts analytics without PII.
 */
import fs from "fs";
import vm from "vm";
import { URLSearchParams } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");

// Structural: shipped home has multi-step form + journey CTAs
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const needle of [
  'data-form-multistep="true"',
  'name="diagnostico-b2g"',
  "Enviar documentos para análise",
  "Enviar edital para triagem",
  "Diagnosticar operação B2G",
  'data-set-journey="contrato"',
  'data-set-journey="edital"',
  'data-set-journey="operacao"',
  'id="estagio"',
  'data-form-step="1"',
  'data-form-step="2"',
]) {
  if (!home.includes(needle)) {
    console.error("FAIL: home missing", needle);
    process.exit(1);
  }
}
// No visitor-facing marketing metalinguage on the conversion surface
for (const leak of ["Sem CTA genérico", "Jornada A", "Jornada B", "Jornada C", "Risco de não agir"]) {
  if (home.includes(leak)) {
    console.error("FAIL: metalinguage leak on home", leak);
    process.exit(1);
  }
}
for (const f of ["obrigado-contrato.html", "obrigado-edital.html", "obrigado-operacao.html"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (!t.includes("data-lead-success") || !t.includes("wa.me")) {
    console.error("FAIL: confirmation page incomplete", f);
    process.exit(1);
  }
}

// Unit: track() redacts PII (real shipped function)
const dataLayer = [];
const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ type: "", name: "", value: "" }),
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: { classList: { remove() {}, add() {} }, getAttribute: () => null },
};
const windowObj = {
  dataLayer,
  matchMedia: () => ({ matches: false }),
  location: { pathname: "/", search: "", hash: "" },
  document,
  addEventListener: () => {},
  innerHeight: 800,
  scrollY: 0,
  sessionStorage: { getItem: () => null, setItem: () => {} },
  CONFENGE_DEBUG_ANALYTICS: false,
};
windowObj.window = windowObj;
const sandbox = { window: windowObj, document, console, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const track = sandbox.window.confengeTrack;
if (typeof track !== "function") {
  console.error("FAIL: confengeTrack missing");
  process.exit(1);
}

// Simulate funnel events the shipped code emits (same names/params shape)
track("lead_form_start", { page_path: "/", journey: "contrato", device_context: "desktop" });
track("lead_form_step", { page_path: "/", form_step: 2, journey: "contrato", stage_category: "problema urgente em contrato" });
track("lead_form_submit", {
  page_path: "/",
  journey: "contrato",
  stage_category: "problema urgente em contrato",
  urgency_category: "até 48 horas",
  nome: "should-not-pass",
  email: "leak@example.com",
  telefone: "+5548999999999",
  mensagem: "secret document text",
});
track("whatsapp_click", { page_path: "/", journey: "contrato", cta_position: "hero" });
track("email_click", { page_path: "/", destination_type: "email" });
track("service_page_view", { page_path: "/defesa-margem-contratos-publicos/", offer_id: "contract-defense" });

const events = dataLayer.map((e) => e.event);
for (const need of [
  "lead_form_start",
  "lead_form_step",
  "lead_form_submit",
  "whatsapp_click",
  "email_click",
  "service_page_view",
]) {
  if (!events.includes(need)) {
    console.error("FAIL: missing event", need, events);
    process.exit(1);
  }
}
const blob = JSON.stringify(dataLayer);
for (const bad of ["should-not-pass", "leak@example.com", "+5548999999999", "secret document text"]) {
  if (blob.includes(bad)) {
    console.error("FAIL: PII leaked", bad);
    process.exit(1);
  }
}
// journey preserved on submit without PII
const sub = dataLayer.find((e) => e.event === "lead_form_submit");
if (sub.journey !== "contrato" || sub.nome || sub.email || sub.telefone || sub.mensagem) {
  console.error("FAIL: submit payload", sub);
  process.exit(1);
}

// Script source must implement multi-step + journey actions
for (const needle of [
  "lead_form_step",
  "obrigado-contrato",
  "obrigado-edital",
  "obrigado-operacao",
  "applyJourneyToForm",
  "data-form-next",
  "utm_source",
]) {
  if (!code.includes(needle)) {
    console.error("FAIL: script.js missing", needle);
    process.exit(1);
  }
}

console.log(
  "FORM_FUNNEL_OK",
  JSON.stringify({
    events: [...new Set(events)],
    submit_journey: sub.journey,
    home_multistep: true,
  }),
);
