/**
 * Drives shipped attribution allowlist + lead-core pickAttribution.
 * Injects a non-allowlisted query and a PII-looking value; both must be dropped.
 */
import { createRequire } from "module";
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const core = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));

function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exit(1);
}
function pass(name, detail) {
  console.log("PASS", name, detail || "");
}

if (!Array.isArray(core.ATTR_ALLOWLIST) || !core.ATTR_ALLOWLIST.includes("route_family")) {
  fail("allowlist_exported", core.ATTR_ALLOWLIST);
}
pass("allowlist_has_route_family");

const picked = core.pickAttribution({
  utm_source: "gsc",
  route_family: "reequilibrio",
  cta_id: "pillar_hero",
  asset_id: "reequilibrio-obras-publicas",
  correlation_id: "corr-test-001",
  landing_url: "/reequilibrio-obras-publicas/",
  referrer: "https://smartlic.tech/perguntas/indice-reajuste-contrato-publico",
  email: "alice@example.com",
  nome: "Alice",
  arbitrary_debug: "drop-me",
  fbclid: "abc.123",
  gclid: "xyz",
  phone: "+5548999999999",
  utm_source_extra: "nope",
});

if (picked.arbitrary_debug || picked.fbclid || picked.gclid || picked.email || picked.nome || picked.phone) {
  fail("dropped_unlisted_or_pii", picked);
}
if (picked.utm_source !== "gsc" || picked.route_family !== "reequilibrio") {
  fail("kept_allowlisted", picked);
}

const analysisPicked = core.pickAttribution({
  analysis_id: "cand-preco-01",
  evidence_pack_version: "1.0",
  asset_family: "analise-tecnica-contrato-publico",
  correlation_id: "corr-analysis-1",
  query_class: "analise_tecnica_contrato",
  referrer: "https://www.google.com/search?q=bdi",
  email: "leak@x.com",
  nome: "Alice",
  cnpj: "52407089000109",
});
if (analysisPicked.email || analysisPicked.nome || analysisPicked.cnpj) fail("analysis_pii_leaked", analysisPicked);
if (analysisPicked.analysis_id !== "cand-preco-01") fail("analysis_id", analysisPicked);
if (analysisPicked.evidence_pack_version !== "1.0") fail("evidence_pack_version", analysisPicked);
if (analysisPicked.asset_family !== "analise-tecnica-contrato-publico") fail("asset_family", analysisPicked);
if (analysisPicked.correlation_id !== "corr-analysis-1") fail("analysis_correlation", analysisPicked);
if (analysisPicked.query_class !== "analise_tecnica_contrato") fail("query_class", analysisPicked);
if (analysisPicked.referrer !== "https://www.google.com/search") fail("referrer_query_must_be_stripped", analysisPicked);
pass("pickAttribution_keeps_analysis_family");
if (picked.correlation_id !== "corr-test-001") fail("correlation", picked);
pass("pickAttribution_drops_unlisted_and_pii");

const piiBlocked = core.sanitizeAttributionValue("ceo@empresa.com.br");
if (piiBlocked) fail("sanitize_email", piiBlocked);
const phoneBlocked = core.sanitizeAttributionValue("+5548988344559");
if (phoneBlocked) fail("sanitize_phone", phoneBlocked);
const uuidKept = core.sanitizeAttributionValue(
  "00000000-0000-4000-8000-000000000099",
  180,
  "correlation_id",
);
if (uuidKept !== "00000000-0000-4000-8000-000000000099") {
  fail("sanitize_keeps_uuid_correlation", uuidKept);
}
if (core.looksLikePii("00000000-0000-4000-8000-000000000099", "correlation_id")) {
  fail("looksLikePii_uuid", "dropped generated uuid");
}
pass("sanitize_blocks_pii");

const validated = core.validateAndNormalize({
  nome: "QA Attr",
  telefone: "48988344559",
  estagio: "problema urgente em contrato",
  jornada: "contrato",
  consentimento: "on",
  route_family: "margin-defense",
  cta_id: "offer_hero",
  asset_id: "defesa-margem-contratos-publicos",
  correlation_id: "corr-lead-1",
  landing_url: "/defesa-margem-contratos-publicos/",
  email_extra: "should-not-copy@x.com",
});
if (!validated.ok || validated.lead.route_family !== "margin-defense") {
  fail("validate_route_family", validated);
}
if (validated.lead.email_extra) fail("validate_leaked_unlisted", validated.lead);
if (validated.lead.landing_page !== "/defesa-margem-contratos-publicos/") {
  fail("landing_url_alias", validated.lead);
}
pass("validateAndNormalize_persists_allowlisted_attr");

const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
if (!script.includes("route_family") || !script.includes("correlation_id")) {
  fail("script_js_missing_attr_keys", "rebuild script.js from modules");
}
if (!script.includes("confengeAttribution")) {
  fail("script_js_missing_export", "window.confengeAttribution");
}

const document = {
  readyState: "complete",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: { scrollHeight: 2000 },
  addEventListener: () => {},
  body: {
    classList: { remove() {}, add() {} },
    dataset: {
      routeFamily: "reequilibrio",
      assetId: "reequilibrio-obras-publicas",
      ctaId: "pillar_hero",
    },
  },
  referrer: "https://smartlic.tech/glossario/reajuste",
};
const store = {};
const sessionStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
const windowObj = {
  dataLayer: [],
  matchMedia: () => ({ matches: false }),
  location: {
    pathname: "/reequilibrio-obras-publicas/",
    search: "?utm_source=gsc&fbclid=DROP&email=leak@x.com&route_family=reequilibrio&correlation_id=from-url",
    hash: "",
  },
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

const api = sandbox.window.confengeAttribution;
if (!api || typeof api.pickFromSearch !== "function") {
  fail("confengeAttribution_missing", api);
}
const fromSearch = api.pickFromSearch(windowObj.location.search);
if (fromSearch.fbclid || fromSearch.email) fail("browser_kept_unlisted", fromSearch);
if (fromSearch.utm_source !== "gsc") fail("browser_utm", fromSearch);
if (fromSearch.email) fail("browser_email_from_query", fromSearch);
pass("browser_pickFromSearch_allowlist");

const persisted = JSON.parse(store.confenge_pseo_attribution || "{}");
if (persisted.fbclid || persisted.email) fail("session_leaked_unlisted", persisted);
if (!persisted.correlation_id) fail("session_missing_correlation", persisted);
if (persisted.route_family !== "reequilibrio") fail("session_route_family", persisted);
pass("session_persists_allowlisted_only");

// --- two-load hop: pillar → home form (#contato). Drives shipped script.js twice. ---
const hopStore = {};
const hopSession = {
  getItem: (k) => hopStore[k] || null,
  setItem: (k, v) => {
    hopStore[k] = String(v);
  },
  removeItem: (k) => {
    delete hopStore[k];
  },
};
const GENERATED_UUID = "00000000-0000-4000-8000-000000000099";

function loadShippedScript({
  pathname,
  search,
  hash,
  dataset,
  withForm,
  session = hopSession,
  referrer = "",
  bodyAttrs = {},
  pseoEvents = [],
}) {
  const hidden = {};
  const formAttrs = {};
  const form = withForm
    ? {
        querySelector(sel) {
          const m = String(sel).match(/^input\[name="([^"]+)"\]$/);
          if (m) return hidden[m[1]] || null;
          return null;
        },
        appendChild(el) {
          if (el && el.name) hidden[el.name] = el;
        },
        getAttribute(name) {
          return formAttrs[name];
        },
        setAttribute(name, value) {
          formAttrs[name] = value;
        },
      }
    : null;
  const docListeners = [];
  const document = {
    readyState: "complete",
    querySelector: (sel) => {
      if (String(sel).includes("diagnostico-")) return form;
      return null;
    },
    querySelectorAll: (sel) => {
      if (String(sel) === "[data-pseo-event]") return pseoEvents;
      return [];
    },
    getElementById: () => null,
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), type: "", name: "", value: "" }),
    documentElement: { scrollHeight: 2000 },
    addEventListener: (type, fn, opts) => {
      docListeners.push({ type, fn, opts });
    },
    body: {
      classList: { remove() {}, add() {} },
      dataset: dataset || {},
      getAttribute(name) {
        if (name === "data-pseo-page-id") return bodyAttrs.pseoPageId || "";
        if (name === "data-pseo-page-type") return bodyAttrs.pseoPageType || "";
        if (name === "data-offer-id") return bodyAttrs.offerId || "";
        if (name === "data-lead-success") return bodyAttrs.leadSuccess || null;
        return null;
      },
    },
    referrer: referrer || "",
  };
  const windowObj = {
    dataLayer: [],
    matchMedia: () => ({ matches: false }),
    location: { pathname, search: search || "", hash: hash || "" },
    document,
    addEventListener: () => {},
    innerHeight: 800,
    scrollY: 0,
    sessionStorage: session,
    crypto: { randomUUID: () => GENERATED_UUID },
  };
  windowObj.window = windowObj;
  const sandbox = { window: windowObj, document, console, URLSearchParams, sessionStorage: session };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { sandbox, hidden, windowObj, formAttrs, docListeners, session };
}

const first = loadShippedScript({
  pathname: "/reequilibrio-obras-publicas/",
  search: "",
  hash: "",
  dataset: {
    routeFamily: "reequilibrio",
    assetId: "reequilibrio-obras-publicas",
    ctaId: "pillar_hero",
  },
  withForm: false,
});
if (!first.sandbox.window.confengeAttribution) fail("hop1_api", "missing confengeAttribution");
const afterPillar = JSON.parse(hopStore.confenge_pseo_attribution || "{}");
if (afterPillar.route_family !== "reequilibrio") fail("hop1_route_family", afterPillar);
if (afterPillar.asset_id !== "reequilibrio-obras-publicas") fail("hop1_asset_id", afterPillar);
if (afterPillar.cta_id !== "pillar_hero") fail("hop1_cta_id", afterPillar);
if (afterPillar.landing_url !== "/reequilibrio-obras-publicas/") fail("hop1_landing_url", afterPillar);
if (afterPillar.correlation_id !== GENERATED_UUID) {
  fail("hop1_generated_correlation_id", afterPillar.correlation_id);
}
pass("hop1_pillar_first_touch", { correlation_id: afterPillar.correlation_id });

const second = loadShippedScript({
  pathname: "/",
  search: "",
  hash: "#contato",
  dataset: {},
  withForm: true,
});
const afterHome = JSON.parse(hopStore.confenge_pseo_attribution || "{}");
if (afterHome.route_family !== "reequilibrio") fail("hop2_route_family_wiped", afterHome);
if (afterHome.asset_id !== "reequilibrio-obras-publicas") fail("hop2_asset_id_wiped", afterHome);
if (afterHome.cta_id !== "pillar_hero") fail("hop2_cta_id_wiped", afterHome);
if (afterHome.landing_url !== "/reequilibrio-obras-publicas/") fail("hop2_landing_url_rewritten", afterHome);
if (afterHome.correlation_id !== GENERATED_UUID) fail("hop2_correlation_id", afterHome);
if (afterHome.landing_url === "/") fail("hop2_landing_became_home", afterHome);
const hid = second.hidden;
if (!hid.route_family || hid.route_family.value !== "reequilibrio") {
  fail("hop2_form_route_family", hid.route_family);
}
if (!hid.landing_url || hid.landing_url.value !== "/reequilibrio-obras-publicas/") {
  fail("hop2_form_landing_url", hid.landing_url);
}
if (!hid.correlation_id || hid.correlation_id.value !== GENERATED_UUID) {
  fail("hop2_form_correlation_id", hid.correlation_id);
}
if (!hid.asset_id || hid.asset_id.value !== "reequilibrio-obras-publicas") {
  fail("hop2_form_asset_id", hid.asset_id);
}
if (!hid.cta_id || hid.cta_id.value !== "pillar_hero") {
  fail("hop2_form_cta_id", hid.cta_id);
}
const visitSessionId = first.sandbox.window.confengeSessionId();
if (!/^sess-[0-9a-f]{27}$/.test(visitSessionId)) {
  fail("hop_session_id_shape", visitSessionId);
}
if (!hid.session_id || hid.session_id.value !== visitSessionId) {
  fail("hop2_form_session_id", hid.session_id);
}
pass("hop2_home_form_keeps_first_touch");

// --- click interceptor: <a data-origem data-tema data-journey href="/#contato"> → session → form ---
const clickStore = {};
const clickSession = {
  getItem: (k) => clickStore[k] || null,
  setItem: (k, v) => {
    clickStore[k] = String(v);
  },
  removeItem: (k) => {
    delete clickStore[k];
  },
};
const articlePage = loadShippedScript({
  pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
  search: "",
  hash: "",
  dataset: {},
  withForm: false,
  session: clickSession,
});
const clickFns = articlePage.docListeners.filter((l) => l.type === "click").map((l) => l.fn);
if (!clickFns.length) fail("click_interceptor_not_registered", articlePage.docListeners);
const anchor = {
  href: "/#contato",
  dataset: {
    origem: "/conteudos/sinapi-desonerado-nao-desonerado/",
    tema: "SINAPI desonerado",
    journey: "edital",
    segmentKey: "pavimentacao-infraestrutura-viaria",
  },
  closest(sel) {
    return String(sel).includes("a[href]") ? this : null;
  },
};
clickFns.forEach((fn) => fn({ target: anchor }));
const afterClick = JSON.parse(clickStore.confenge_pseo_attribution || "{}");
if (afterClick.origem !== "/conteudos/sinapi-desonerado-nao-desonerado/") {
  fail("click_origem", afterClick);
}
if (afterClick.tema !== "SINAPI desonerado") fail("click_tema", afterClick);
if (afterClick.jornada !== "edital") fail("click_jornada_dropped_by_writeStoredPseo", afterClick);
if (afterClick.archetype !== "pavimentacao-infraestrutura-viaria") {
  fail("click_segment_key_dropped_instead_of_mapping_to_archetype", afterClick);
}
pass("click_stores_origem_tema_jornada", {
  origem: afterClick.origem,
  tema: afterClick.tema,
  jornada: afterClick.jornada,
});

const homeAfterClick = loadShippedScript({
  pathname: "/",
  search: "",
  hash: "#contato",
  dataset: {},
  withForm: true,
  session: clickSession,
});
const homeSession = JSON.parse(clickStore.confenge_pseo_attribution || "{}");
if (homeSession.jornada !== "edital") fail("home_session_jornada_wiped", homeSession);
if (homeSession.origem !== "/conteudos/sinapi-desonerado-nao-desonerado/") {
  fail("home_session_origem_wiped", homeSession);
}
if (homeSession.tema !== "SINAPI desonerado") fail("home_session_tema_wiped", homeSession);
if (homeSession.archetype !== "pavimentacao-infraestrutura-viaria") {
  fail("home_session_archetype_wiped", homeSession);
}
const clickHid = homeAfterClick.hidden;
if (!clickHid.origem || clickHid.origem.value !== "/conteudos/sinapi-desonerado-nao-desonerado/") {
  fail("click_form_origem", clickHid.origem);
}
if (!clickHid.jornada || clickHid.jornada.value !== "edital") {
  fail("click_form_jornada", clickHid.jornada);
}
if (!clickHid.tema || clickHid.tema.value !== "SINAPI desonerado") {
  fail("click_form_tema", clickHid.tema);
}
if (!clickHid.archetype || clickHid.archetype.value !== "pavimentacao-infraestrutura-viaria") {
  fail("click_form_archetype", clickHid.archetype);
}
if (homeAfterClick.formAttrs.action !== "/obrigado-edital") {
  fail("click_form_action_not_edital", homeAfterClick.formAttrs);
}
pass("click_anchor_reaches_home_form_hiddens");

const apiMerge = first.sandbox.window.confengeAttribution;
if (!apiMerge || typeof apiMerge.mergeFirstTouch !== "function") {
  fail("mergeFirstTouch_export", apiMerge);
}
const frozen = apiMerge.mergeFirstTouch(
  { origem: "/ferramentas/x/", utm_source: "gsc", landing_url: "/ferramentas/x/" },
  { origem: "/servicos/", utm_source: "internal", landing_url: "/servicos/", jornada: "projeto" },
  { internalReferrer: true },
);
if (frozen.origem !== "/ferramentas/x/") fail("merge_origem_overwritten", frozen);
if (frozen.utm_source !== "gsc") fail("merge_utm_restarted", frozen);
if (frozen.landing_url !== "/ferramentas/x/") fail("merge_landing_overwritten", frozen);
if (frozen.jornada !== "projeto") fail("merge_need_not_evolved", frozen);
pass("mergeFirstTouch_freezes_origin_allows_need");

const utmHopStore = {};
const utmSession = {
  getItem: (k) => utmHopStore[k] || null,
  setItem: (k, v) => {
    utmHopStore[k] = String(v);
  },
  removeItem: (k) => {
    delete utmHopStore[k];
  },
};
loadShippedScript({
  pathname: "/ferramentas/checklist-reequilibrio/",
  search: "?utm_source=gsc&utm_campaign=editorial",
  hash: "",
  dataset: {},
  withForm: false,
  session: utmSession,
  referrer: "https://www.google.com/",
});
const afterTool = JSON.parse(utmHopStore.confenge_pseo_attribution || "{}");
if (afterTool.utm_source !== "gsc") fail("utm_first_touch", afterTool);
if (afterTool.landing_url !== "/ferramentas/checklist-reequilibrio/") fail("utm_landing", afterTool);
loadShippedScript({
  pathname: "/",
  search: "?utm_source=nav-internal&utm_campaign=restart",
  hash: "#contato",
  dataset: {},
  withForm: true,
  session: utmSession,
  referrer: "https://confenge.com.br/ferramentas/checklist-reequilibrio/",
});
const afterInternal = JSON.parse(utmHopStore.confenge_pseo_attribution || "{}");
if (afterInternal.utm_source !== "gsc") fail("internal_utm_restarted", afterInternal);
if (afterInternal.utm_campaign !== "editorial") fail("internal_utm_campaign_restarted", afterInternal);
if (afterInternal.landing_url !== "/ferramentas/checklist-reequilibrio/") {
  fail("internal_landing_restarted", afterInternal);
}
pass("internal_nav_does_not_restart_utm_or_origin");

const toolToPseoStore = {};
const toolToPseoSession = {
  getItem: (k) => toolToPseoStore[k] || null,
  setItem: (k, v) => {
    toolToPseoStore[k] = String(v);
  },
  removeItem: (k) => {
    delete toolToPseoStore[k];
  },
};
loadShippedScript({
  pathname: "/ferramentas/checklist-reequilibrio/",
  search: "",
  hash: "",
  dataset: {},
  withForm: false,
  session: toolToPseoSession,
  referrer: "https://www.google.com/",
});
const afterToolLanding = JSON.parse(toolToPseoStore.confenge_pseo_attribution || "{}");
if (afterToolLanding.landing_url !== "/ferramentas/checklist-reequilibrio/") {
  fail("tool_landing_missing", afterToolLanding);
}
const pseoCta = {
  listeners: {},
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  },
  getAttribute(name) {
    if (name === "data-pseo-event") return "pseo_related_page_click";
    if (name === "data-cta-position") return "mid";
    if (name === "href") return "/#contato";
    return "";
  },
};
loadShippedScript({
  pathname: "/inteligencia/cenarios/referencia-sinapi-sicro-margem/",
  search: "",
  hash: "",
  dataset: {},
  withForm: false,
  session: toolToPseoSession,
  referrer: "https://confenge.com.br/ferramentas/checklist-reequilibrio/",
  bodyAttrs: {
    pseoPageId: "referencia-sinapi-sicro-margem",
    pseoPageType: "cenario",
  },
  pseoEvents: [pseoCta],
});
const afterPseoLoad = JSON.parse(toolToPseoStore.confenge_pseo_attribution || "{}");
if (afterPseoLoad.landing_url !== "/ferramentas/checklist-reequilibrio/") {
  fail("pseo_load_rewrote_landing", afterPseoLoad);
}
if (afterPseoLoad.origem !== "/ferramentas/checklist-reequilibrio/") {
  fail("pseo_load_origem_became_current_path", afterPseoLoad);
}
if (typeof pseoCta.listeners.click !== "function") {
  fail("pseo_click_listener_missing", Object.keys(pseoCta.listeners));
}
pseoCta.listeners.click();
const afterPseoClick = JSON.parse(toolToPseoStore.confenge_pseo_attribution || "{}");
if (afterPseoClick.landing_url !== "/ferramentas/checklist-reequilibrio/") {
  fail("pseo_click_rewrote_landing", afterPseoClick);
}
if (afterPseoClick.origem !== "/ferramentas/checklist-reequilibrio/") {
  fail("pseo_click_origem_became_current_path", afterPseoClick);
}
if (afterPseoClick.origem === "/inteligencia/cenarios/referencia-sinapi-sicro-margem/") {
  fail("pseo_click_used_intermediate_page_as_origin", afterPseoClick);
}
pass("tool_to_pseo_keeps_first_touch_origem", {
  origem: afterPseoClick.origem,
  landing_url: afterPseoClick.landing_url,
});

{
  const throwing = {
    getItem() { throw new Error("storage_unavailable"); },
    setItem() { throw new Error("storage_unavailable"); },
    removeItem() { throw new Error("storage_unavailable"); },
  };
  const loaded = loadShippedScript({
    pathname: "/ferramentas/checklist-reequilibrio/",
    search: "?utm_source=gsc&email=leak@x.com",
    hash: "",
    dataset: {},
    withForm: true,
    session: throwing,
    referrer: "https://www.google.com/",
  });
  const api = loaded.sandbox.window.confengeAttribution;
  const picked = api.pickFromSearch("?utm_source=gsc&email=leak@x.com&fbclid=DROP");
  if (picked.email || picked.fbclid) fail("pos_inb_01_storage_down_query", picked);
  if (picked.utm_source !== "gsc") fail("pos_inb_01_storage_down_utm", picked);
  pass("pos_inb_01_storage_unavailable_still_allowlists");
}

// --- BOFU-FECHAMENTO-20260919 (MEDICAO-01): Google -> artigo -> formulario do
// pilar. `referrer` e first-touch: o segundo salto (referrer interno) nao pode
// substituir o referrer externo guardado, nem no sessionStorage nem no campo
// oculto. O servidor (deriveOriginClass, inalterado) tem de classificar a
// jornada como search_organic; antes classificava direct_or_unknown.
{
  const twoHopStore = {};
  const twoHopSession = {
    getItem: (k) => twoHopStore[k] || null,
    setItem: (k, v) => { twoHopStore[k] = String(v); },
    removeItem: (k) => { delete twoHopStore[k]; },
  };
  loadShippedScript({
    pathname: "/conteudos/sinapi-desonerado-nao-desonerado/",
    search: "",
    hash: "",
    dataset: {},
    withForm: false,
    session: twoHopSession,
    referrer: "https://www.google.com/",
  });
  const afterArticle = JSON.parse(twoHopStore.confenge_pseo_attribution || "{}");
  if (afterArticle.referrer !== "https://www.google.com/") fail("two_hop_article_referrer", afterArticle);
  const pillar = loadShippedScript({
    pathname: "/medicoes-glosas-obras-publicas/",
    search: "",
    hash: "#captura-pilar",
    dataset: { routeFamily: "medicoes-glosas", assetId: "medicoes-glosas-obras-publicas" },
    withForm: true,
    session: twoHopSession,
    referrer: "https://confenge.com.br/conteudos/sinapi-desonerado-nao-desonerado/",
  });
  const afterPillar = JSON.parse(twoHopStore.confenge_pseo_attribution || "{}");
  if (afterPillar.referrer !== "https://www.google.com/") fail("two_hop_session_referrer_overwritten", afterPillar);
  const hiddenReferrer = pillar.hidden.referrer ? pillar.hidden.referrer.value : "";
  if (hiddenReferrer !== "https://www.google.com/") fail("two_hop_hidden_referrer_internal", hiddenReferrer);
  const twoHop = core.validateAndNormalize({
    nome: "QA Attr",
    telefone: "48988344559",
    estagio: "problema urgente em contrato",
    jornada: "contrato",
    consentimento: "on",
    ...core.pickAttribution({ referrer: hiddenReferrer, route_family: "medicoes-glosas" }),
  });
  if (!twoHop.ok) fail("two_hop_validate", twoHop);
  if (twoHop.lead.origin_class !== "search_organic") {
    fail("two_hop_organic_journey_classified_as", twoHop.lead.origin_class);
  }
  pass("two_hop_organic_journey_search_organic", { referrer: hiddenReferrer });

  // Um pouso direto (sem referrer) seguido de navegacao interna continua sem
  // credito: o referrer interno nao vira referrer guardado.
  const directStore = {};
  const directSession = {
    getItem: (k) => directStore[k] || null,
    setItem: (k, v) => { directStore[k] = String(v); },
    removeItem: (k) => { delete directStore[k]; },
  };
  loadShippedScript({ pathname: "/servicos/", search: "", hash: "", dataset: {}, withForm: false, session: directSession, referrer: "" });
  const direct = loadShippedScript({
    pathname: "/",
    search: "",
    hash: "#contato",
    dataset: {},
    withForm: true,
    session: directSession,
    referrer: "https://confenge.com.br/servicos/",
  });
  const directStored = JSON.parse(directStore.confenge_pseo_attribution || "{}");
  if (directStored.referrer) fail("direct_internal_referrer_stored", directStored);
  if (direct.hidden.referrer && direct.hidden.referrer.value) fail("direct_internal_referrer_hidden", direct.hidden.referrer.value);
  pass("direct_then_internal_keeps_unknown");
}

// --- BOFU-FECHAMENTO-20260919 (A-05): a ferramenta de prontidao pousa no
// formulario da home com o recorte na URL. jornada/tema/origem ja eram lidos;
// intent_family passa a persistir na sessao e nos campos ocultos. need_code
// NAO pode entrar em PSEO_ATTR_KEYS: form.js POSTa todos os campos ocultos
// (FormData, sem filtro) e, no servidor, adaptive-intake.isAdaptivePayload
// desvia qualquer payload com need_code para a triagem adaptativa (422/503),
// derrubando o lead inteiro. O payload validado aqui e o equivalente ao
// FormData real: TODOS os campos ocultos materializados pelo bundle.
const toolSearch = "?jornada=obra&tema=Registro%20do%20constru%C3%ADdo&origem=%2Fferramentas%2Fprontidao-tecnica-obra-privada%2F&need_code=obra_edificacao_ou_documentacao&intent_family=documentar_as_built_regularizar";
const HOME_LEAD_BASE = Object.freeze({
  nome: "QA Attr",
  telefone: "48988344559",
  estagio: "obra ou imóvel para inspecionar ou documentar",
  consentimento: "on",
});
const hiddenAsFormData = (hidden) => Object.fromEntries(
  Object.entries(hidden).map(([name, el]) => [name, el && el.value != null ? String(el.value) : ""]),
);
{
  const toolStore = {};
  const toolSession = {
    getItem: (k) => toolStore[k] || null,
    setItem: (k, v) => { toolStore[k] = String(v); },
    removeItem: (k) => { delete toolStore[k]; },
  };
  const landing = loadShippedScript({
    pathname: "/",
    search: toolSearch,
    hash: "#contato",
    dataset: {},
    withForm: true,
    session: toolSession,
    referrer: "https://confenge.com.br/ferramentas/prontidao-tecnica-obra-privada/",
  });
  const h = landing.hidden;
  // Equivalente ao FormData do navegador: campos visiveis + TODOS os ocultos.
  const posted = { ...HOME_LEAD_BASE, ...hiddenAsFormData(h) };
  const validated = core.validateAndNormalize(posted);
  if (!validated.ok) fail("tool_formdata_rejected_by_server", { status: validated.status, error: validated.error, posted_keys: Object.keys(posted) });
  const stored = JSON.parse(toolStore.confenge_pseo_attribution || "{}");
  if ("need_code" in stored) fail("tool_need_code_persisted_in_session", stored);
  if (stored.intent_family !== "documentar_as_built_regularizar") fail("tool_intent_family_not_persisted", stored);
  if (stored.jornada !== "obra") fail("tool_jornada", stored);
  if (stored.tema !== "Registro do construído") fail("tool_tema", stored);
  if (h.need_code) fail("tool_hidden_need_code_materialized", h.need_code);
  if (!h.intent_family || h.intent_family.value !== "documentar_as_built_regularizar") fail("tool_hidden_intent_family", h.intent_family);
  if (!h.jornada || h.jornada.value !== "obra") fail("tool_hidden_jornada", h.jornada);
  if (!h.tema || h.tema.value !== "Registro do construído") fail("tool_hidden_tema", h.tema);
  if (!h.origem || h.origem.value !== "/ferramentas/prontidao-tecnica-obra-privada/") fail("tool_hidden_origem", h.origem);
  if (landing.formAttrs.action !== "/obrigado") fail("tool_journey_action", landing.formAttrs);
  if (validated.lead.tema !== "Registro do construído") fail("tool_lead_tema", validated.lead);
  if (validated.lead.origem !== "/ferramentas/prontidao-tecnica-obra-privada/") fail("tool_lead_origem", validated.lead);
  pass("tool_context_reaches_home_form", { tema: validated.lead.tema, origem: validated.lead.origem, posted: Object.keys(posted).length });
}

// Invariante: nenhuma chave de PSEO_ATTR_KEYS (todas viram campo oculto e vao
// no POST de todo formulario da sessao) pode derrubar um lead valido da home.
// Cobre o conjunto inteiro de gatilhos de adaptive-intake.isAdaptivePayload
// (need_code, intake_version, intake_contract_version, form-name, intake_mode
// e a flag do intake), nao so a chave que causou o defeito.
{
  const probe = loadShippedScript({ pathname: "/", search: "", hash: "", dataset: {}, withForm: false, session: {
    getItem: () => null, setItem() {}, removeItem() {},
  } });
  const allowlist = probe.sandbox.window.confengeAttribution && probe.sandbox.window.confengeAttribution.ALLOWLIST;
  if (!Array.isArray(allowlist) || allowlist.length < 10) fail("pseo_allowlist_exposed", allowlist);
  const ADAPTIVE_TRIGGERS = ["need_code", "intake_version", "intake_contract_version", "intake_mode", "form-name", "adaptive_intake"];
  for (const trigger of ADAPTIVE_TRIGGERS) {
    if (allowlist.includes(trigger)) fail(`pseo_allowlist_contains_adaptive_trigger_${trigger}`, allowlist);
  }
  const broken = [];
  for (const key of allowlist) {
    const sample = key.endsWith("_url") || key === "referrer" ? "https://www.google.com/" : `qa_${key.replace(/[^a-z0-9]/gi, "_")}`;
    const out = core.validateAndNormalize({ ...HOME_LEAD_BASE, jornada: "obra", [key]: sample });
    if (!out.ok) broken.push({ key, status: out.status, error: out.error });
  }
  if (broken.length) fail("pseo_allowlist_key_rejects_home_lead", broken);
  pass("pseo_allowlist_keys_keep_home_lead_ok", { keys: allowlist.length });
}

{
  const sparse = core.validateAndNormalize({
    nome: "QA Attr",
    telefone: "48988344559",
    estagio: "projeto, revisão ou compatibilização",
    consentimento: "on",
  });
  if (!sparse.ok) fail("pos_inb_01_sparse", sparse);
  if (sparse.lead.origem || sparse.lead.utm_source || sparse.lead.cta_id) {
    fail("pos_inb_01_invented_context", sparse.lead);
  }
  pass("pos_inb_01_absent_context_not_invented");
}

console.log("OK attribution-allowlist");
