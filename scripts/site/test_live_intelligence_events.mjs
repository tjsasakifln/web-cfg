/**
 * Locks the analytics contract for the live-intelligence engine.
 *
 * Two jobs:
 * 1) The seven events are registered, admitted, on the right layer, and the
 *    client map in js/modules/analytics.js is in lockstep with the registry.
 * 2) The props the producer actually emits survive admission, and a CNPJ —
 *    keyed, bare or masked — does not. The second half is the deliberate leak
 *    probe: it asserts the guards bite rather than assuming they do.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const contract = require(path.join(root, "netlify/functions/lib/event-contract.cjs"));
const registry = require(path.join(root, "netlify/functions/lib/event-registry.json"));
const collect = require(path.join(root, "netlify/functions/collect.cjs"));

const PRODUCER = "assets/js/live-intelligence.js";
const EVENTS = {
  intel_view: "page_view",
  company_analysis_start: "engagement",
  company_analysis_complete: "engagement",
  fit_result_shown: "engagement",
  monitor_cta_click: "engagement",
  monitor_request_persisted: "lead",
  deep_dive_request_persisted: "lead",
};
const CNPJ = "11222333000181";
const CNPJ_MASKED = "11.222.333/0001-81";

const results = [];
function pass(name, detail) {
  results.push(name);
  console.log("PASS", name, detail ? JSON.stringify(detail) : "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail ? JSON.stringify(detail) : "");
  process.exit(1);
}

// --- 1. Registry + client lockstep ------------------------------------------
if (registry.schema_version !== "1.3.0") fail("registry_schema_version", registry.schema_version);
const analyticsMod = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
if (!analyticsMod.includes("EVENT_CONTRACT_SCHEMA_VERSION = '1.3.0'")) {
  fail("client_schema_version_drift");
}
pass("schema_version_bumped_in_lockstep");

const producerPath = path.join(root, PRODUCER);
if (!fs.existsSync(producerPath)) fail("producer_missing", PRODUCER);
const producerSrc = fs.readFileSync(producerPath, "utf8");

for (const [name, layer] of Object.entries(EVENTS)) {
  const def = registry.events[name];
  if (!def) fail("event_not_registered", name);
  if (def.layer !== layer) fail("event_layer", { name, got: def.layer, want: layer });
  if (def.owner !== "web-cfg") fail("event_owner", { name, owner: def.owner });
  if (def.schema_version !== "1.0.0") fail("event_schema_version", { name, v: def.schema_version });
  if (!def.producers.includes(PRODUCER)) fail("event_producer", { name, producers: def.producers });
  const wanted = ["netlify/functions/collect.cjs", "netlify/functions/lib/analytics-agg.cjs"];
  if (JSON.stringify(def.consumers) !== JSON.stringify(wanted)) {
    fail("event_consumers", { name, consumers: def.consumers });
  }
  if (!def.semantic || def.semantic.length < 20) fail("event_semantic", { name, s: def.semantic });
  if (!producerSrc.includes(name)) fail("event_not_emitted_by_producer", name);
  if (!contract.admittedNames().includes(name)) fail("event_not_admitted", name);
  if (!contract.clientMaps().admitted[name]) fail("event_missing_from_client_map", name);
  if (!new RegExp(`\\b${name}: 1`).test(analyticsMod)) fail("event_missing_from_analytics_module", name);
  pass(`event_registered_${name}`);
}

// A lead-layer event must not be readable as a qualified lead or pipeline.
const funnel = contract.reconcileFunnel({
  events: [
    { event: "intel_view", path: "/oportunidades/x/" },
    { event: "monitor_cta_click", props: { cta_id: "intel_monitor_company" } },
    { event: "monitor_request_persisted", props: { intent_kind: "MONITOR_COMPANY" } },
    { event: "deep_dive_request_persisted", props: { intent_kind: "REQUEST_DEEP_DIVE" } },
  ],
});
if (funnel.denominators.lead !== 2) fail("lead_denominator", funnel.denominators);
if (funnel.denominators.qualified_lead !== 0 || funnel.denominators.pipeline !== 0) {
  fail("outcome_derived_from_lead", funnel.denominators);
}
pass("lead_layer_does_not_derive_outcome");

// --- 2. The props the producer emits actually survive ------------------------
const EMITTED_PROPS = {
  asset_id: "pe-2026-000412-pav-urbana-chapeco-sc",
  asset_family: "oportunidade-publica",
  route_family: "live-opportunity",
  index_state: "NOINDEX",
  page_path: "/oportunidades/pe-2026-000412-pav-urbana-chapeco-sc/",
  correlation_id: "li-m0abcd1",
  surface_kind: "company",
  cta_id: "intel_monitor_company",
  cta_position: "company_next_action",
  intent_kind: "MONITOR_COMPANY",
  result_state: "PERFIL_ENCONTRADO",
  has_adherent_opportunities: "yes",
};
const admitted = contract.admitEvent({ event: "monitor_cta_click", props: { ...EMITTED_PROPS } });
if (!admitted.ok) fail("emitted_props_rejected", admitted);
for (const key of Object.keys(EMITTED_PROPS)) {
  if (admitted.event.props[key] !== EMITTED_PROPS[key]) {
    fail("emitted_prop_dropped", { key, dropped: admitted.dropped });
  }
}
pass("emitted_props_survive_admission");

// No computed value and no free text may ride along.
const computed = contract.admitEvent({
  event: "fit_result_shown",
  props: { page_path: "/analise-cnpj/", observacao: "empresa com 14 contratos em pavimentação" },
});
if (computed.ok && computed.event.props.observacao != null) fail("free_text_admitted", computed);
pass("free_text_not_admitted");

// --- 3. Deliberate CNPJ leak probe ------------------------------------------
const keyed = contract.admitEvent({
  event: "company_analysis_start",
  props: { page_path: "/analise-cnpj/", cnpj: CNPJ },
});
if (keyed.ok && keyed.event.props.cnpj != null) fail("cnpj_key_admitted", keyed.event.props);
if (!keyed.dropped.includes("cnpj")) fail("cnpj_key_not_reported_dropped", keyed.dropped);
pass("cnpj_key_dropped");

const valued = contract.admitEvent({
  event: "company_analysis_complete",
  props: { page_path: "/analise-cnpj/", result_state: CNPJ },
});
if (valued.ok && valued.event.props.result_state != null) fail("cnpj_value_admitted", valued.event.props);
pass("cnpj_value_dropped");

const maskedCnpj = contract.admitEvent({
  event: "monitor_request_persisted",
  props: { page_path: "/analise-cnpj/", ref: CNPJ_MASKED },
});
if (maskedCnpj.ok && maskedCnpj.event && maskedCnpj.event.props.ref != null) {
  fail("masked_cnpj_admitted", maskedCnpj.event.props);
}
pass("masked_cnpj_rejected");

const before = collect._recent().length;
const res = await collect.handler({
  httpMethod: "POST",
  headers: { "content-type": "application/json", origin: "https://confenge.com.br" },
  body: JSON.stringify({
    events: [
      {
        event: "fit_result_shown",
        props: { page_path: "/analise-cnpj/", cnpj: CNPJ, nota: CNPJ, result_state: "PERFIL_ENCONTRADO" },
        path: "/analise-cnpj/",
      },
    ],
  }),
});
if (res.statusCode !== 202) fail("collect_status", res.statusCode);
const recent = collect._recent().slice(before);
const blob = JSON.stringify(recent);
if (blob.includes(CNPJ) || blob.includes(CNPJ_MASKED)) fail("cnpj_reached_collect_store", blob.slice(0, 300));
pass("cnpj_never_reaches_collect", { stored: recent.length });

// --- 4. Behavioural: run the real producer and inspect what it actually does --
//
// The assertion this replaces was a lexical grep: it only checked that no single
// source *line* mentioned both /cnpj/i and an emit/storage token. Routing the
// CNPJ through an intermediate variable on a different line passed it silently,
// so it never proved anything about dataflow. These tests execute the shipped
// file against a DOM stub and assert on the objects it really produces.

const vm = await import("node:vm");

/** The smallest DOM the producer needs. Every node records what it is given. */
function makeDom({ surface = "company", analysisId = "", withCnpjForm = true } = {}) {
  const byId = new Map();
  const make = (id) => {
    const node = {
      id,
      attrs: new Map(),
      children: [],
      listeners: new Map(),
      textContent: "",
      hidden: true,
      value: "",
      getAttribute: (k) => (node.attrs.has(k) ? node.attrs.get(k) : null),
      setAttribute: (k, v) => node.attrs.set(k, String(v)),
      addEventListener: (name, fn) => node.listeners.set(name, fn),
      appendChild: (child) => { node.children.push(child); return child; },
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      reset: () => {},
      classList: { contains: () => false, add: () => {}, remove: () => {} },
    };
    if (id) byId.set(id, node);
    return node;
  };

  const body = make("body");
  body.attrs.set("data-intel-surface", surface);
  body.attrs.set("data-asset-id", "analise-cnpj");
  body.attrs.set("data-asset-family", "analise-perfil-contratual");
  body.attrs.set("data-route-family", "live-company-analysis");
  body.attrs.set("data-index-state", "NOINDEX");
  if (analysisId) body.attrs.set("data-analysis-id", analysisId);

  for (const id of [
    "analise-status", "resultado", "resultado-titulo", "resultado-explicacao",
    "resultado-corpo", "limitacoes", "resultado-limitacoes", "resultado-disclaimer",
    "proximo-passo", "pedido", "pedido-titulo", "pedido-status",
    "intel-intent-kind", "intel-analysis-id", "intel-cta-id", "intel-nome",
  ]) make(id);
  if (withCnpjForm) {
    make("cnpj-form");
    make("cnpj");
  }
  const leadForm = make("intel-lead-form");
  leadForm.querySelector = (sel) => (sel === "#intel-consentimento" ? { checked: true } : null);

  const document = {
    body,
    getElementById: (id) => byId.get(id) || null,
    createElement: () => make(""),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  return { document, byId, body };
}

/** Run the shipped producer in an isolated context and record everything it does. */
async function runProducer({
  cnpj,
  provideTrack = true,
  dom = makeDom(),
  pathname = "/analise-cnpj/",
  search = "",
} = {}) {
  const tracked = [];
  const fetches = [];
  const navigations = [];
  const window = {
    location: {
      pathname,
      search,
      href: `https://confenge.com.br${pathname}${search}`,
      assign: (url) => navigations.push(String(url)),
    },
    addEventListener: () => {},
  };
  if (provideTrack) {
    window.confengeTrack = (name, props) => tracked.push({ name, props });
  }
  const sandbox = {
    window,
    document: dom.document,
    console,
    FormData: class { constructor() { this.rows = []; } forEach() {} },
    fetch: async (url, init) => {
      fetches.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          analysis_id: "li_aabbccdd-11a2b3c4-55667f88-99aabbcc",
          result_path: "/analise-cnpj/r/?t=li_aabbccdd-11a2b3c4-55667f88-99aabbcc",
          state: "PERFIL_ENCONTRADO",
          titulo: "Perfil contratual público",
          explicacao: "",
          disclaimer: "d",
          categorias: [], faixas: [], geografias: [], compradores: [],
          oportunidades_aderentes: [], dimensoes_da_aderencia: [],
          gaps: [], unknowns: [], limitations: [], perfil: null,
        }),
      };
    },
    setTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(producerSrc, sandbox, { filename: PRODUCER });

  const form = dom.byId.get("cnpj-form");
  if (form && cnpj != null) {
    const input = dom.byId.get("cnpj");
    if (input) input.value = cnpj;
    let defaultPrevented = false;
    const submit = form.listeners.get("submit");
    if (!submit) fail("producer_did_not_attach_submit_handler");
    await submit({ preventDefault: () => { defaultPrevented = true; } });
    return { tracked, fetches, navigations, defaultPrevented, window };
  }
  return { tracked, fetches, navigations, defaultPrevented: false, window };
}

/** Recursively collect every string a payload contains, keys included. */
function allStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) allStrings(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allStrings(v, out);
    }
  }
  return out;
}

const CNPJ_DIGEST = createRequire(import.meta.url)(
  path.join(root, "scripts/conversion/cnpj.cjs"),
).hashCnpj(CNPJ);

// 4a. The analytics payload actually emitted never carries the CNPJ, in any form.
const live = await runProducer({ cnpj: CNPJ_MASKED });
if (!live.tracked.length) fail("producer_emitted_nothing");
for (const { name, props } of live.tracked) {
  for (const text of allStrings(props)) {
    if (text.includes(CNPJ) || text.includes(CNPJ_MASKED) || text.includes(CNPJ_DIGEST)) {
      fail("cnpj_in_emitted_analytics_payload", { name, text });
    }
    if (/^\d{14}$/.test(text)) fail("cnpj_shaped_value_in_analytics_payload", { name, text });
  }
  for (const key of Object.keys(props)) {
    if (/cnpj|cpf|documento/i.test(key)) fail("cnpj_shaped_key_in_analytics_payload", { name, key });
  }
}
pass("emitted_analytics_payload_never_contains_the_cnpj", {
  events: live.tracked.map((e) => e.name),
});

// 4b. The CNPJ goes to exactly one place: the POST body of the analysis request.
if (live.fetches.length !== 1) fail("producer_made_unexpected_requests", live.fetches.length);
const [call] = live.fetches;
if ((call.init.method || "GET").toUpperCase() !== "POST") fail("analysis_request_is_not_post", call.init.method);
if (call.url.includes(CNPJ) || call.url.includes(CNPJ_MASKED) || call.url.includes("?")) {
  fail("cnpj_or_query_in_request_url", call.url);
}
if (!String(call.init.body).includes(CNPJ_MASKED)) fail("cnpj_not_in_request_body", call.init.body);
pass("cnpj_travels_only_in_the_post_body");

// 4c. The producer navigates to the opaque result address, never to a CNPJ URL.
if (live.navigations.length !== 1) fail("producer_did_not_navigate_to_result", live.navigations);
const target = live.navigations[0];
if (!/^\/analise-cnpj\/r\/\?t=li_[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/.test(target)) {
  fail("navigation_target_shape", target);
}
// The address carries an opaque token and nothing else. A query is fine here —
// what must never appear in any URL is the CNPJ, raw, masked or digested.
if (target.includes(CNPJ) || target.includes(CNPJ_MASKED) || target.includes(CNPJ_DIGEST)) {
  fail("cnpj_in_navigation_target", target);
}
if (/\d{8}/.test(target)) fail("digit_run_in_navigation_target", target);
pass("producer_navigates_to_an_opaque_shareable_url", { target });

// 4d. No analytics fallback. With the canonical bus absent the event is dropped,
//     never downgraded to a weaker local filter writing straight to dataLayer.
const noBus = await runProducer({ cnpj: CNPJ_MASKED, provideTrack: false });
if (noBus.window.dataLayer && noBus.window.dataLayer.length) {
  fail("producer_pushed_to_datalayer_without_the_canonical_bus", noBus.window.dataLayer);
}
if ("dataLayer" in noBus.window) fail("producer_created_a_datalayer_fallback");
pass("no_analytics_fallback_path_exists");
// Comments are prose. Scan the executable source only.
const producerCode = producerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
if (/dataLayer/.test(producerCode)) fail("producer_still_references_datalayer");
if (/PII_KEYS/.test(producerCode)) fail("producer_still_has_a_second_pii_filter");
pass("producer_has_one_analytics_policy_not_two");

// 4e. The shell hydrates itself from its own address — the cold-open path.
//     No prior analysis is in memory; the token in the URL is the only state.
const SHELL_TOKEN = "li_aabbccdd-11a2b3c4-55667f88-99aabbcc";
const shell = makeDom({ withCnpjForm: false });
shell.body.attrs.set("data-intel-result-shell", "true");
const hydrated = await runProducer({
  dom: shell,
  cnpj: null,
  pathname: "/analise-cnpj/r/",
  search: `?t=${SHELL_TOKEN}`,
});
await new Promise((resolve) => setImmediate(resolve));
if (hydrated.fetches.length !== 1) fail("shell_did_not_fetch_its_result", hydrated.fetches.length);
const hydrateCall = hydrated.fetches[0];
if ((hydrateCall.init.method || "GET").toUpperCase() !== "GET") {
  fail("shell_hydration_method", hydrateCall.init.method);
}
// The path must stay exactly the allowlisted function route; the opaque token
// rides in the query, where it reveals nothing about the company.
if (!hydrateCall.url.startsWith("/.netlify/functions/live-intelligence-analyze?token=")) {
  fail("shell_hydration_url", hydrateCall.url);
}
if (!hydrateCall.url.includes(SHELL_TOKEN)) fail("shell_hydration_missing_token", hydrateCall.url);
if (hydrateCall.url.includes(CNPJ) || hydrateCall.url.includes(CNPJ_MASKED)) {
  fail("cnpj_in_shell_hydration_url", hydrateCall.url);
}
if (shell.byId.get("intel-analysis-id").value !== SHELL_TOKEN) {
  fail("shell_did_not_seed_the_lead_analysis_id", shell.byId.get("intel-analysis-id").value);
}
if (hydrated.navigations.length) fail("shell_navigated_away", hydrated.navigations);
pass("shell_hydrates_from_its_own_opaque_address", { token_in_query: true });

// A shell address with no valid token asks for nothing at all.
const badShell = makeDom({ withCnpjForm: false });
badShell.body.attrs.set("data-intel-result-shell", "true");
const notHydrated = await runProducer({
  dom: badShell,
  cnpj: null,
  pathname: "/analise-cnpj/r/",
  search: "?t=nao-e-um-token",
});
await new Promise((resolve) => setImmediate(resolve));
if (notHydrated.fetches.length) fail("shell_fetched_on_an_invalid_token", notHydrated.fetches);
pass("shell_with_an_invalid_token_requests_nothing");

// --- 5. Fail-closed markup: the guarantee must not depend on JS running -------
const pageHtml = fs.readFileSync(path.join(root, "analise-cnpj/index.html"), "utf8");
const shellHtml = fs.readFileSync(path.join(root, "analise-cnpj/r/index.html"), "utf8");
let formCount = 0;
for (const [surface, html] of [["analise-cnpj", pageHtml], ["analise-cnpj/r", shellHtml]]) {
  const forms = [...html.matchAll(/<form\b[^>]*>/gi)].map((m) => m[0]);
  if (!forms.length) fail("no_forms_found_on_page", surface);
  formCount += forms.length;
  for (const form of forms) {
    const id = (form.match(/id="([^"]+)"/) || [])[1] || "(sem id)";
    const method = (form.match(/method="([^"]+)"/i) || [])[1] || "";
    const action = (form.match(/action="([^"]+)"/i) || [])[1] || "";
    // A form with no method, or method=get, submits as GET when JS does not run
    // — putting every field, the CNPJ and every contact field included, into the
    // URL, the history entry and the onward Referer. preventDefault() cannot be
    // the privacy guarantee, because it never runs.
    if (method.toLowerCase() !== "post") fail("form_is_not_fail_closed_post", { surface, id, method });
    if (!action || /^javascript:/i.test(action)) {
      fail("form_action_is_not_a_real_endpoint", { surface, id, action });
    }
    if (action.includes("?")) fail("form_action_carries_a_query_string", { surface, id, action });
  }
}
pass("every_form_natively_posts_to_a_real_endpoint", { forms: formCount });

// The shell is one static page serving every result address. It must carry no
// result, no token and no CNPJ of its own.
if (!/data-intel-result-shell="true"/.test(shellHtml)) fail("shell_missing_hydration_marker");
if (/li_[0-9a-f]{8}-/.test(shellHtml)) fail("shell_carries_a_token");
if (shellHtml.includes(CNPJ) || shellHtml.includes(CNPJ_MASKED)) fail("cnpj_in_shell");
const shellRobots = (shellHtml.match(/<meta[^>]*name="robots"[^>]*>/i) || [""])[0];
if (!/content="noindex/i.test(shellRobots)) fail("shell_is_not_noindex", shellRobots);
pass("result_shell_is_static_noindex_and_carries_no_result");

// The shell resolves through the ordinary pretty-URL chain, so there must be no
// redirect rule for it at all. A wildcard rule here would be rejected by the
// host contract (HC_REDIRECT_SPLAT_UNSAFE) and would fail the production nginx
// render, so its absence is the invariant worth pinning.
const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
const shellRules = redirects
  .split("\n")
  .filter((line) => !line.trim().startsWith("#") && line.includes("/analise-cnpj/r/"));
if (shellRules.length) fail("result_shell_should_need_no_redirect_rule", shellRules);
pass("result_address_resolves_as_a_plain_static_page");

if (!/id="cnpj-form"[^>]*action="\/api\/web\/live-intelligence-analyze"/.test(pageHtml)
  && !/action="\/api\/web\/live-intelligence-analyze"[^>]*id="cnpj-form"/.test(pageHtml)) {
  fail("cnpj_form_action_target");
}
pass("cnpj_form_posts_to_the_analyze_endpoint");

// The referrer policy caps what any onward request can carry from this page.
if (!/name="referrer"[^>]*content="same-origin"|content="same-origin"[^>]*name="referrer"/.test(pageHtml)) {
  fail("page_missing_same_origin_referrer_policy");
}
pass("page_declares_a_same_origin_referrer_policy");

// --- 6. The renamed surface prop has no survivors ----------------------------
if (/intel_surface/.test(producerSrc) || /intel_surface/.test(analyticsMod) || /intel_surface/.test(pageHtml)) {
  fail("intel_surface_still_present");
}
if (!producerSrc.includes("surface_kind")) fail("surface_kind_missing_from_producer");
pass("intel_surface_fully_renamed_to_surface_kind");

console.log("LIVE_INTELLIGENCE_EVENTS_OK", JSON.stringify({ tests: results.length }));
