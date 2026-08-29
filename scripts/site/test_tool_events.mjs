/**
 * Assert tools emit canonical event names on the shipped path (static + tools-common).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let failed = 0;
function pass(n, d = "") {
  console.log("PASS", n, d);
}
function fail(n, d) {
  console.error("FAIL", n, d);
  failed += 1;
}

const required = [
  "tool_view",
  "tool_start",
  "tool_complete",
  "tool_download",
  "tool_to_offer",
  "tool_to_whatsapp",
  "tool_to_form",
];

const common = readFileSync(resolve(ROOT, "assets/js/tools-common.js"), "utf8");
for (const ev of required) {
  if (!common.includes(ev) && !common.includes(`"${ev}"`) && !common.includes(`'${ev}'`)) {
    // bindToolLifecycle emits these as string literals
    if (!new RegExp(ev).test(common)) fail("common_has_" + ev);
    else pass("common_has_" + ev);
  } else pass("common_has_" + ev);
}
if (!common.includes("bindToolLifecycle")) fail("bindToolLifecycle");
else pass("bindToolLifecycle");
if (!common.includes("confengeTrack")) fail("uses_confengeTrack");
else pass("uses_confengeTrack");

const tools = [
  "ferramentas/limite-acrescimos-supressoes/index.html",
  "ferramentas/checklist-reequilibrio/index.html",
  "ferramentas/matriz-atraso-obra/index.html",
  "ferramentas/diagnostico-defesa-margem/index.html",
];
for (const rel of tools) {
  const t = readFileSync(resolve(ROOT, rel), "utf8");
  if (!t.includes("bindToolLifecycle")) fail("bind_" + rel);
  else pass("bind_" + rel);
  if (!t.includes("tool_complete")) fail("complete_" + rel);
  else pass("complete_" + rel);
  if (!existsSync(resolve(ROOT, rel))) fail("exists_" + rel);
}

{
  const src = readFileSync(resolve(ROOT, "assets/js/tools-common.js"), "utf8");
  const dataLayer = [];
  const documentListeners = {};
  const sandbox = {
    window: { dataLayer, confengeTrack(name, props) { dataLayer.push({ event: name, ...props }); } },
    document: {
      querySelectorAll() { return []; },
      addEventListener(name, fn) { documentListeners[name] = fn; },
    },
    console,
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const T = sandbox.window.ConfengeTools;
  if (!T || typeof T.scrubProps !== "function") fail("scrubProps_exported");
  else pass("scrubProps_exported");
  const dirty = T.scrubProps({
    tool: "limite-acrescimos",
    level: "bad",
    email: "a@b.c",
    phone: "48999999999",
    nome: "Alice",
    cnpj: "52.407.089/0001-09",
    valor: "10000000",
    valorInicial: "10.000.000",
    q: "83102277000152",
    query: "itajai",
    causa: "texto livre do evento",
    observacao: "nota sensível",
    mensagem: "livre",
  });
  const leaked = ["email","phone","nome","cnpj","valor","valorInicial","q","query","causa","observacao","mensagem"]
    .filter((k) => Object.prototype.hasOwnProperty.call(dirty, k));
  if (leaked.length) fail("scrub_leaked", leaked);
  else pass("scrub_no_money_cnpj_pii");
  if (dirty.tool !== "limite-acrescimos" || dirty.level !== "bad") fail("scrub_kept_safe", dirty);
  else pass("scrub_kept_safe");
  const disguised = T.scrubProps({
    tool: "limite-acrescimos",
    level: "texto livre alice@example.com",
    custom_metric: "R$ 1.000.000,00",
  });
  if (Object.prototype.hasOwnProperty.call(disguised, "level") || Object.prototype.hasOwnProperty.call(disguised, "custom_metric")) {
    fail("scrub_disguised_free_text_money", disguised);
  } else pass("scrub_disguised_free_text_money");
  T.track("tool_complete", { tool: "x", email: "should@not", valor: 123, cnpj: "00" });
  const last = dataLayer[dataLayer.length - 1];
  if (last.email || last.valor || last.cnpj) fail("emit_leaked", last);
  else pass("emit_scrubs_before_track");

  T.bindToolLifecycle({ tool: "dynamic-tool" });
  const offer = { getAttribute(name) { return name === "data-tool-to-offer" ? "aditivos-obras-publicas" : ""; } };
  const target = { closest(selector) { return selector === "[data-tool-to-offer]" ? offer : null; } };
  if (typeof documentListeners.click !== "function") fail("dynamic_cta_delegation_missing");
  else {
    documentListeners.click({ target });
    const delegated = dataLayer[dataLayer.length - 1];
    if (delegated.event !== "tool_to_offer" || delegated.offer !== "aditivos-obras-publicas") {
      fail("dynamic_cta_delegation", delegated);
    } else pass("dynamic_cta_delegation");
  }
}

// Content improvements cohort
const cohort = resolve(ROOT, "data/revops/organic-improvements-cohort.json");
if (!existsSync(cohort)) fail("cohort_missing");
else {
  const c = JSON.parse(readFileSync(cohort, "utf8"));
  if (!Array.isArray(c.improvements) || c.improvements.length < 5) fail("cohort_five", c.improvements?.length);
  else pass("cohort_five", c.improvements.length);
}

// Distribution: auto_send stays false. Contact-list size is not a success KPI.
const kit = resolve(ROOT, "data/distribution/radar-outreach-kit.json");
if (!existsSync(kit)) fail("dist_kit");
else {
  const k = JSON.parse(readFileSync(kit, "utf8"));
  if (k.auto_send !== false) fail("no_auto_send");
  else pass("no_auto_send");
  if (!Array.isArray(k.contacts)) fail("contacts_shape");
  else pass("contacts_present_not_kpi", k.contacts.length);
}
const registry = resolve(
  ROOT,
  "data/distribution/assets/radar-nacional-obras-publicas.v1.json",
);
if (!existsSync(registry)) fail("dist_registry");
else {
  const r = JSON.parse(readFileSync(registry, "utf8"));
  if (r.auto_send !== false) fail("registry_no_auto_send");
  else pass("registry_no_auto_send");
}

// Machine recommendations never mint human approvals (registry is the source of truth)
const rec = resolve(ROOT, "docs/editorial/WAVE1-MACHINE-RECOMMENDATIONS.json");
if (!existsSync(rec)) fail("wave1_rec");
else {
  const r = JSON.parse(readFileSync(rec, "utf8"));
  if (r.human_approved_count !== 0) fail("forged_human", r.human_approved_count);
  else pass("wave1_zero_human");
  if (!r.pages?.length) fail("wave1_pages");
  else pass("wave1_pages", r.pages.length);
}

// release-approved: pre-approval is a noop; post first-cohort release is a clean green report
import { execSync } from "child_process";
function parseLastJsonObject(text) {
  const start = text.lastIndexOf("\n{") >= 0 ? text.lastIndexOf("\n{") + 1 : text.indexOf("{");
  if (start < 0) throw new Error("no_json_object");
  return JSON.parse(text.slice(start));
}
const out = execSync("python3 scripts/editorial/release_approved.py", {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
const j = parseLastJsonObject(out);
if (j.valid_human_approved === 0) {
  pass("release_noop_without_human");
  if (!(Array.isArray(j.blocked) ? j.blocked.join(" ") : String(j.blocked || "")).includes("no_valid_human")) {
    fail("release_blocked_msg");
  } else pass("release_blocked_msg");
} else if (j.valid_human_approved === 3 && j.cohort_complete === true && Array.isArray(j.blocked) && j.blocked.length === 0) {
  pass("release_first_cohort_complete", j.released_count);
  const urls = j.gsc_submit_candidates || [];
  const need = [
    "https://confenge.com.br/lei-14133-obras/limite-25-50-aditivo-obra/",
    "https://confenge.com.br/guias-contratos-obras/checklist-pedido-aditivo/",
    "https://confenge.com.br/lei-14133-obras/preco-item-novo-desconto-proposta/",
  ];
  if (need.every((u) => urls.includes(u))) pass("release_gsc_candidates");
  else fail("release_gsc_candidates", urls);
} else {
  fail("release_unexpected_state", JSON.stringify({
    valid_human_approved: j.valid_human_approved,
    cohort_complete: j.cohort_complete,
    blocked: j.blocked,
  }));
}

// pilot audit
const pilot = resolve(ROOT, "docs/pseo/PILOT-AUDIT.json");
if (!existsSync(pilot)) fail("pilot_audit");
else {
  const p = JSON.parse(readFileSync(pilot, "utf8"));
  if (p.total < 10) fail("pilot_count", p.total);
  else pass("pilot_count", p.total);
  const promoted = (p.pages || []).filter((x) => x.action === "promote");
  if (promoted.some((x) => String(x.proposed_final_url || "").includes("/piloto/"))) {
    fail("promote_still_piloto");
  } else pass("promote_not_under_piloto", promoted.length);
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL tool/organic activation checks passed");
