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
const formSource = fs.readFileSync(path.join(root, "js/modules/form.js"), "utf8");

if (!formSource.includes("fetch('/api/web/lead'") || formSource.includes("fetch('/.netlify/functions/lead'")) {
  console.error("FAIL: browser form must use the canonical Netcup lead route");
  process.exit(1);
}

if (!formSource.includes("lead_id: protocol")) {
  console.error("FAIL: persisted analytics does not carry the server receipt id");
  process.exit(1);
}
for (const needle of ["validationCategory", "validation_category: 'rate_limited'"]) {
  if (!formSource.includes(needle)) {
    console.error("FAIL: form validation category source missing", needle);
    process.exit(1);
  }
}

// Structural: shipped home has multi-step form + journey CTAs
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const needle of [
  'data-form-multistep="true"',
  'name="diagnostico-b2g"',
  "Solicitar canal seguro para envio",
  "Registrar situação para triagem",
  'data-set-journey="contrato"',
  'data-journey="edital"',
  'data-journey="operacao"',
  'id="estagio"',
  'data-form-step="1"',
  'data-form-step="2"',
  'id="faixa_contrato"',
  'id="risco_em_jogo"',
  'id="frequencia"',
  'id="maturidade_documental"',
  'id="capacidade_interna"',
  'name="consentimento"',
  'data-offer-fit-hint',
]) {
  if (!home.includes(needle)) {
    console.error("FAIL: home missing", needle);
    process.exit(1);
  }
}
// The home capture must describe itself truthfully. MV-09 scoped this form to
// the public-works vertical and pinned the literal phrase "Triagem para obras
// públicas"; #616 broadened the same form to the five canonical nuclei, so that
// phrase became a contradiction printed next to a select offering perícia,
// avaliação, SST and obra privada. The decision to supersede it is registered in
// issue #611. What is asserted now is the intent behind the original rule: the
// copy may not claim a scope narrower than what the form accepts, and the B2G
// path must remain explicitly available rather than diluted away.
{
  const stageSelect = (home.match(/<select id="estagio"[\s\S]*?<\/select>/) || [""])[0];
  const nuclei = [...stageSelect.matchAll(/data-nucleus="([^"]+)"/g)].map((m) => m[1]);
  const servesPrivateNeeds = nuclei.some((n) => n !== "public_works_b2g");
  const contactCopy = (home.match(/<div class="contact-copy">[\s\S]*?<\/div>/) || [""])[0];
  const claimsPublicWorksOnly = /formul[áa]rio preservado desta vertical|Triagem para obras p[úu]blicas/i
    .test(contactCopy);
  if (servesPrivateNeeds && claimsPublicWorksOnly) {
    console.error("FAIL: the capture serves private nuclei but its copy scopes it to public works only");
    process.exit(1);
  }
  // The B2G path is preserved, not removed: the five public-works situations and
  // their journeys must still be offered.
  const b2gOptions = (stageSelect.match(/data-nucleus="public_works_b2g"/g) || []).length;
  if (b2gOptions < 5) {
    console.error(`FAIL: the public-works path lost options (${b2gOptions} of 5)`);
    process.exit(1);
  }
  for (const journey of ['data-journey="edital"', 'data-journey="contrato"', 'data-journey="operacao"']) {
    if (!stageSelect.includes(journey)) {
      console.error(`FAIL: the public-works path lost ${journey}`);
      process.exit(1);
    }
  }
}
const formMatch = home.match(/<form\b[^>]*id="formulario-contato"[\s\S]*?<\/form>/);
if (!formMatch) {
  console.error("FAIL: home form missing");
  process.exit(1);
}
const step1 = formMatch[0].match(/data-form-step="1"[\s\S]*?<\/fieldset>/);
if (!step1) {
  console.error("FAIL: form step 1 missing");
  process.exit(1);
}
for (const bad of ["cnpj", "cpf", 'type="file"', "faixa_contrato", "risco_em_jogo"]) {
  if (step1[0].includes(bad === "cnpj" || bad === "cpf" ? bad : bad)) {
    if (["cnpj", "cpf", 'type="file"'].includes(bad) && step1[0].includes(bad)) {
      console.error("FAIL: sensitive field in step 1", bad);
      process.exit(1);
    }
  }
}
if (/name="(cnpj|cpf)"/i.test(step1[0]) || /type="file"/i.test(step1[0])) {
  console.error("FAIL: step 1 asks sensitive data");
  process.exit(1);
}
if (step1[0].includes("faixa_contrato") || step1[0].includes("risco_em_jogo")) {
  console.error("FAIL: ICP fields must stay off step 1");
  process.exit(1);
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
for (const f of ["obrigado-contrato.html", "obrigado-edital.html"]) {
  const t = fs.readFileSync(path.join(root, f), "utf8");
  if (!t.includes("id=\"receipt-id\"") || !t.includes("canal escolhido posteriormente") || !t.includes("Solicitar canal seguro para envio")) {
    console.error("FAIL: confirmation missing persisted protocol or B SLA", f);
    process.exit(1);
  }
  if (/type\s*=\s*['"]file['"]/i.test(t)) {
    console.error("FAIL: confirmation has file input", f);
    process.exit(1);
  }
}
if (!home.includes('id="canal_seguro"') || !home.includes('name="document_intent"')) {
  console.error("FAIL: home form missing secure-channel fields");
  process.exit(1);
}
if (/type\s*=\s*['"]file['"]/i.test(home)) {
  console.error("FAIL: home capture form has type=file");
  process.exit(1);
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
track("lead_form_error", {
  page_path: "/",
  validation_category: "contact_format",
  field: "email",
  field_value: "leak@example.com",
  native_message: "Invalid email",
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
const validation = dataLayer.find((e) => e.event === "lead_form_error");
if (!validation || validation.validation_category !== "contact_format") {
  console.error("FAIL: validation category missing", validation);
  process.exit(1);
}
for (const key of ["field", "field_value", "native_message"]) {
  if (validation[key] != null) {
    console.error("FAIL: validation PII/debug key leaked", { key, validation });
    process.exit(1);
  }
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
