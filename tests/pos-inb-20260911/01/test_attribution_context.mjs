/**
 * POS-INB-20260911/01 — first-touch, cookie-reject, internal UTM, storage-unavailable,
 * server allowlist. Drives shipped script.js + lead-core, not a reimplementation.
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { ROOT, pass, fail, getResults } from "./helpers.mjs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, "netlify/functions/lib/lead-core.cjs"));
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const formSrc = fs.readFileSync(path.join(ROOT, "js/modules/form.js"), "utf8");
const analyticsSrc = fs.readFileSync(path.join(ROOT, "js/modules/analytics.js"), "utf8");
const navSrc = fs.readFileSync(path.join(ROOT, "js/modules/nav.js"), "utf8");

if (!formSrc.includes("Analytics/marketing") && !formSrc.includes("consentimento")) {
  fail("form_consent_comment");
}
if (!formSrc.includes("must not stop this POST") && !formSrc.includes("não impedem") && !formSrc.includes("must not stop")) {
  if (!formSrc.includes("blocked storage") && !formSrc.includes("Request-processing consent")) {
    fail("form_storage_must_not_block");
  }
}
pass("form_states_cookie_reject_does_not_block_post");

if (/confengeTrack\(['"]qualified_lead/.test(analyticsSrc) || /confengeTrack\(['"]pipeline/.test(formSrc)) {
  fail("browser_emits_observed_only");
}
pass("analytics_does_not_admit_qualified_or_pipeline");

{
  const validated = core.validateAndNormalize({
    nome: "QA Attr",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
    origem: "/conteudos/sinapi-desonerado-nao-desonerado/",
    landing_url: "/conteudos/sinapi-desonerado-nao-desonerado/",
    estagio_current_ignored_duplicate: "nope",
    javascript: "alert(1)",
    onerror: "steal",
    fbclid: "drop",
    email_extra: "a@b.com",
  });
  if (!validated.ok) fail("validate", validated);
  if (validated.lead.origem !== "/conteudos/sinapi-desonerado-nao-desonerado/") fail("origem");
  if (validated.lead.javascript || validated.lead.onerror || validated.lead.fbclid || validated.lead.email_extra) {
    fail("unlisted_copied", validated.lead);
  }
  if (!validated.lead.estagio) fail("need_missing");
  pass("server_allowlist_drops_arbitrary");
}

{
  const missing = core.validateAndNormalize({
    nome: "QA Attr",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
  });
  if (!missing.ok) fail("sparse_validate", missing);
  if (missing.lead.origem || missing.lead.utm_source || missing.lead.cta_id || missing.lead.asset_id) {
    fail("invented_context", {
      origem: missing.lead.origem,
      utm: missing.lead.utm_source,
      cta: missing.lead.cta_id,
    });
  }
  pass("absent_context_not_invented");
}

function loadScript({ pathname, search, referrer, session, throwingStorage }) {
  const store = session || {};
  const sessionStorage = throwingStorage
    ? {
        getItem() { throw new Error("storage_unavailable"); },
        setItem() { throw new Error("storage_unavailable"); },
        removeItem() { throw new Error("storage_unavailable"); },
      }
    : {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      };
  const hidden = {};
  const formAttrs = {};
  const form = {
    querySelector(sel) {
      const m = String(sel).match(/^input\[name="([^"]+)"\]$/);
      if (m) return hidden[m[1]] || null;
      if (sel === "#estagio") return { value: "", options: [], dataset: {} };
      if (sel === "#jornada-hidden") return hidden.jornada || { value: "" };
      return null;
    },
    appendChild(el) {
      if (el && el.name) hidden[el.name] = el;
    },
    getAttribute(name) { return formAttrs[name]; },
    setAttribute(name, value) { formAttrs[name] = value; },
    querySelectorAll() { return []; },
  };
  const document = {
    readyState: "complete",
    querySelector: (sel) => {
      if (String(sel).includes("diagnostico-")) return form;
      return null;
    },
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ tagName: "INPUT", type: "", name: "", value: "" }),
    documentElement: { scrollHeight: 2000 },
    addEventListener: () => {},
    body: {
      classList: { remove() {}, add() {} },
      dataset: {},
      getAttribute: () => null,
    },
    referrer: referrer || "",
  };
  const windowObj = {
    dataLayer: [],
    matchMedia: () => ({ matches: false }),
    location: { pathname, search: search || "", hash: "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000099" },
  };
  windowObj.window = windowObj;
  const sandbox = { window: windowObj, document, console, URLSearchParams, sessionStorage };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { sandbox, hidden, store, windowObj };
}

{
  const hop = {};
  loadScript({
    pathname: "/ferramentas/checklist-reequilibrio/",
    search: "?utm_source=gsc&utm_campaign=editorial",
    referrer: "https://www.google.com/",
    session: hop,
  });
  const first = JSON.parse(hop.confenge_pseo_attribution || "{}");
  if (first.utm_source !== "gsc") fail("first_utm", first);
  if (first.landing_url !== "/ferramentas/checklist-reequilibrio/") fail("first_landing", first);
  loadScript({
    pathname: "/",
    search: "?utm_source=nav-internal&utm_campaign=restart",
    referrer: "https://confenge.com.br/ferramentas/checklist-reequilibrio/",
    session: hop,
  });
  const second = JSON.parse(hop.confenge_pseo_attribution || "{}");
  if (second.utm_source !== "gsc") fail("internal_utm_restarted", second);
  if (second.utm_campaign !== "editorial") fail("internal_campaign_restarted", second);
  if (second.landing_url !== "/ferramentas/checklist-reequilibrio/") fail("landing_restarted", second);
  pass("first_touch_survives_internal_utm");
}

{
  const loaded = loadScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    search: "?utm_source=gsc&email=leak@x.com&fbclid=DROP",
    referrer: "https://www.google.com/",
    throwingStorage: true,
  });
  const api = loaded.sandbox.window.confengeAttribution;
  if (!api || typeof api.pickFromSearch !== "function") fail("api_missing");
  const picked = api.pickFromSearch("?utm_source=gsc&email=leak@x.com&fbclid=DROP");
  if (picked.email || picked.fbclid) fail("storage_down_leaked_query", picked);
  if (picked.utm_source !== "gsc") fail("storage_down_lost_utm", picked);
  pass("storage_unavailable_still_reads_allowlisted_url");
}

{
  if (!navSrc.includes("internalReferrer") || !navSrc.includes("mergeFirstTouch")) {
    fail("nav_missing_first_touch");
  }
  const api = loadScript({
    pathname: "/",
    search: "",
    session: {},
  }).sandbox.window.confengeAttribution;
  const frozen = api.mergeFirstTouch(
    { origem: "/ferramentas/x/", utm_source: "gsc", landing_url: "/ferramentas/x/" },
    { origem: "/servicos/", utm_source: "internal", landing_url: "/servicos/", jornada: "projeto" },
    { internalReferrer: true },
  );
  if (frozen.origem !== "/ferramentas/x/") fail("merge_origem", frozen);
  if (frozen.utm_source !== "gsc") fail("merge_utm", frozen);
  if (frozen.jornada !== "projeto") fail("merge_need", frozen);
  pass("need_evolves_origin_frozen");
}

{
  const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const form = home.match(/<form\b[^>]*id="formulario-contato"[\s\S]*?<\/form>/)?.[0] || "";
  if (!form) fail("home_form_missing");
  if (/name="cnpj"|name="cpf"|type="file"/i.test(form)) fail("home_sensitive_required");
  if (!/name="consentimento"/.test(form)) fail("home_consent_missing");
  if (!/name="estagio"/.test(form)) fail("home_need_missing");
  if (/data-[a-z-]+="[^"]*(?:@|\b\d{8,}\b)[^"]*"/.test(form)) fail("home_data_attr_pii");
  pass("home_form_minimum_fields_no_pii_attrs");
}

console.log("POS_INB_01_ATTRIBUTION_OK", JSON.stringify({ tests: getResults().length }));
